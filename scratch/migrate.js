const { run, all } = require('../db/database');

async function migrate() {
  try {
    console.log('Starting migration...');

    // 1. Departments Table
    await run(`
      IF OBJECT_ID('dbo.departments', 'U') IS NULL
      CREATE TABLE dbo.departments (
        id INT IDENTITY(1,1) PRIMARY KEY,
        dept_code NVARCHAR(50) UNIQUE NOT NULL,
        name NVARCHAR(150) NOT NULL,
        head_doctor_id INT NULL,
        description NVARCHAR(MAX),
        phone NVARCHAR(50),
        location_floor NVARCHAR(50),
        status NVARCHAR(50) DEFAULT 'Active',
        created_at DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('✅ departments table ready');

    // 2. Admissions Table
    await run(`
      IF OBJECT_ID('dbo.admissions', 'U') IS NULL
      CREATE TABLE dbo.admissions (
        id INT IDENTITY(1,1) PRIMARY KEY,
        patient_id INT NOT NULL,
        doctor_id INT NOT NULL,
        department_id INT NULL,
        room_no NVARCHAR(50) NOT NULL,
        bed_no NVARCHAR(50) NOT NULL,
        admission_date DATETIME NOT NULL DEFAULT GETDATE(),
        discharge_date DATETIME NULL,
        admission_type NVARCHAR(50) DEFAULT 'Normal',
        status NVARCHAR(50) DEFAULT 'Admitted',
        notes NVARCHAR(MAX),
        created_at DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('✅ admissions table ready');

    // 3. Payments Table
    await run(`
      IF OBJECT_ID('dbo.payments', 'U') IS NULL
      CREATE TABLE dbo.payments (
        id INT IDENTITY(1,1) PRIMARY KEY,
        payment_number NVARCHAR(100) UNIQUE NOT NULL,
        invoice_id INT NOT NULL,
        patient_id INT NOT NULL,
        amount DECIMAL(18,2) NOT NULL,
        payment_method NVARCHAR(50) NOT NULL,
        transaction_ref NVARCHAR(100),
        payment_date DATETIME DEFAULT GETDATE(),
        received_by NVARCHAR(100),
        notes NVARCHAR(MAX)
      )
    `);
    console.log('✅ payments table ready');

    // Seed departments if empty
    const depts = await all('SELECT COUNT(*) as count FROM dbo.departments');
    if (depts[0].count === 0) {
      await run(`
        INSERT INTO dbo.departments (dept_code, name, description, location_floor, phone) VALUES
        ('CARD-01', 'Cardiology', 'Heart, blood vessels, and cardiovascular care', '3rd Floor - East Wing', '+1-555-0301'),
        ('NEUR-01', 'Neurology', 'Brain, spinal cord, and nervous system disorders', '4th Floor - West Wing', '+1-555-0401'),
        ('PEDI-01', 'Pediatrics', 'Comprehensive healthcare for infants and children', '2nd Floor - South Wing', '+1-555-0201'),
        ('ORTH-01', 'Orthopedics', 'Musculoskeletal system, joints and bones', '3rd Floor - North Wing', '+1-555-0305'),
        ('EMRG-01', 'Emergency & Trauma', '24/7 Acute critical emergency care', 'Ground Floor - Main Hall', '+1-555-0911')
      `);
      console.log('✅ Seeded default departments');
    }

    // Seed admissions if empty
    const admits = await all('SELECT COUNT(*) as count FROM dbo.admissions');
    if (admits[0].count === 0) {
      await run(`
        INSERT INTO dbo.admissions (patient_id, doctor_id, department_id, room_no, bed_no, admission_type, status, notes) VALUES
        (1, 1, 1, 'Room 304', 'Bed-A', 'Normal', 'Admitted', 'Post-checkup monitoring for hypertension and cardiac rhythm.'),
        (2, 2, 2, 'ICU-102', 'Bed-ICU', 'Emergency', 'Admitted', 'Acute neurological migraine surveillance and observation.')
      `);
      console.log('✅ Seeded default admissions');
    }

    // Seed payments if empty
    const pays = await all('SELECT COUNT(*) as count FROM dbo.payments');
    if (pays[0].count === 0) {
      await run(`
        INSERT INTO dbo.payments (payment_number, invoice_id, patient_id, amount, payment_method, transaction_ref, received_by, notes) VALUES
        ('PAY-2026-001', 1, 1, 235.00, 'Credit Card', 'TXN-9847291', 'David Rose', 'Full settlement for Invoice INV-2026-001')
      `);
      console.log('✅ Seeded default payments');
    }

    console.log('All migrations completed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
