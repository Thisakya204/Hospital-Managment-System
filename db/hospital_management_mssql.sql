-- ============================================================================
-- Hospital Management System (HMS) - MS SQL Server Database Schema & Seed Data
-- ============================================================================

-- 1. Create Database
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'HospitalManagementDB')
BEGIN
    CREATE DATABASE HospitalManagementDB;
END;
GO

USE HospitalManagementDB;
GO

-- Drop existing tables in reverse order if re-creating
IF OBJECT_ID('dbo.audit_logs', 'U') IS NOT NULL DROP TABLE dbo.audit_logs;
IF OBJECT_ID('dbo.staff', 'U') IS NOT NULL DROP TABLE dbo.staff;
IF OBJECT_ID('dbo.payments', 'U') IS NOT NULL DROP TABLE dbo.payments;
IF OBJECT_ID('dbo.invoice_items', 'U') IS NOT NULL DROP TABLE dbo.invoice_items;
IF OBJECT_ID('dbo.invoices', 'U') IS NOT NULL DROP TABLE dbo.invoices;
IF OBJECT_ID('dbo.pharmacy_inventory', 'U') IS NOT NULL DROP TABLE dbo.pharmacy_inventory;
IF OBJECT_ID('dbo.lab_tests', 'U') IS NOT NULL DROP TABLE dbo.lab_tests;
IF OBJECT_ID('dbo.prescriptions', 'U') IS NOT NULL DROP TABLE dbo.prescriptions;
IF OBJECT_ID('dbo.medical_records', 'U') IS NOT NULL DROP TABLE dbo.medical_records;
IF OBJECT_ID('dbo.admissions', 'U') IS NOT NULL DROP TABLE dbo.admissions;
IF OBJECT_ID('dbo.appointments', 'U') IS NOT NULL DROP TABLE dbo.appointments;
IF OBJECT_ID('dbo.doctors', 'U') IS NOT NULL DROP TABLE dbo.doctors;
IF OBJECT_ID('dbo.departments', 'U') IS NOT NULL DROP TABLE dbo.departments;
IF OBJECT_ID('dbo.patients', 'U') IS NOT NULL DROP TABLE dbo.patients;
IF OBJECT_ID('dbo.users', 'U') IS NOT NULL DROP TABLE dbo.users;
IF OBJECT_ID('dbo.roles', 'U') IS NOT NULL DROP TABLE dbo.roles;
GO

-- ============================================================================
-- 2. CREATE TABLES
-- ============================================================================

-- Roles
CREATE TABLE roles (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) UNIQUE NOT NULL,
    description NVARCHAR(MAX)
);

-- Users
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    username NVARCHAR(100) UNIQUE NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    full_name NVARCHAR(150) NOT NULL,
    email NVARCHAR(150) UNIQUE NOT NULL,
    role_name NVARCHAR(100) NOT NULL,
    department NVARCHAR(100),
    phone NVARCHAR(50),
    created_at DATETIME DEFAULT GETDATE()
);

-- Patients
CREATE TABLE patients (
    id INT IDENTITY(1,1) PRIMARY KEY,
    mrn NVARCHAR(50) UNIQUE NOT NULL,
    full_name NVARCHAR(150) NOT NULL,
    dob DATE NOT NULL,
    gender NVARCHAR(20) NOT NULL,
    phone NVARCHAR(50) NOT NULL,
    email NVARCHAR(150),
    address NVARCHAR(MAX),
    blood_group NVARCHAR(10),
    emergency_contact NVARCHAR(150),
    allergies NVARCHAR(MAX),
    created_at DATETIME DEFAULT GETDATE()
);

-- Departments
CREATE TABLE departments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    dept_code NVARCHAR(50) UNIQUE NOT NULL,
    name NVARCHAR(150) NOT NULL,
    head_doctor_id INT NULL,
    description NVARCHAR(MAX),
    phone NVARCHAR(50),
    location_floor NVARCHAR(50),
    status NVARCHAR(50) DEFAULT 'Active',
    created_at DATETIME DEFAULT GETDATE()
);

-- Doctors
CREATE TABLE doctors (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NULL,
    full_name NVARCHAR(150) NOT NULL,
    specialization NVARCHAR(100) NOT NULL,
    qualification NVARCHAR(100),
    department NVARCHAR(100) NOT NULL,
    consultation_fee DECIMAL(18,2) NOT NULL,
    room_no NVARCHAR(50),
    availability NVARCHAR(100) DEFAULT 'Mon-Fri 09:00 - 17:00',
    CONSTRAINT FK_doctors_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Appointments
CREATE TABLE appointments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    appointment_date DATE NOT NULL,
    time_slot NVARCHAR(50) NOT NULL,
    status NVARCHAR(50) DEFAULT 'Scheduled', -- Scheduled, Completed, Cancelled
    reason NVARCHAR(MAX),
    created_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_appointments_patients FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE NO ACTION,
    CONSTRAINT FK_appointments_doctors FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE NO ACTION
);

