const path = require('path');
const fs = require('fs');

let mssqlDriver = null;
let useMssql = false;
let poolPromise = null;
let sqliteDb = null;
let wasmDb = null;
let isWasm = false;

// Determine if we should attempt MS SQL Server
const isExplicitSqlite = process.env.DB_ENGINE === 'sqlite' || process.env.VERCEL;
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

// Database file path handling (support /tmp on Vercel)
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

// Initialize sql.js (WebAssembly SQLite)
async function initWasmDb() {
  if (!wasmDb) {
    const initSqlJs = require('sql.js');
    const wasmFile = path.join(__dirname, 'sql-wasm.wasm');
    const SQL = await initSqlJs({
      locateFile: file => {
        if (file.endsWith('.wasm') && fs.existsSync(wasmFile)) {
          return wasmFile;
        }
        return file;
      }
    });
    let fileBuffer;
    if (fs.existsSync(dbFilePath)) {
      fileBuffer = fs.readFileSync(dbFilePath);
    } else {
      const rootDb = path.join(__dirname, 'hms.db');
      fileBuffer = fs.readFileSync(rootDb);
    }
    wasmDb = new SQL.Database(fileBuffer);
    isWasm = true;
  }
  return wasmDb;
}

function persistWasmDb() {
  if (isWasm && wasmDb) {
    try {
      const data = wasmDb.export();
      fs.writeFileSync(dbFilePath, Buffer.from(data));
    } catch (e) {
      // Ignore or log error
    }
  }
}

// Run (INSERT, UPDATE, DELETE)
async function run(sqlStr, params = []) {
  if (useMssql) {
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
  }

  const cleanSql = processQueryForSqlite(sqlStr);
  if (!cleanSql) {
    return { lastID: null, rowsAffected: 0 };
  }

  // Wasm SQLite mode (runs reliably everywhere without GLIBC issues)
  if (isWasm) {
    const db = await initWasmDb();
    db.run(cleanSql, params);
    let lastID = null;
    try {
      const lastIdRes = db.exec('SELECT last_insert_rowid() AS id');
      if (lastIdRes && lastIdRes[0] && lastIdRes[0].values[0]) {
        lastID = lastIdRes[0].values[0][0];
      }
    } catch (e) {}
    const rowsAffected = db.getRowsModified();
    persistWasmDb();
    return { lastID, rowsAffected };
  }

  // Native sqlite3 mode
  return new Promise((resolve, reject) => {
    sqliteDb.run(cleanSql, params, function (err) {
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

  const cleanSql = processQueryForSqlite(sqlStr);
  if (!cleanSql) return null;

  // Wasm SQLite mode
  if (isWasm) {
    const db = await initWasmDb();
    const stmt = db.prepare(cleanSql);
    if (params && params.length > 0) stmt.bind(params);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  }

  // Native sqlite3 mode
  return new Promise((resolve, reject) => {
    sqliteDb.get(cleanSql, params, (err, row) => {
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

  const cleanSql = processQueryForSqlite(sqlStr);
  if (!cleanSql) return [];

  // Wasm SQLite mode
  if (isWasm) {
    const db = await initWasmDb();
    const stmt = db.prepare(cleanSql);
    if (params && params.length > 0) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  // Native sqlite3 mode
  return new Promise((resolve, reject) => {
    sqliteDb.all(cleanSql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
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

  useMssql = false;

  // On Vercel, always use pure WebAssembly sql.js (zero native compilation / zero GLIBC dependency)
  if (process.env.VERCEL) {
    try {
      await initWasmDb();
      console.log('=======================================================');
      console.log('✅ Connected to WebAssembly SQLite Database (sql.js)');
      console.log('🚀 Zero-native dependency engine active for Vercel Cloud');
      console.log('=======================================================');
      return;
    } catch (err) {
      console.error('WASM DB init failed:', err);
    }
  }

  // Native sqlite3 on regular servers/development
  try {
    const sqlite3 = require('sqlite3').verbose();
    await new Promise((resolve, reject) => {
      sqliteDb = new sqlite3.Database(dbFilePath, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    isWasm = false;
    console.log('=======================================================');
    console.log(`✅ Connected to SQLite Database (${path.basename(dbFilePath)})`);
    console.log('=======================================================');
  } catch (nativeErr) {
    console.warn('Native sqlite3 unavailable, falling back to WebAssembly sql.js:', nativeErr.message);
    await initWasmDb();
    console.log('✅ Connected to WebAssembly SQLite Database (sql.js)');
  }
}

module.exports = {
  db: null,
  run,
  get,
  all,
  initDB
};
