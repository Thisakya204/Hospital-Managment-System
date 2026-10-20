const sql = require('mssql/msnodesqlv8');

const config = {
  connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=.\\SQLEXPRESS;Database=HospitalManagementDB;Trusted_Connection=yes;'
};

let poolPromise = null;

async function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config);
  }
  return poolPromise;
}

// Convert SQLite '?' parameters to MS SQL Server '@val1', '@val2', ...
// and sanitize SQLite specific syntax if present
function processQuery(sqlStr, params = []) {
  let transformedSql = sqlStr;

  // Replace CREATE TABLE IF NOT EXISTS with MS SQL syntax
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

// Run (INSERT, UPDATE, DELETE)
async function run(sqlStr, params = []) {
  const pool = await getPool();
  const request = pool.request();
  const { transformedSql, paramNames } = processQuery(sqlStr, params);

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

// Get (Single Row SELECT)
async function get(sqlStr, params = []) {
  const pool = await getPool();
  const request = pool.request();
  const { transformedSql, paramNames } = processQuery(sqlStr, params);

  paramNames.forEach((name, idx) => {
    let val = params[idx];
    if (val === undefined) val = null;
    request.input(name, val);
  });

  const result = await request.query(transformedSql);
  return result.recordset && result.recordset.length > 0 ? result.recordset[0] : null;
}

// All (Multi Row SELECT)
async function all(sqlStr, params = []) {
  const pool = await getPool();
  const request = pool.request();
  const { transformedSql, paramNames } = processQuery(sqlStr, params);

  paramNames.forEach((name, idx) => {
    let val = params[idx];
    if (val === undefined) val = null;
    request.input(name, val);
  });

  const result = await request.query(transformedSql);
  return result.recordset || [];
}

async function initDB() {
  try {
    await getPool();
    console.log('=======================================================');
    console.log('✅ Connected to MS SQL Server (HospitalManagementDB)');
    console.log('=======================================================');
  } catch (err) {
    console.error('❌ Failed to connect to MS SQL Server:', err);
  }
}

module.exports = {
  db: null,
  run,
  get,
  all,
  initDB
};