-- Admissions (In-Patient Ward / Bed Management)
CREATE TABLE admissions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    department_id INT NULL,
    room_no NVARCHAR(50) NOT NULL,
    bed_no NVARCHAR(50) NOT NULL,
    admission_date DATETIME NOT NULL DEFAULT GETDATE(),
    discharge_date DATETIME NULL,
    admission_type NVARCHAR(50) DEFAULT 'Normal', -- Normal, Emergency, ICU
    status NVARCHAR(50) DEFAULT 'Admitted', -- Admitted, Discharged
    notes NVARCHAR(MAX),
    created_at DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_admissions_patients FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE NO ACTION,
    CONSTRAINT FK_admissions_doctors FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE NO ACTION,
    CONSTRAINT FK_admissions_departments FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

-- Medical Records (EMR)
CREATE TABLE medical_records (
    id INT IDENTITY(1,1) PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    appointment_id INT NULL,
    diagnosis NVARCHAR(MAX) NOT NULL,
    symptoms NVARCHAR(MAX),
    treatment_plan NVARCHAR(MAX),
    vitals_bp NVARCHAR(50),
    vitals_temp NVARCHAR(50),
    vitals_pulse NVARCHAR(50),
    vitals_weight NVARCHAR(50),
    record_date DATETIME DEFAULT GETDATE(),
    CONSTRAINT FK_mr_patients FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE NO ACTION,
    CONSTRAINT FK_mr_doctors FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE NO ACTION,
    CONSTRAINT FK_mr_appointments FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL
);

-- Prescriptions
CREATE TABLE prescriptions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    medical_record_id INT NOT NULL,
    medicine_name NVARCHAR(150) NOT NULL,
    dosage NVARCHAR(100) NOT NULL,
    frequency NVARCHAR(100) NOT NULL,
    duration_days INT NOT NULL,
    status NVARCHAR(50) DEFAULT 'Pending', -- Pending, Dispensed
    CONSTRAINT FK_prescriptions_mr FOREIGN KEY (medical_record_id) REFERENCES medical_records(id) ON DELETE CASCADE
);

-- Laboratory Tests
CREATE TABLE lab_tests (
    id INT IDENTITY(1,1) PRIMARY KEY,
    patient_id INT NOT NULL,
    doctor_id INT NOT NULL,
    test_name NVARCHAR(150) NOT NULL,
    category NVARCHAR(100) NOT NULL,
    status NVARCHAR(50) DEFAULT 'Requested', -- Requested, Sample Collected, In-Progress, Completed
    result_summary NVARCHAR(MAX),
    normal_range NVARCHAR(100),
    notes NVARCHAR(MAX),
    requested_date DATETIME DEFAULT GETDATE(),
    completed_date DATETIME,
    CONSTRAINT FK_lab_patients FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE NO ACTION,
    CONSTRAINT FK_lab_doctors FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE NO ACTION
);

-- Pharmacy Inventory
CREATE TABLE pharmacy_inventory (
    id INT IDENTITY(1,1) PRIMARY KEY,
    medicine_name NVARCHAR(150) UNIQUE NOT NULL,
    category NVARCHAR(100) NOT NULL,
    unit_price DECIMAL(18,2) NOT NULL,
    stock_quantity INT NOT NULL,
    expiry_date DATE NOT NULL,
    batch_number NVARCHAR(100) NOT NULL,
    reorder_level INT DEFAULT 20
);

-- Invoices
CREATE TABLE invoices (
    id INT IDENTITY(1,1) PRIMARY KEY,
    invoice_number NVARCHAR(100) UNIQUE NOT NULL,
    patient_id INT NOT NULL,
    total_amount DECIMAL(18,2) NOT NULL,
    tax DECIMAL(18,2) DEFAULT 0,
    discount DECIMAL(18,2) DEFAULT 0,
    net_amount DECIMAL(18,2) NOT NULL,
    status NVARCHAR(50) DEFAULT 'Unpaid', -- Unpaid, Paid, Cancelled
    payment_method NVARCHAR(50),
    issued_date DATETIME DEFAULT GETDATE(),
    paid_date DATETIME,
    CONSTRAINT FK_invoices_patients FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE NO ACTION
);

