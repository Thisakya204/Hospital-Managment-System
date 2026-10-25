const path = require('path');
const fs = require('fs');

let mssqlDriver = null;
let useMssql = false;
let poolPromise = null;
let sqliteDb = null;

// Determine if we should attempt MS SQL Server
const isExplicitSqlite = process.env.DB_ENGINE === 'sqlite';
const isWindows = process.platform === 'win32';

if (!isExplicitSqlite && isWindows) {
  try {
    mssqlDriver = require('mssql/msnodesqlv8');
  } catch (err) {
    mssqlDriver = null;
  }
}

const mssqlConfig = {
  connectionString: process.env.MSSQL_CONNECTION_STRING || 'Driver={ODBC Driver 17 for SQL Server};Server=.\\SQLEXPRESS;Database=HospitalManagementDB;Trusted_Connection=yes;'
};

// SQLite setup
const sqlite3 = require('sqlite3').verbose();
let dbFilePath = process.env.SQLITE_PATH || path.join(__dirname, 'hms.db');

if (process.env.VERCEL) {
  const tmpDbPath = path.join('/tmp', 'hms.db');
  try {
    if (!fs.existsSync(tmpDbPath)) {
      const sourceDb = path.join(__dirname, 'hms.db');
      if (fs.existsSync(sourceDb)) {
        fs.copyFileSync(sourceDb, tmpDbPath);
      }
    }
    dbFilePath = tmpDbPath;
  } catch (e) {
    console.warn('Vercel /tmp copy warning:', e);
  }
}

function getSqliteDb() {
  if (!sqliteDb) {
    sqliteDb = new sqlite3.Database(dbFilePath, (err) => {
      if (err) {
        console.error('❌ Failed to open SQLite database:', err);
      }
    });
  }
  return sqliteDb;
}

// Convert SQLite queries to MS SQL Server
function processQueryForMssql(sqlStr, params = []) {
  let transformedSql = sqlStr;

  if (/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i.test(transformedSql)) {
    const tableName = transformedSql.match(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i)[1];
    transformedSql = transformedSql.replace(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+\w+/i, `IF OBJECT_ID('dbo.${tableName}', 'U') IS NULL CREATE TABLE dbo.${tableName}`);
    transformedSql = transformedSql.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/ig, 'INT IDENTITY(1,1) PRIMARY KEY');
    transformedSql = transformedSql.replace(/DATETIME\s+DEFAULT\s+CURRENT_TIMESTAMP/ig, 'DATETIME DEFAULT GETDATE()');
    transformedSql = transformedSql.replace(/TEXT/ig, 'NVARCHAR(MAX)');
  }

  let paramIndex = 1;
  const paramNames = [];
  transformedSql = transformedSql.replace(/\?/g, () => {
    const name = `val${paramIndex++}`;
    paramNames.push(name);
    return `@${name}`;
  });

  return { transformedSql, paramNames };
}

// Convert MS SQL queries to SQLite syntax
function processQueryForSqlite(sqlStr) {
  let s = sqlStr;

  // SELECT TOP N -> SELECT ... LIMIT N
  const topMatch = s.match(/SELECT\s+TOP\s+(\d+)\s+([\s\S]+)/i);
  if (topMatch) {
    s = `SELECT ${topMatch[2]} LIMIT ${topMatch[1]}`;
  }

  // Remove dbo.
  s = s.replace(/dbo\./gi, '');

  // Date replacements
  s = s.replace(/CAST\(GETDATE\(\)\s+AS\s+DATE\)/gi, "DATE('now')");
  s = s.replace(/GETDATE\(\)/gi, "DATETIME('now')");
  s = s.replace(/DATEADD\(day,\s*30,\s*DATE\('now'\)\)/gi, "date('now', '+30 days')");
  s = s.replace(/DATEADD\(day,\s*30,\s*CAST\(GETDATE\(\)\s+AS\s+DATE\)\)/gi, "date('now', '+30 days')");

  // Remove MS SQL specific IF OBJECT_ID or COL_LENGTH queries gracefully
  if (/IF\s+OBJECT_ID/i.test(s) || /IF\s+COL_LENGTH/i.test(s)) {
    // If it's a DDL create, let it be handled or skipped
    return null;
  }

  return s;
}

async function getPool() {
  if (!poolPromise) {
    poolPromise = mssqlDriver.connect(mssqlConfig);
  }
  return poolPromise;
}

