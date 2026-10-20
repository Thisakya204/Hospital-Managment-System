const express = require('express');
const router = express.Router();
const { get, all } = require('../db/database');
const { verifyToken, authorizeRoles } = require('../middleware/authMiddleware');

// 1. Dashboard High-Level Summary Statistics
router.get('/summary', verifyToken, async (req, res) => {
  try {
    const totalPatients = await get(`SELECT COUNT(*) as count FROM patients`);
    const totalAppointmentsToday = await get(`SELECT COUNT(*) as count FROM appointments WHERE CAST(appointment_date AS DATE) = CAST(GETDATE() AS DATE)`);
    const totalDoctors = await get(`SELECT COUNT(*) as count FROM doctors`);

    const revenueResult = await get(`SELECT SUM(net_amount) as total FROM invoices WHERE status = 'Paid'`);
    const pendingRevenueResult = await get(`SELECT SUM(net_amount) as total FROM invoices WHERE status = 'Unpaid'`);

    const lowStockAlerts = await get(`SELECT COUNT(*) as count FROM pharmacy_inventory WHERE stock_quantity <= reorder_level`);
    const nearExpiryAlerts = await get(`SELECT COUNT(*) as count FROM pharmacy_inventory WHERE expiry_date <= DATEADD(day, 30, CAST(GETDATE() AS DATE))`);

    const pendingLabTests = await get(`SELECT COUNT(*) as count FROM lab_tests WHERE status != 'Completed'`);
    const pendingPrescriptions = await get(`SELECT COUNT(*) as count FROM prescriptions WHERE status = 'Pending'`);

    const appointmentsByStatus = await all(`SELECT status, COUNT(*) as count FROM appointments GROUP BY status`);
    const recentActivity = await all(`SELECT TOP 8 * FROM audit_logs ORDER BY id DESC`);

    res.json({
      totalPatients: totalPatients ? totalPatients.count : 0,
      totalAppointmentsToday: totalAppointmentsToday ? totalAppointmentsToday.count : 0,
      totalDoctors: totalDoctors ? totalDoctors.count : 0,
      totalRevenue: revenueResult && revenueResult.total ? revenueResult.total : 0,
      pendingRevenue: pendingRevenueResult && pendingRevenueResult.total ? pendingRevenueResult.total : 0,
      lowStockAlerts: lowStockAlerts ? lowStockAlerts.count : 0,
      nearExpiryAlerts: nearExpiryAlerts ? nearExpiryAlerts.count : 0,
      pendingLabTests: pendingLabTests ? pendingLabTests.count : 0,
      pendingPrescriptions: pendingPrescriptions ? pendingPrescriptions.count : 0,
      appointmentsByStatus,
      recentActivity
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Patient Reports (SSD 3.10 Patient Reports)
router.get('/patients', verifyToken, async (req, res) => {
  try {
    const totalPatients = await get(`SELECT COUNT(*) as count FROM patients`);
    const genderDist = await all(`SELECT gender, COUNT(*) as count FROM patients GROUP BY gender`);
    const bloodDist = await all(`SELECT blood_group, COUNT(*) as count FROM patients GROUP BY blood_group ORDER BY count DESC`);
    
    // Patient List with counts of appointments and medical records
    const patients = await all(`
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM appointments a WHERE a.patient_id = p.id) as appointment_count,
        (SELECT COUNT(*) FROM medical_records mr WHERE mr.patient_id = p.id) as emr_count,
        (SELECT COUNT(*) FROM invoices inv WHERE inv.patient_id = p.id) as invoice_count
      FROM patients p
      ORDER BY p.id DESC
    `);

    res.json({
      totalCount: totalPatients ? totalPatients.count : 0,
      genderDistribution: genderDist || [],
      bloodGroupDistribution: bloodDist || [],
      patients: patients || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Appointment Reports (SSD 3.10 Appointment Reports)
router.get('/appointments', verifyToken, async (req, res) => {
  try {
    const { start_date, end_date, doctor_id } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (start_date) {
      whereClause += ' AND a.appointment_date >= ?';
      params.push(start_date);
    }
    if (end_date) {
      whereClause += ' AND a.appointment_date <= ?';
      params.push(end_date);
    }
    if (doctor_id) {
      whereClause += ' AND a.doctor_id = ?';
      params.push(doctor_id);
    }

    const statusCounts = await all(`SELECT status, COUNT(*) as count FROM appointments a ${whereClause} GROUP BY status`, params);
    
    const doctorVolume = await all(`
      SELECT d.full_name as doctor_name, d.specialization, d.department, COUNT(a.id) as total_appointments
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
      ${whereClause}
      GROUP BY d.full_name, d.specialization, d.department
      ORDER BY total_appointments DESC
    `, params);

    const appointments = await all(`
      SELECT a.*, p.full_name as patient_name, p.mrn, p.phone as patient_phone, d.full_name as doctor_name, d.specialization
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      JOIN doctors d ON a.doctor_id = d.id
      ${whereClause}
      ORDER BY a.appointment_date DESC, a.time_slot ASC
    `, params);

    res.json({
      statusDistribution: statusCounts || [],
      doctorVolume: doctorVolume || [],
      appointments: appointments || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Revenue Reports (SSD 3.10 Revenue Reports)
router.get('/revenue', verifyToken, async (req, res) => {
  try {
    const totalBilled = await get(`SELECT SUM(net_amount) as total, COUNT(*) as count FROM invoices`);
    const totalPaid = await get(`SELECT SUM(net_amount) as total, COUNT(*) as count FROM invoices WHERE status = 'Paid'`);
    const totalUnpaid = await get(`SELECT SUM(net_amount) as total, COUNT(*) as count FROM invoices WHERE status = 'Unpaid'`);

    // Category Breakdown (Consultation, Lab, Pharmacy, Admission)
    const categoryBreakdown = await all(`
      SELECT category, SUM(amount) as total_revenue, COUNT(*) as item_count
      FROM invoice_items
      GROUP BY category
      ORDER BY total_revenue DESC
    `);

    // Payment Method Breakdown
    const methodBreakdown = await all(`
      SELECT payment_method, SUM(amount) as total_collected, COUNT(*) as transaction_count
      FROM payments
      GROUP BY payment_method
      ORDER BY total_collected DESC
    `);

    // Invoices list
    const invoices = await all(`
      SELECT i.*, p.full_name as patient_name, p.mrn
      FROM invoices i
      JOIN patients p ON i.patient_id = p.id
      ORDER BY i.id DESC
    `);

    res.json({
      summary: {
        totalBilled: totalBilled ? totalBilled.total || 0 : 0,
        totalInvoices: totalBilled ? totalBilled.count || 0 : 0,
        totalPaid: totalPaid ? totalPaid.total || 0 : 0,
        paidInvoices: totalPaid ? totalPaid.count || 0 : 0,
        totalPending: totalUnpaid ? totalUnpaid.total || 0 : 0,
        pendingInvoices: totalUnpaid ? totalUnpaid.count || 0 : 0
      },
      categoryBreakdown: categoryBreakdown || [],
      paymentMethodBreakdown: methodBreakdown || [],
      invoices: invoices || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Pharmacy Reports (SSD 3.10 Pharmacy Reports)
router.get('/pharmacy', verifyToken, async (req, res) => {
  try {
    const totalStock = await get(`SELECT COUNT(*) as unique_items, SUM(stock_quantity) as total_units, SUM(unit_price * stock_quantity) as total_valuation FROM pharmacy_inventory`);
    const lowStockCount = await get(`SELECT COUNT(*) as count FROM pharmacy_inventory WHERE stock_quantity <= reorder_level`);
    const nearExpiryCount = await get(`SELECT COUNT(*) as count FROM pharmacy_inventory WHERE expiry_date <= DATEADD(day, 30, CAST(GETDATE() AS DATE))`);

    const lowStockItems = await all(`
      SELECT * FROM pharmacy_inventory 
      WHERE stock_quantity <= reorder_level 
      ORDER BY stock_quantity ASC
    `);

    const nearExpiryItems = await all(`
      SELECT * FROM pharmacy_inventory 
      WHERE expiry_date <= DATEADD(day, 30, CAST(GETDATE() AS DATE)) 
      ORDER BY expiry_date ASC
    `);

    const categoryBreakdown = await all(`
      SELECT category, COUNT(*) as medicine_count, SUM(stock_quantity) as total_units, SUM(unit_price * stock_quantity) as valuation
      FROM pharmacy_inventory
      GROUP BY category
      ORDER BY valuation DESC
    `);

    const prescriptions = await all(`
      SELECT pr.*, p.full_name as patient_name, d.full_name as doctor_name
      FROM prescriptions pr
      JOIN medical_records mr ON pr.medical_record_id = mr.id
      JOIN patients p ON mr.patient_id = p.id
      JOIN doctors d ON mr.doctor_id = d.id
      ORDER BY pr.id DESC
    `);

    res.json({
      summary: {
        uniqueItems: totalStock ? totalStock.unique_items || 0 : 0,
        totalUnits: totalStock ? totalStock.total_units || 0 : 0,
        totalValuation: totalStock ? totalStock.total_valuation || 0 : 0,
        lowStockAlerts: lowStockCount ? lowStockCount.count || 0 : 0,
        nearExpiryAlerts: nearExpiryCount ? nearExpiryCount.count || 0 : 0
      },
      lowStockItems: lowStockItems || [],
      nearExpiryItems: nearExpiryItems || [],
      categoryBreakdown: categoryBreakdown || [],
      prescriptions: prescriptions || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Laboratory Reports (SSD 3.10 Laboratory Reports)
router.get('/laboratory', verifyToken, async (req, res) => {
  try {
    const totalTests = await get(`SELECT COUNT(*) as total FROM lab_tests`);
    const statusBreakdown = await all(`SELECT status, COUNT(*) as count FROM lab_tests GROUP BY status`);
    const categoryBreakdown = await all(`SELECT category, COUNT(*) as count FROM lab_tests GROUP BY category ORDER BY count DESC`);

    const tests = await all(`
      SELECT lt.*, p.full_name as patient_name, p.mrn, d.full_name as doctor_name
      FROM lab_tests lt
      JOIN patients p ON lt.patient_id = p.id
      JOIN doctors d ON lt.doctor_id = d.id
      ORDER BY lt.requested_date DESC
    `);

    res.json({
      totalTests: totalTests ? totalTests.total || 0 : 0,
      statusBreakdown: statusBreakdown || [],
      categoryBreakdown: categoryBreakdown || [],
      tests: tests || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Staff Reports (SSD 3.10 Staff Reports)
router.get('/staff', verifyToken, async (req, res) => {
  try {
    const totalStaff = await get(`SELECT COUNT(*) as count, SUM(salary) as total_payroll FROM staff`);
    const deptBreakdown = await all(`SELECT department, COUNT(*) as staff_count, SUM(salary) as department_payroll FROM staff GROUP BY department ORDER BY staff_count DESC`);
    const roleBreakdown = await all(`SELECT role, COUNT(*) as count FROM staff GROUP BY role ORDER BY count DESC`);

    const staffList = await all(`SELECT * FROM staff ORDER BY id ASC`);
    
    let leaves = [];
    try {
      leaves = await all(`
        SELECT sl.*, s.full_name, s.employee_id, s.role, s.department
        FROM staff_leaves sl
        JOIN staff s ON sl.staff_id = s.id
        ORDER BY sl.applied_at DESC
      `);
    } catch (e) {
      leaves = [];
    }

    res.json({
      summary: {
        totalStaff: totalStaff ? totalStaff.count || 0 : 0,
        monthlyPayroll: totalStaff ? totalStaff.total_payroll || 0 : 0
      },
      departmentBreakdown: deptBreakdown || [],
      roleBreakdown: roleBreakdown || [],
      staffList: staffList || [],
      leaves: leaves || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