-- Invoice Items
CREATE TABLE invoice_items (
    id INT IDENTITY(1,1) PRIMARY KEY,
    invoice_id INT NOT NULL,
    description NVARCHAR(255) NOT NULL,
    category NVARCHAR(100) NOT NULL, -- Consultation, Lab, Pharmacy, Admission
    unit_price DECIMAL(18,2) NOT NULL,
    quantity INT NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    CONSTRAINT FK_invoice_items_invoices FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

-- Payments
CREATE TABLE payments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    payment_number NVARCHAR(100) UNIQUE NOT NULL,
    invoice_id INT NOT NULL,
    patient_id INT NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    payment_method NVARCHAR(50) NOT NULL,
    transaction_ref NVARCHAR(100),
    payment_date DATETIME DEFAULT GETDATE(),
    received_by NVARCHAR(100),
    notes NVARCHAR(MAX),
    CONSTRAINT FK_payments_invoices FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    CONSTRAINT FK_payments_patients FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE NO ACTION
);

-- Staff Management
CREATE TABLE staff (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NULL,
    employee_id NVARCHAR(50) UNIQUE NOT NULL,
    full_name NVARCHAR(150) NOT NULL,
    role NVARCHAR(100) NOT NULL,
    department NVARCHAR(100) NOT NULL,
    phone NVARCHAR(50),
    salary DECIMAL(18,2),
    joining_date DATE,
    status NVARCHAR(50) DEFAULT 'Active',
    CONSTRAINT FK_staff_users FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Audit Logs
CREATE TABLE audit_logs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NULL,
    user_name NVARCHAR(100) NOT NULL,
    user_role NVARCHAR(100) NOT NULL,
    action NVARCHAR(100) NOT NULL,
    module NVARCHAR(100) NOT NULL,
    details NVARCHAR(MAX),
    timestamp DATETIME DEFAULT GETDATE()
);
GO

-- ============================================================================
-- 3. SEED INITIAL DATA
-- ============================================================================

-- Roles
INSERT INTO roles (name, description) VALUES 
('Administrator', 'System-wide control and configurations'),
('Doctor', 'Clinical management, EMR, prescriptions, lab orders'),
('Nurse', 'Vitals management, bed assignments, patient monitoring'),
('Receptionist', 'Front desk, registration, appointments scheduling'),
('Laboratory Staff', 'Lab tests processing, result entry, reports'),
('Pharmacist', 'Medicine inventory, stock alerts, prescription dispensing'),
('Accountant', 'Billing, invoices, revenue tracking, payment receipts');

-- Default Users (Password: password123)
INSERT INTO users (username, password_hash, full_name, email, role_name, department, phone) VALUES
('admin', '$2a$10$7R0Z4Q5SgJv4rD6w.x6yMeZ0V8Vj2q5n3k1m4L7p8q9r0s1t2u3v4', 'Dr. Arthur Pendelton (Admin)', 'admin@hospital.org', 'Administrator', 'Administration', '+1-555-0101'),
('doctor_smith', '$2a$10$7R0Z4Q5SgJv4rD6w.x6yMeZ0V8Vj2q5n3k1m4L7p8q9r0s1t2u3v4', 'Dr. Sarah Smith', 's.smith@hospital.org', 'Doctor', 'Cardiology', '+1-555-0102'),
('doctor_jones', '$2a$10$7R0Z4Q5SgJv4rD6w.x6yMeZ0V8Vj2q5n3k1m4L7p8q9r0s1t2u3v4', 'Dr. Robert Jones', 'r.jones@hospital.org', 'Doctor', 'Neurology', '+1-555-0103'),
('nurse_clara', '$2a$10$7R0Z4Q5SgJv4rD6w.x6yMeZ0V8Vj2q5n3k1m4L7p8q9r0s1t2u3v4', 'Clara Oswald (RN)', 'clara@hospital.org', 'Nurse', 'General Ward', '+1-555-0104'),
('reception_john', '$2a$10$7R0Z4Q5SgJv4rD6w.x6yMeZ0V8Vj2q5n3k1m4L7p8q9r0s1t2u3v4', 'John Miller', 'reception@hospital.org', 'Receptionist', 'Front Desk', '+1-555-0105'),
('lab_tech', '$2a$10$7R0Z4Q5SgJv4rD6w.x6yMeZ0V8Vj2q5n3k1m4L7p8q9r0s1t2u3v4', 'Michael Vance', 'lab@hospital.org', 'Laboratory Staff', 'Pathology Lab', '+1-555-0106'),
('pharmacist_amy', '$2a$10$7R0Z4Q5SgJv4rD6w.x6yMeZ0V8Vj2q5n3k1m4L7p8q9r0s1t2u3v4', 'Amy Pond', 'pharmacy@hospital.org', 'Pharmacist', 'Main Pharmacy', '+1-555-0107'),
('accountant_david', '$2a$10$7R0Z4Q5SgJv4rD6w.x6yMeZ0V8Vj2q5n3k1m4L7p8q9r0s1t2u3v4', 'David Rose', 'finance@hospital.org', 'Accountant', 'Billing & Finance', '+1-555-0108');