// Run (INSERT, UPDATE, DELETE)
async function run(sqlStr, params = []) {
  if (useMssql) {
    try {
      const pool = await getPool();
      const request = pool.request();
      const { transformedSql, paramNames } = processQueryForMssql(sqlStr, params);

      paramNames.forEach((name, idx) => {
        let val = params[idx];
        if (val === undefined) val = null;
        request.input(name, val);
      });

      let finalSql = transformedSql;
      const isInsert = /^\s*INSERT\s+INTO/i.test(sqlStr);
      if (isInsert && !/SCOPE_IDENTITY/i.test(finalSql)) {
        finalSql += '; SELECT SCOPE_IDENTITY() AS lastID;';
      }

      const result = await request.query(finalSql);
      let lastID = null;
      if (isInsert && result.recordset && result.recordset[0]) {
        lastID = result.recordset[0].lastID;
      }
      return { lastID, rowsAffected: result.rowsAffected ? result.rowsAffected[0] : 0 };
    } catch (err) {
      console.warn('MS SQL run failed, checking SQLite fallback:', err.message);
      throw err;
    }
  }

  // SQLite execution
  return new Promise((resolve, reject) => {
    const cleanSql = processQueryForSqlite(sqlStr);
    if (!cleanSql) {
      return resolve({ lastID: null, rowsAffected: 0 });
    }

    const db = getSqliteDb();
    db.run(cleanSql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, rowsAffected: this.changes });
    });
  });
}

// Get (Single Row SELECT)
async function get(sqlStr, params = []) {
  if (useMssql) {
    const pool = await getPool();
    const request = pool.request();
    const { transformedSql, paramNames } = processQueryForMssql(sqlStr, params);

    paramNames.forEach((name, idx) => {
      let val = params[idx];
      if (val === undefined) val = null;
      request.input(name, val);
    });

    const result = await request.query(transformedSql);
    return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
  }

  // SQLite execution
  return new Promise((resolve, reject) => {
    const cleanSql = processQueryForSqlite(sqlStr);
    if (!cleanSql) return resolve(null);

    const db = getSqliteDb();
    db.get(cleanSql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

// All (Multi Row SELECT)
async function all(sqlStr, params = []) {
  if (useMssql) {
    const pool = await getPool();
    const request = pool.request();
    const { transformedSql, paramNames } = processQueryForMssql(sqlStr, params);

    paramNames.forEach((name, idx) => {
      let val = params[idx];
      if (val === undefined) val = null;
      request.input(name, val);
    });

    const result = await request.query(transformedSql);
    return result.recordset || [];
  }

  // SQLite execution
  return new Promise((resolve, reject) => {
    const cleanSql = processQueryForSqlite(sqlStr);
    if (!cleanSql) return resolve([]);

    const db = getSqliteDb();
    db.all(cleanSql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// Ensure essential tables in SQLite exist
function initSqliteTables(db) {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS departments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dept_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        head_doctor_id INTEGER,
        description TEXT,
        phone TEXT,
        location_floor TEXT,
        status TEXT DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS admissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        doctor_id INTEGER NOT NULL,
        department_id INTEGER,
        room_no TEXT NOT NULL,
        bed_no TEXT NOT NULL,
        admission_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        discharge_date DATETIME,
        admission_type TEXT DEFAULT 'Normal',
        status TEXT DEFAULT 'Admitted',
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        payment_number TEXT UNIQUE NOT NULL,
        invoice_id INTEGER NOT NULL,
        patient_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        payment_method TEXT NOT NULL,
        transaction_ref TEXT,
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        received_by TEXT,
        notes TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS patient_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER NOT NULL,
        document_name TEXT NOT NULL,
        document_type TEXT DEFAULT 'General',
        file_url TEXT,
        file_size TEXT,
        notes TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS staff_leaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL,
        leave_type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        reason TEXT,
        status TEXT DEFAULT 'Pending',
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        approved_by TEXT,
        approved_at DATETIME
      )
    `);
  });
}

async function initDB() {
  if (mssqlDriver && !isExplicitSqlite) {
    try {
      await getPool();
      useMssql = true;
      console.log('=======================================================');
      console.log('✅ Connected to MS SQL Server (HospitalManagementDB)');
      console.log('=======================================================');
      return;
    } catch (err) {
      console.warn('⚠️ MS SQL Server connection unavailable:', err.message);
      console.log('🔄 Switching to self-contained cloud-ready SQLite database.');
    }
  }

  // Fallback to SQLite
  useMssql = false;
  const db = getSqliteDb();
  initSqliteTables(db);
  console.log('=======================================================');
  console.log(`✅ Connected to SQLite Database (${path.basename(dbFilePath)})`);
  console.log('🚀 Ready for 24/7 standalone cloud deployment');
  console.log('=======================================================');
}

module.exports = {
  db: null,
  run,
  get,
  all,
  initDB
};