-- Doctors
INSERT INTO doctors (user_id, full_name, specialization, qualification, department, consultation_fee, room_no) VALUES 
(2, 'Dr. Sarah Smith', 'Cardiology', 'MD, FACC', 'Cardiology', 150.00, 'Room 301'),
(3, 'Dr. Robert Jones', 'Neurology', 'MD, PhD', 'Neurology', 180.00, 'Room 405');

-- Patients
INSERT INTO patients (mrn, full_name, dob, gender, phone, email, address, blood_group, emergency_contact, allergies) VALUES 
('MRN-2026-101', 'Eleanor Vance', '1988-04-12', 'Female', '+1-555-8891', 'eleanor@example.com', '124 Maple Street, NY', 'A+', 'Brother - 555-0011', 'Penicillin'),
('MRN-2026-102', 'Marcus Vance', '1975-09-24', 'Male', '+1-555-8892', 'marcus@example.com', '56 Oak Lane, NY', 'O+', 'Wife - 555-0012', 'Dust & Pollen'),
('MRN-2026-103', 'Sophia Martinez', '1995-11-05', 'Female', '+1-555-8893', 'sophia@example.com', '789 Pine Ave, NY', 'B+', 'Mother - 555-0013', 'None'),
('MRN-2026-104', 'James Wilson', '1962-02-18', 'Male', '+1-555-8894', 'j.wilson@example.com', '321 Elm St, NY', 'AB-', 'Son - 555-0014', 'Sulfa Drugs');

-- Staff
INSERT INTO staff (user_id, employee_id, full_name, role, department, phone, salary, joining_date) VALUES
(1, 'EMP-001', 'Dr. Arthur Pendelton', 'Administrator', 'Administration', '+1-555-0101', 120000.00, '2020-01-15'),
(4, 'EMP-004', 'Clara Oswald', 'Nurse', 'General Ward', '+1-555-0104', 65000.00, '2021-03-10'),
(5, 'EMP-005', 'John Miller', 'Receptionist', 'Front Desk', '+1-555-0105', 48000.00, '2022-06-01'),
(6, 'EMP-006', 'Michael Vance', 'Laboratory Staff', 'Pathology Lab', '+1-555-0106', 72000.00, '2021-09-15'),
(7, 'EMP-007', 'Amy Pond', 'Pharmacist', 'Main Pharmacy', '+1-555-0107', 78000.00, '2021-11-20'),
(8, 'EMP-008', 'David Rose', 'Accountant', 'Billing & Finance', '+1-555-0108', 75000.00, '2022-01-05');

-- Appointments
INSERT INTO appointments (patient_id, doctor_id, appointment_date, time_slot, status, reason) VALUES
(1, 1, CAST(GETDATE() AS DATE), '10:00 AM', 'Completed', 'Routine Cardiovascular Checkup'),
(2, 2, CAST(GETDATE() AS DATE), '11:30 AM', 'Scheduled', 'Migraine & Chronic Headaches'),
(3, 1, CAST(GETDATE() AS DATE), '02:00 PM', 'Scheduled', 'Palpitations & Shortness of Breath'),
(4, 2, CAST(GETDATE() AS DATE), '03:30 PM', 'Cancelled', 'Follow-up Consultation');

-- Medical Record & Prescriptions
INSERT INTO medical_records (patient_id, doctor_id, appointment_id, diagnosis, symptoms, treatment_plan, vitals_bp, vitals_temp, vitals_pulse, vitals_weight) VALUES
(1, 1, 1, 'Stage 1 Essential Hypertension', 'Occasional dizziness, elevated BP', 'Lifestyle modification, low sodium diet, oral daily medication', '138/88 mmHg', '98.6 deg F', '76 bpm', '68 kg');

INSERT INTO prescriptions (medical_record_id, medicine_name, dosage, frequency, duration_days, status) VALUES
(1, 'Amlodipine 5mg', '1 Tablet', 'Once Daily (Morning)', 30, 'Pending'),
(1, 'Atorvastatin 10mg', '1 Tablet', 'Once Daily (Night)', 30, 'Dispensed');

-- Pharmacy Inventory
INSERT INTO pharmacy_inventory (medicine_name, category, unit_price, stock_quantity, expiry_date, batch_number, reorder_level) VALUES
('Amlodipine 5mg', 'Antihypertensive', 12.50, 240, '2027-12-31', 'BATCH-AML-001', 50),
('Atorvastatin 10mg', 'Statin', 18.00, 180, '2027-08-30', 'BATCH-ATO-002', 30),
('Paracetamol 500mg', 'Analgesic', 5.00, 1200, '2028-05-15', 'BATCH-PCM-003', 100),
('Amoxicillin 500mg', 'Antibiotic', 15.00, 15, '2026-10-15', 'BATCH-AMX-004', 50),
('Metformin 500mg', 'Antidiabetic', 14.00, 320, '2026-09-30', 'BATCH-MET-005', 40);

-- Lab Tests
INSERT INTO lab_tests (patient_id, doctor_id, test_name, category, status, result_summary, normal_range, notes) VALUES
(1, 1, 'Complete Blood Count (CBC)', 'Hematology', 'Completed', 'WBC: 6.8 K/uL, RBC: 4.5 M/uL, Hemoglobin: 14.2 g/dL', 'WBC (4.5-11.0), Hb (12.0-16.0)', 'Normal hematological limits.'),
(2, 2, 'Brain MRI Scan with Contrast', 'Radiology', 'In-Progress', NULL, NULL, 'Scheduled for imaging department.'),
(3, 1, 'Lipid Profile & Serum Electrolytes', 'Biochemistry', 'Requested', NULL, NULL, 'Fasting required for 12 hours.');

-- Invoices & Invoice Items
INSERT INTO invoices (invoice_number, patient_id, total_amount, tax, discount, net_amount, status, payment_method, paid_date) VALUES
('INV-2026-001', 1, 230.00, 15.00, 10.00, 235.00, 'Paid', 'Credit Card', GETDATE()),
('INV-2026-002', 2, 180.00, 10.00, 0.00, 190.00, 'Unpaid', NULL, NULL);

INSERT INTO invoice_items (invoice_id, description, category, unit_price, quantity, amount) VALUES
(1, 'Cardiology Consultation Fee', 'Consultation', 150.00, 1, 150.00),
(1, 'Complete Blood Count (CBC)', 'Lab', 80.00, 1, 80.00),
(2, 'Neurology Consultation Fee', 'Consultation', 180.00, 1, 180.00);

-- Departments Seed
INSERT INTO departments (dept_code, name, description, location_floor, phone) VALUES
('CARD-01', 'Cardiology', 'Heart, blood vessels, and cardiovascular care', '3rd Floor - East Wing', '+1-555-0301'),
('NEUR-01', 'Neurology', 'Brain, spinal cord, and nervous system disorders', '4th Floor - West Wing', '+1-555-0401'),
('PEDI-01', 'Pediatrics', 'Comprehensive healthcare for infants and children', '2nd Floor - South Wing', '+1-555-0201'),
('ORTH-01', 'Orthopedics', 'Musculoskeletal system, joints and bones', '3rd Floor - North Wing', '+1-555-0305'),
('EMRG-01', 'Emergency & Trauma', '24/7 Acute critical emergency care', 'Ground Floor - Main Hall', '+1-555-0911');

-- Admissions Seed
INSERT INTO admissions (patient_id, doctor_id, department_id, room_no, bed_no, admission_type, status, notes) VALUES
(1, 1, 1, 'Room 304', 'Bed-A', 'Normal', 'Admitted', 'Post-checkup monitoring for hypertension and cardiac rhythm.'),
(2, 2, 2, 'ICU-102', 'Bed-ICU', 'Emergency', 'Admitted', 'Acute neurological migraine surveillance and observation.');

-- Payments Seed
INSERT INTO payments (payment_number, invoice_id, patient_id, amount, payment_method, transaction_ref, received_by, notes) VALUES
('PAY-2026-001', 1, 1, 235.00, 'Credit Card', 'TXN-9847291', 'David Rose', 'Full settlement for Invoice INV-2026-001');

-- Audit Log Initial
INSERT INTO audit_logs (user_name, user_role, action, module, details) VALUES
('System Initializer', 'Administrator', 'SEED_DATABASE', 'System', 'Initial MS SQL Server hospital database seeded with default users, doctors, inventory, and patients.');
GO

PRINT '========================================================================';
PRINT '✅ MS SQL Server HospitalManagementDB Database and Sample Data Created Successfully!';
PRINT '========================================================================';
GO
