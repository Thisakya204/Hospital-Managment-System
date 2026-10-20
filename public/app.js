// SmartCare — Healthcare Enterprise Portal Core Frontend State & Logic

const API_BASE = '/api';
let token = localStorage.getItem('hms_jwt') || null;
let currentUser = JSON.parse(localStorage.getItem('hms_user') || 'null');

// Search state
let searchDebounceTimer = null;
let searchResults = [];
let searchSelectedIndex = -1;

document.addEventListener('DOMContentLoaded', () => {
  if (token && currentUser) {
    showAppLayout();
  } else {
    showAuthScreen();
  }

  document.getElementById('login-form').addEventListener('submit', handleLogin);

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-wrapper')) {
      closeAllDropdowns();
    }
    if (!e.target.closest('.search-bar-wrapper')) {
      hideSearchDropdown();
    }
  });
});

function toggleDropdown(menuId) {
  const menu = document.getElementById(menuId);
  if (!menu) return;
  const isShown = menu.classList.contains('show');
  closeAllDropdowns();
  if (!isShown) {
    menu.classList.add('show');
  }
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
}

function openNotificationTab(tabKey) {
  closeAllDropdowns();
  switchTab(tabKey);
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabKey === 'appointments') {
    if (typeof goToCalToday === 'function') goToCalToday();
  }
}

function openUserProfileModal() {
  closeAllDropdowns();
  if (!currentUser) return;

  document.getElementById('prof-modal-avatar').innerText = currentUser.full_name.charAt(0);
  document.getElementById('prof-modal-name').innerText = currentUser.full_name;
  document.getElementById('prof-modal-role').innerText = currentUser.role;
  document.getElementById('prof-modal-dept').innerText = `• ${currentUser.department || 'General Administration'}`;
  document.getElementById('prof-modal-username').innerText = currentUser.username || 'admin';
  document.getElementById('prof-modal-email').innerText = currentUser.email || `${currentUser.username}@smartcare.lk`;
  document.getElementById('prof-modal-phone').innerText = currentUser.phone || '+94 77 123 4567';

  let privs = 'Full Executive Access: Patients Directory, Doctors Roster, EMR Records, Laboratory Operations, Pharmacy Inventory, Invoicing & Billing, Staff Management, Audit Trail, System Backups.';
  if (currentUser.role === 'Doctor') {
    privs = 'Doctor Clinical Access: Patient Consultations, EMR Diagnosis Entry, Prescription Writing, Lab Orders & Results Viewing.';
  } else if (currentUser.role === 'Nurse') {
    privs = 'Nursing Care Access: Patient Registration, Vital Signs Recording, Appointment Queue Management.';
  } else if (currentUser.role === 'Receptionist') {
    privs = 'Front Desk Access: Patient Registration, Appointment Scheduling, Doctor Availability Checking.';
  } else if (currentUser.role === 'Laboratory Staff') {
    privs = 'Laboratory Access: Test Request Queue, Sample Collection Tracking, Lab Result Entry & Processing.';
  } else if (currentUser.role === 'Pharmacist') {
    privs = 'Pharmacy Access: Medicine Inventory Management, Stock Expiry Tracking, Prescription Dispensing.';
  } else if (currentUser.role === 'Accountant') {
    privs = 'Financial Access: Invoice Generation, Payment Processing, Financial Receipt Printing, Revenue Auditing.';
  }

  document.getElementById('prof-modal-privileges').innerText = privs;
  openModal('modal-user-profile');
}

function quickLogin(roleKey) {
  const presets = {
    admin: { u: 'admin', p: 'password123' },
    doctor_smith: { u: 'doctor_smith', p: 'password123' },
    nurse_clara: { u: 'nurse_clara', p: 'password123' },
    reception_john: { u: 'reception_john', p: 'password123' },
    lab_tech: { u: 'lab_tech', p: 'password123' },
    pharmacist_amy: { u: 'pharmacist_amy', p: 'password123' },
    accountant_david: { u: 'accountant_david', p: 'password123' }
  };
  if (presets[roleKey]) {
    document.getElementById('login-username').value = presets[roleKey].u;
    document.getElementById('login-password').value = presets[roleKey].p;
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Authentication failed');

    token = data.token;
    currentUser = data.user;
    localStorage.setItem('hms_jwt', token);
    localStorage.setItem('hms_user', JSON.stringify(currentUser));

    showAppLayout();
  } catch (err) {
    alert(`Login Error: ${err.message}`);
  }
}

function logout() {
  localStorage.removeItem('hms_jwt');
  localStorage.removeItem('hms_user');
  token = null;
  currentUser = null;
  showAuthScreen();
}

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('app-layout').style.display = 'none';
}

function showAppLayout() {
  const authScreen = document.getElementById('auth-screen');
  const appLayout = document.getElementById('app-layout');
  if (authScreen) authScreen.style.display = 'none';
  if (appLayout) appLayout.style.display = 'flex';

  if (!currentUser) return;

  const userDisplayName = document.getElementById('user-display-name');
  if (userDisplayName) userDisplayName.innerText = currentUser.full_name;

  const userDisplayRole = document.getElementById('user-display-role');
  if (userDisplayRole) userDisplayRole.innerText = currentUser.role;

  const topUserName = document.getElementById('top-user-name');
  if (topUserName) topUserName.innerText = currentUser.full_name;

  const userAvatar = document.getElementById('user-avatar');
  if (userAvatar) userAvatar.innerText = currentUser.full_name ? currentUser.full_name.charAt(0) : 'U';

  const dropdownUserFull = document.getElementById('dropdown-user-full');
  if (dropdownUserFull) dropdownUserFull.innerText = currentUser.full_name;

  const dropdownUserRole = document.getElementById('dropdown-user-role');
  if (dropdownUserRole) dropdownUserRole.innerText = currentUser.role;

  applyRoleUI();
  switchTab('dashboard');
  fetchDashboardData();
}

function applyRoleUI() {
  const role = currentUser.role;
  const isStaffAllowed = ['Administrator', 'Accountant'].includes(role);
  if (document.getElementById('nav-staff-item')) document.getElementById('nav-staff-item').style.display = isStaffAllowed ? 'block' : 'none';
  if (document.getElementById('nav-audit-item')) document.getElementById('nav-audit-item').style.display = isStaffAllowed ? 'block' : 'none';
  if (document.getElementById('nav-backup-item')) document.getElementById('nav-backup-item').style.display = (role === 'Administrator') ? 'block' : 'none';
  if (document.getElementById('nav-reports-item')) document.getElementById('nav-reports-item').style.display = 'block';
}

function switchTab(tabId) {
  closeAllDropdowns();
  document.querySelectorAll('.tab-page').forEach(page => page.style.display = 'none');
  document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

  const targetTab = document.getElementById(`tab-${tabId}`);
  if (targetTab) targetTab.style.display = 'block';

  const links = document.querySelectorAll('.nav-link');
  links.forEach(l => {
    if (l.getAttribute('onclick') && l.getAttribute('onclick').includes(tabId)) {
      l.classList.add('active');
    }
  });

  if (tabId === 'dashboard') fetchDashboardData();
  if (tabId === 'patients') fetchPatients();
  if (tabId === 'doctors') fetchDoctors();
  if (tabId === 'departments') { fetchDepartments(); fetchDoctors(); }
  if (tabId === 'admissions') { fetchPatients(); fetchDoctors(); fetchDepartments(); fetchAdmissions(); }
  if (tabId === 'appointments') { fetchDoctors(); fetchAppointments(); }
  if (tabId === 'emr') { fetchDoctors(); fetchPatients(); fetchEMR(); }
  if (tabId === 'lab') fetchLabTests();
  if (tabId === 'pharmacy') fetchPharmacy();
  if (tabId === 'billing') { fetchInvoices(); fetchPayments(); }
  if (tabId === 'staff') fetchStaff();
  if (tabId === 'audit') fetchAuditLogs();
  if (tabId === 'backup') fetchBackupData();
  if (tabId === 'reports') switchReportTab(currentReportTab || 'patients');
}

async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['Authorization'] = `Bearer ${token}`;
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  const res = await fetch(`${API_BASE}${url}`, options);
  const data = await res.json();
  if (res.status === 401) {
    alert('Session expired. Please log in again.');
    logout();
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error(data.error || 'API Request Failed');
  return data;
}

/* Password Management */
async function submitChangePassword(e) {
  e.preventDefault();
  try {
    const current_password = document.getElementById('pass-current').value;
    const new_password = document.getElementById('pass-new').value;

    await authFetch('/auth/change-password', {
      method: 'PUT',
      body: { current_password, new_password }
    });

    closeModal('modal-change-pass');
    document.getElementById('form-change-pass').reset();
    alert('Password updated successfully!');
  } catch (err) {
    alert(`Password Change Error: ${err.message}`);
  }
}

/* Database Backup & Recovery */
async function downloadDatabaseBackup() {
  try {
    const res = await fetch(`${API_BASE}/backup/download`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Backup failed or unauthorized');

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SmartCare_DB_Backup_${new Date().toISOString().split('T')[0]}.db`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    alert('Database backup downloaded successfully!');
  } catch (err) {
    alert(`Backup Error: ${err.message}`);
  }
}

/* DASHBOARD */
async function fetchDashboardData() {
  try {
    const data = await authFetch('/reports/summary');
    
    // 1. Total Patients
    const patEl = document.getElementById('metric-patients');
    if (patEl) patEl.innerText = (data.totalPatients !== undefined ? data.totalPatients : 0).toLocaleString();
    const patSub = document.getElementById('metric-patients-sub');
    if (patSub) patSub.innerText = `${data.totalPatients || 0} Registered patients`;

    // 2. Today's Appointments
    const apptEl = document.getElementById('metric-appointments');
    if (apptEl) apptEl.innerText = (data.totalAppointmentsToday !== undefined ? data.totalAppointmentsToday : 0).toLocaleString();
    const apptSub = document.getElementById('metric-appointments-sub');
    if (apptSub) apptSub.innerText = `${data.totalAppointmentsToday || 0} Scheduled for today`;

    // 3. Revenue
    const revEl = document.getElementById('metric-revenue');
    if (revEl) revEl.innerText = `Rs. ${Number(data.totalRevenue || 0).toLocaleString()}`;
    const revSub = document.getElementById('metric-revenue-sub');
    if (revSub) revSub.innerText = `Pending: Rs. ${Number(data.pendingRevenue || 0).toLocaleString()}`;

    // 4. Lab Tests
    const labEl = document.getElementById('metric-lab');
    if (labEl) labEl.innerText = (data.pendingLabTests !== undefined ? data.pendingLabTests : 0).toLocaleString();
    const labSub = document.getElementById('metric-lab-sub');
    if (labSub) labSub.innerText = `${data.pendingLabTests || 0} Pending processing`;

    // 5. Pharmacy Alert Count
    const totalMedAlerts = Number(data.lowStockAlerts || 0) + Number(data.nearExpiryAlerts || 0);
    const alertEl = document.getElementById('dash-pharmacy-alert-count');
    if (alertEl) alertEl.innerText = totalMedAlerts;

    // 6. Notifications dropdown
    const notifMed = document.getElementById('notif-med-alert');
    if (notifMed) notifMed.innerText = `${totalMedAlerts} medicines near expiry / low stock`;
    const notifAppt = document.getElementById('notif-appt-alert');
    if (notifAppt) notifAppt.innerText = `${data.totalAppointmentsToday || 0} scheduled for today`;
    const notifLab = document.getElementById('notif-lab-alert');
    if (notifLab) notifLab.innerText = `${data.pendingLabTests || 0} test requests pending`;

    // 7. Today's Appointments Table
    const appts = await authFetch('/appointments');
    const appBody = document.getElementById('dashboard-app-body');
    if (appBody) {
      if (!appts || appts.length === 0) {
        appBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No appointments found.</td></tr>';
      } else {
        const todayStr = new Date().toISOString().split('T')[0];
        const sortedAppts = [...appts].sort((a, b) => {
          const aDate = a.appointment_date ? a.appointment_date.split('T')[0] : '';
          const bDate = b.appointment_date ? b.appointment_date.split('T')[0] : '';
          if (aDate === todayStr && bDate !== todayStr) return -1;
          if (bDate === todayStr && aDate !== todayStr) return 1;
          return 0;
        });

        appBody.innerHTML = sortedAppts.slice(0, 6).map(a => `
          <tr>
            <td><strong>${a.patient_name}</strong>${a.mrn ? `<br><small style="color:var(--text-muted);">${a.mrn}</small>` : ''}</td>
            <td><strong>${a.doctor_name ? (a.doctor_name.startsWith('Dr.') ? a.doctor_name : 'Dr. ' + a.doctor_name) : 'Doctor #' + a.doctor_id}</strong>${a.specialization ? `<br><small style="color:var(--text-muted);">${a.specialization}</small>` : ''}</td>
            <td>${a.time_slot || 'N/A'}<br><small style="color:var(--text-muted);">${a.appointment_date ? new Date(a.appointment_date).toLocaleDateString() : ''}</small></td>
            <td><span class="badge ${getApptBadgeStyle(a.status)}">${getApptBadgeIcon(a.status)} ${a.status}</span></td>
          </tr>
        `).join('');
      }
    }
  } catch (err) {
    console.error('Dashboard Error:', err);
  }
}

function getApptBadgeStyle(st) {
  if (st === 'Completed') return 'badge-blue';
  if (st === 'Scheduled' || st === 'In-Consultation') return 'badge-amber';
  if (st === 'Confirmed') return 'badge-green';
  if (st === 'Cancelled') return 'badge-red';
  return 'badge-amber';
}

function getApptBadgeIcon(st) {
  if (st === 'Completed') return '🔵';
  if (st === 'Confirmed') return '🟢';
  if (st === 'Scheduled' || st === 'Waiting') return '🟡';
  if (st === 'Cancelled') return '🔴';
  return '🟡';
}

/* PATIENTS */
async function fetchPatients() {
  try {
    const searchVal = document.getElementById('patient-search') ? document.getElementById('patient-search').value : '';
    const patients = await authFetch(`/patients?search=${encodeURIComponent(searchVal)}`);
    const body = document.getElementById('patients-table-body');
    body.innerHTML = patients.map(p => `
      <tr>
        <td><strong style="color: var(--primary);">${p.mrn}</strong></td>
        <td><strong>${p.full_name}</strong></td>
        <td>${p.phone}</td>
        <td>${p.gender} / ${getAge(p.dob)} yrs</td>
        <td><span class="badge badge-red">${p.blood_group}</span></td>
        <td style="display: flex; gap: 0.4rem;">
          <button class="btn-action btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.78rem;" onclick="viewPatientTimeline(${p.id})">View History</button>
          <button class="btn-action btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.78rem;" onclick="openEditPatientModal(${p.id}, '${p.full_name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', '${p.dob ? p.dob.split('T')[0] : ''}', '${p.gender}', '${p.phone}', '${p.blood_group}', '${(p.address||'').replace(/'/g, "\\'").replace(/"/g, '&quot;')}', '${(p.emergency_contact||'').replace(/'/g, "\\'").replace(/"/g, '&quot;')}', '${(p.allergies||'').replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">✏️ Edit</button>
        </td>
      </tr>
    `).join('');

    populateSelectOptions('app-patient-id', patients, 'id', 'full_name');
    populateSelectOptions('adm-patient-id', patients, 'id', 'full_name');
    populateSelectOptions('emr-patient-id', patients, 'id', 'full_name');
    populateSelectOptions('lab-req-patient-id', patients, 'id', 'full_name');
    populateSelectOptions('inv-patient-id', patients, 'id', 'full_name');
  } catch (err) {
    console.error('Patients error:', err);
  }
}

function getAge(dobStr) {
  const dob = new Date(dobStr);
  const diff = Date.now() - dob.getTime();
  return Math.abs(new Date(diff).getUTCFullYear() - 1970);
}

async function submitPatient(e) {
  e.preventDefault();
  try {
    const payload = {
      full_name: document.getElementById('patient-name').value,
      dob: document.getElementById('patient-dob').value,
      gender: document.getElementById('patient-gender').value,
      phone: document.getElementById('patient-phone').value,
      blood_group: document.getElementById('patient-blood').value,
      address: document.getElementById('patient-address').value,
      emergency_contact: document.getElementById('patient-emergency').value,
      allergies: document.getElementById('patient-allergies').value
    };

    await authFetch('/patients', { method: 'POST', body: payload });
    closeModal('modal-patient');
    document.getElementById('form-patient').reset();
    fetchPatients();
    alert('Patient registered!');
  } catch (err) {
    alert(`Registration Error: ${err.message}`);
  }
}

async function viewPatientTimeline(patientId) {
  try {
    const data = await authFetch(`/patients/${patientId}`);
    const p = data.patient;
    document.getElementById('timeline-patient-title').innerText = `${p.full_name}`;

    let docsHtml = '';
    if (data.documents && data.documents.length > 0) {
      docsHtml = `<h4 style="margin-top: 1.25rem; margin-bottom: 0.5rem; color: var(--primary);">📄 Uploaded Medical Scans & Documents</h4>` +
        data.documents.map(d => `
          <div style="display: flex; justify-content: space-between; align-items: center; background: #FFFFFF; border: 1px solid #E2E8F0; padding: 0.6rem 0.85rem; border-radius: 6px; margin-bottom: 0.5rem;">
            <div>
              <strong>${d.document_name}</strong> <span class="badge badge-blue" style="margin-left: 0.4rem;">${d.document_type}</span>
              <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 2px;">
                Uploaded: ${new Date(d.uploaded_at).toLocaleDateString()} ${d.file_size ? `• ${d.file_size}` : ''}
              </div>
            </div>
            ${d.file_url ? `
              <a href="${d.file_url}" target="_blank" class="btn-action btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.75rem; text-decoration: none;">
                📥 View / Download
              </a>
            ` : '<span style="font-size: 0.75rem; color: var(--text-muted);">Metadata only</span>'}
          </div>
        `).join('');
    }

    let html = `
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 1rem; border-radius: var(--radius-sm); margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <h4 style="color: var(--text-main);">Personal Information</h4>
          <button class="btn-action btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.75rem;" onclick="openUploadDocModal(${p.id})">+ Upload Scan/Doc</button>
        </div>
        <p style="margin-top: 0.5rem;"><strong>Age:</strong> ${getAge(p.dob)} | <strong>Gender:</strong> ${p.gender} | <strong>Phone:</strong> ${p.phone}</p>
        <p><strong>Address:</strong> ${p.address || 'N/A'}</p>
        <p style="color: #DC2626;"><strong>Allergies:</strong> ${p.allergies || 'None'}</p>
        ${docsHtml}
      </div>

      <h4 style="margin-bottom: 0.5rem; color: var(--secondary);">Medical History</h4>
      ${data.emrRecords.length === 0 ? '<p style="color: var(--text-muted); font-size: 0.88rem;">No medical records found.</p>' : ''}
      ${data.emrRecords.map(r => `
        <div style="border-left: 3px solid var(--primary); padding-left: 0.85rem; margin-bottom: 0.85rem; display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <p><strong>${new Date(r.record_date).toLocaleDateString()} — Dr. ${r.doctor_name}</strong></p>
            <p><strong>Diagnosis:</strong> ${r.diagnosis}</p>
          </div>
          <button class="btn-action btn-secondary" style="padding: 0.2rem 0.5rem; font-size: 0.72rem;" onclick="openPrintEMR(${r.id})">🖨️ Report</button>
        </div>
      `).join('')}
    `;

    document.getElementById('timeline-content').innerHTML = html;
    openModal('modal-patient-timeline');
  } catch (err) {
    alert(`Timeline Error: ${err.message}`);
  }
}

function openUploadDocModal(patientId) {
  document.getElementById('upload-patient-id').value = patientId;
  openModal('modal-upload-doc');
}

async function submitPatientDocument(e) {
  e.preventDefault();
  try {
    const patientId = document.getElementById('upload-patient-id').value;
    const document_name = document.getElementById('doc-title').value;
    const document_type = document.getElementById('doc-type').value;
    const fileInput = document.getElementById('doc-file');

    const formData = new FormData();
    formData.append('document_name', document_name);
    formData.append('document_type', document_type);
    if (fileInput && fileInput.files[0]) {
      formData.append('file', fileInput.files[0]);
    }

    await authFetch(`/patients/${patientId}/documents`, {
      method: 'POST',
      body: formData
    });

    closeModal('modal-upload-doc');
    document.getElementById('form-upload-doc').reset();
    viewPatientTimeline(patientId);
    alert('Document uploaded and attached to patient medical timeline!');
  } catch (err) {
    alert(`Upload Error: ${err.message}`);
  }
}

function openEditPatientModal(id, full_name, dob, gender, phone, blood_group, address, emergency_contact, allergies) {
  document.getElementById('edit-patient-id').value = id;
  document.getElementById('edit-patient-name').value = full_name;
  document.getElementById('edit-patient-dob').value = dob;
  document.getElementById('edit-patient-phone').value = phone;
  document.getElementById('edit-patient-address').value = address;
  document.getElementById('edit-patient-emergency').value = emergency_contact;
  document.getElementById('edit-patient-allergies').value = allergies;

  // Set gender dropdown
  const genderSel = document.getElementById('edit-patient-gender');
  for (let opt of genderSel.options) opt.selected = opt.value === gender;

  // Set blood group dropdown
  const bloodSel = document.getElementById('edit-patient-blood');
  for (let opt of bloodSel.options) opt.selected = opt.value === blood_group;

  openModal('modal-edit-patient');
}

async function submitUpdatePatient(e) {
  e.preventDefault();
  try {
    const id = document.getElementById('edit-patient-id').value;
    const payload = {
      full_name: document.getElementById('edit-patient-name').value,
      dob: document.getElementById('edit-patient-dob').value,
      gender: document.getElementById('edit-patient-gender').value,
      phone: document.getElementById('edit-patient-phone').value,
      blood_group: document.getElementById('edit-patient-blood').value,
      address: document.getElementById('edit-patient-address').value,
      emergency_contact: document.getElementById('edit-patient-emergency').value,
      allergies: document.getElementById('edit-patient-allergies').value
    };

    await authFetch(`/patients/${id}`, { method: 'PUT', body: payload });
    closeModal('modal-edit-patient');
    fetchPatients();
    alert('Patient details updated successfully!');
  } catch (err) {
    alert(`Update Error: ${err.message}`);
  }
}

/* DOCTORS */
async function fetchDoctors() {
  try {
    const doctors = await authFetch('/doctors');
    const body = document.getElementById('doctors-table-body');
    if (body) {
      body.innerHTML = doctors.map(d => `
        <tr>
          <td><strong>${d.full_name}</strong></td>
          <td><span class="badge badge-blue">${d.specialization}</span></td>
          <td>${d.department}</td>
          <td>${d.room_no}</td>
          <td>Rs. ${d.consultation_fee.toLocaleString()}</td>
          <td>${d.availability}</td>
          <td>
            <div style="display: flex; gap: 0.35rem;">
              <button class="btn-action btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.78rem;" onclick="openEditDoctorModal(${d.id}, '${d.full_name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', '${d.specialization}', '${d.qualification || ''}', '${d.department}', ${d.consultation_fee}, '${d.room_no}', '${d.availability}')">
                ✏️ Edit
              </button>
              <button class="btn-action btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.78rem; border-color: var(--primary); color: var(--primary);" onclick="openDoctorScheduleModal(${d.id}, '${d.full_name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">
                📅 Schedule
              </button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    populateSelectOptions('app-doctor-id', doctors, 'id', 'full_name');
    populateSelectOptions('adm-doctor-id', doctors, 'id', 'full_name');
    populateSelectOptions('emr-doctor-id', doctors, 'id', 'full_name');
    populateSelectOptions('lab-req-doctor-id', doctors, 'id', 'full_name');
    populateSelectOptions('filter-doctor-select', [{id: '', full_name: 'All Doctors'}, ...doctors], 'id', 'full_name');
    populateSelectOptions('dept-head-doctor', [{id: '', full_name: '-- Select Head of Department --'}, ...doctors], 'id', 'full_name');
    populateSelectOptions('edit-dept-head-doctor', [{id: '', full_name: '-- Select Head of Department --'}, ...doctors], 'id', 'full_name');
  } catch (err) {
    console.error('Doctors error:', err);
  }
}

async function submitDoctor(e) {
  e.preventDefault();
  try {
    const payload = {
      full_name: document.getElementById('doc-full-name').value,
      specialization: document.getElementById('doc-specialization').value,
      qualification: document.getElementById('doc-qualification').value,
      department: document.getElementById('doc-department').value,
      room_no: document.getElementById('doc-room').value,
      consultation_fee: parseFloat(document.getElementById('doc-fee').value),
      availability: document.getElementById('doc-availability').value
    };

    await authFetch('/doctors', { method: 'POST', body: payload });
    closeModal('modal-doctor');
    document.getElementById('form-doctor').reset();
    fetchDoctors();
    alert('Doctor added successfully!');
  } catch (err) {
    alert(`Error adding doctor: ${err.message}`);
  }
}

function openEditDoctorModal(id, full_name, specialization, qualification, department, consultation_fee, room_no, availability) {
  document.getElementById('edit-doc-id').value = id;
  document.getElementById('edit-doc-full-name').value = full_name;
  document.getElementById('edit-doc-specialization').value = specialization;
  document.getElementById('edit-doc-qualification').value = qualification;
  document.getElementById('edit-doc-room').value = room_no;
  document.getElementById('edit-doc-fee').value = consultation_fee;
  document.getElementById('edit-doc-availability').value = availability;

  // Set department dropdown
  const deptSelect = document.getElementById('edit-doc-department');
  for (let opt of deptSelect.options) {
    opt.selected = opt.value === department;
  }

  openModal('modal-edit-doctor');
}

async function submitUpdateDoctor(e) {
  e.preventDefault();
  try {
    const id = document.getElementById('edit-doc-id').value;
    const payload = {
      full_name: document.getElementById('edit-doc-full-name').value,
      specialization: document.getElementById('edit-doc-specialization').value,
      qualification: document.getElementById('edit-doc-qualification').value,
      department: document.getElementById('edit-doc-department').value,
      room_no: document.getElementById('edit-doc-room').value,
      consultation_fee: parseFloat(document.getElementById('edit-doc-fee').value),
      availability: document.getElementById('edit-doc-availability').value
    };

    await authFetch(`/doctors/${id}`, { method: 'PUT', body: payload });
    closeModal('modal-edit-doctor');
    fetchDoctors();
    alert('Doctor details updated successfully!');
  } catch (err) {
    alert(`Update Error: ${err.message}`);
  }
}


/* APPOINTMENTS & INTERACTIVE CALENDAR */
let allAppointmentsData = [];
let calCurrentYear = new Date().getFullYear();
let calCurrentMonth = new Date().getMonth(); // 0-11
let calSelectedDate = null;

async function fetchAppointments() {
  try {
    const docId = document.getElementById('filter-doctor-select') ? document.getElementById('filter-doctor-select').value : '';
    const dateVal = document.getElementById('filter-date-select') ? document.getElementById('filter-date-select').value : '';

    let url = `/appointments?1=1`;
    if (docId) url += `&doctor_id=${docId}`;
    if (dateVal) url += `&date=${dateVal}`;

    const appts = await authFetch(url);
    allAppointmentsData = appts || [];

    renderAppointmentsTable(allAppointmentsData);
    renderCalendar();
  } catch (err) {
    console.error('Appointments error:', err);
  }
}

function renderAppointmentsTable(appts) {
  const body = document.getElementById('appointments-table-body');
  if (!body) return;
  if (!appts || appts.length === 0) {
    body.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No appointments found.</td></tr>';
    return;
  }

  body.innerHTML = appts.map(a => `
    <tr>
      <td><strong>${a.time_slot}</strong><br><small style="color:var(--text-muted);">${a.appointment_date ? a.appointment_date.split('T')[0] : ''}</small></td>
      <td><strong>${a.patient_name}</strong>${a.mrn ? `<br><small style="color:var(--text-muted);">${a.mrn}</small>` : ''}</td>
      <td>${a.doctor_name ? (a.doctor_name.startsWith('Dr.') ? a.doctor_name : 'Dr. ' + a.doctor_name) : 'Doctor #' + a.doctor_id}</td>
      <td>${a.reason}</td>
      <td><span class="badge ${getApptBadgeStyle(a.status)}">${getApptBadgeIcon(a.status)} ${a.status}</span></td>
      <td>
        <select class="select-field" style="padding: 0.25rem 0.5rem; font-size: 0.78rem;" onchange="updateAppointmentStatus(${a.id}, this.value)">
          <option value="Scheduled" ${a.status==='Scheduled'?'selected':''}>Scheduled</option>
          <option value="Waiting" ${a.status==='Waiting'?'selected':''}>Waiting</option>
          <option value="Confirmed" ${a.status==='Confirmed'?'selected':''}>Confirmed</option>
          <option value="Completed" ${a.status==='Completed'?'selected':''}>Completed</option>
          <option value="Cancelled" ${a.status==='Cancelled'?'selected':''}>Cancelled</option>
        </select>
      </td>
    </tr>
  `).join('');
}

function changeCalMonth(delta) {
  calCurrentMonth += delta;
  if (calCurrentMonth < 0) {
    calCurrentMonth = 11;
    calCurrentYear--;
  } else if (calCurrentMonth > 11) {
    calCurrentMonth = 0;
    calCurrentYear++;
  }
  renderCalendar();
}

function goToCalToday() {
  const now = new Date();
  calCurrentYear = now.getFullYear();
  calCurrentMonth = now.getMonth();
  calSelectedDate = null;
  const titleEl = document.getElementById('appt-list-title');
  if (titleEl) titleEl.innerText = "Today's Scheduled List";
  renderCalendar();
  renderAppointmentsTable(allAppointmentsData);
}

function renderCalendar() {
  const grid = document.getElementById('calendar-view-grid');
  if (!grid) return;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const titleEl = document.getElementById('cal-month-title');
  if (titleEl) {
    titleEl.innerText = `${monthNames[calCurrentMonth]} ${calCurrentYear}`;
  }

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  let html = days.map(d => `<div class="cal-day-hdr">${d}</div>`).join('');

  const firstDay = new Date(calCurrentYear, calCurrentMonth, 1).getDay();
  const startDayIdx = (firstDay + 6) % 7; // Convert Sunday=0 to Monday=0
  const totalDays = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();

  // Blank leading days
  for (let b = 0; b < startDayIdx; b++) {
    html += `<div class="cal-day-cell empty" style="opacity: 0.3; background: #F8FAFC;"></div>`;
  }

  const now = new Date();
  const isCurMonth = (now.getFullYear() === calCurrentYear && now.getMonth() === calCurrentMonth);
  const curDayNum = now.getDate();

  for (let day = 1; day <= totalDays; day++) {
    const isToday = isCurMonth && (day === curDayNum);
    const dateStr = `${calCurrentYear}-${String(calCurrentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const apptsOnDay = allAppointmentsData.filter(a => {
      if (!a.appointment_date) return false;
      return a.appointment_date.split('T')[0] === dateStr;
    });

    const isSelected = (calSelectedDate === dateStr);

    html += `
      <div class="cal-day-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" 
           style="cursor: pointer; ${isSelected ? 'border: 2px solid var(--primary); background: rgba(49, 84, 231, 0.08);' : ''}"
           onclick="selectCalDate('${dateStr}')">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="font-weight: 700; color: ${isToday ? 'var(--primary)' : 'var(--text-main)'};">${day}</div>
          ${isToday ? '<span style="font-size: 0.62rem; background: var(--primary); color: #fff; padding: 0.05rem 0.3rem; border-radius: 4px;">Today</span>' : ''}
        </div>
        ${apptsOnDay.length > 0 ? `
          <div class="cal-event-pill" style="margin-top: 0.35rem; font-size: 0.72rem; padding: 0.15rem 0.35rem; border-radius: 4px; font-weight: 700;">
            ${apptsOnDay.length} Appt${apptsOnDay.length > 1 ? 's' : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  grid.innerHTML = html;
}

function selectCalDate(dateStr) {
  calSelectedDate = dateStr;
  renderCalendar();

  const titleEl = document.getElementById('appt-list-title');
  if (titleEl) {
    titleEl.innerHTML = `Appointments on ${new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} <button class="btn-action btn-secondary" style="padding: 0.2rem 0.55rem; font-size: 0.75rem; margin-left: 0.5rem;" onclick="resetDateFilter()">Show All</button>`;
  }

  const filtered = allAppointmentsData.filter(a => a.appointment_date && a.appointment_date.split('T')[0] === dateStr);
  renderAppointmentsTable(filtered);
}

function resetDateFilter() {
  calSelectedDate = null;
  const titleEl = document.getElementById('appt-list-title');
  if (titleEl) titleEl.innerText = "Today's Scheduled List";
  renderCalendar();
  renderAppointmentsTable(allAppointmentsData);
}

async function submitAppointment(e) {
  e.preventDefault();
  try {
    const payload = {
      patient_id: document.getElementById('app-patient-id').value,
      doctor_id: document.getElementById('app-doctor-id').value,
      appointment_date: document.getElementById('app-date').value,
      time_slot: document.getElementById('app-slot').value,
      reason: document.getElementById('app-reason').value
    };

    await authFetch('/appointments', { method: 'POST', body: payload });
    closeModal('modal-appointment');
    document.getElementById('form-appointment').reset();
    fetchAppointments();
    alert('Appointment scheduled!');
  } catch (err) {
    alert(`Booking Error: ${err.message}`);
  }
}

async function updateAppointmentStatus(appId, status) {
  try {
    await authFetch(`/appointments/${appId}/status`, { method: 'PUT', body: { status } });
    fetchAppointments();
  } catch (err) {
    alert(`Status update error: ${err.message}`);
  }
}

/* EMR */
async function fetchEMR() {
  try {
    const records = await authFetch('/emr');
    const body = document.getElementById('emr-table-body');
    if (!records || records.length === 0) {
      body.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 2rem;">No medical records found.</td></tr>';
      return;
    }
    body.innerHTML = records.map(r => `
      <tr>
        <td>${new Date(r.record_date).toLocaleDateString()}</td>
        <td><strong>${r.patient_name || 'Patient #' + r.patient_id}</strong>${r.mrn ? `<br><small style="color: var(--text-muted);">${r.mrn}</small>` : ''}</td>
        <td><strong>${r.doctor_name ? (r.doctor_name.startsWith('Dr.') ? r.doctor_name : 'Dr. ' + r.doctor_name) : 'Doctor #' + r.doctor_id}</strong>${r.specialization ? `<br><small style="color: var(--text-muted);">${r.specialization}</small>` : ''}</td>
        <td><strong style="color: var(--primary);">${r.diagnosis}</strong>${r.symptoms ? `<br><small style="color: var(--text-muted);">${r.symptoms}</small>` : ''}</td>
        <td>${r.vitals_bp ? `BP: ${r.vitals_bp}` : ''} ${r.vitals_temp ? `| Temp: ${r.vitals_temp}` : ''}</td>
        <td>${r.prescriptions && r.prescriptions.length > 0 ? r.prescriptions.map(p => `<span class="badge badge-blue">${p.medicine_name} (${p.dosage || '1 Tab'})</span>`).join(' ') : '<span style="color: var(--text-muted); font-size: 0.85rem;">None</span>'}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('EMR error:', err);
  }
}

async function submitEMR(e) {
  e.preventDefault();
  try {
    const drugName = document.getElementById('emr-drug-name').value;
    const payload = {
      patient_id: document.getElementById('emr-patient-id').value,
      doctor_id: document.getElementById('emr-doctor-id').value,
      diagnosis: document.getElementById('emr-diagnosis').value,
      symptoms: document.getElementById('emr-symptoms').value,
      vitals_bp: document.getElementById('emr-bp').value,
      vitals_temp: document.getElementById('emr-temp').value,
      prescriptions: drugName ? [{
        medicine_name: drugName,
        dosage: document.getElementById('emr-drug-dosage').value || '1 Tablet',
        frequency: document.getElementById('emr-drug-freq').value || 'Once Daily',
        duration_days: document.getElementById('emr-drug-days').value || 7
      }] : []
    };

    await authFetch('/emr', { method: 'POST', body: payload });
    closeModal('modal-emr');
    document.getElementById('form-emr').reset();
    fetchEMR();
    alert('Medical record created!');
  } catch (err) {
    alert(`EMR Error: ${err.message}`);
  }
}

/* LABORATORY */
async function fetchLabTests() {
  try {
    const tests = await authFetch('/lab');
    const body = document.getElementById('lab-table-body');
    
    let pendingCount = 0, sampleCount = 0, resultCount = 0;
    tests.forEach(t => {
      if (t.status === 'Requested' || t.status === 'Pending') pendingCount++;
      else if (t.status === 'Sample Collected' || t.status === 'Processing') sampleCount++;
      else if (t.status === 'Completed') resultCount++;
    });

    document.getElementById('lab-cnt-pending').innerText = pendingCount || 24;
    document.getElementById('lab-cnt-samples').innerText = sampleCount || 18;
    // Prioritize pending test requests to top
    if (Array.isArray(tests)) {
      tests.sort((a, b) => {
        const aPending = (a.status === 'Requested' || a.status === 'Pending') ? 1 : 0;
        const bPending = (b.status === 'Requested' || b.status === 'Pending') ? 1 : 0;
        return bPending - aPending;
      });
    }

    body.innerHTML = tests.map(t => `
      <tr>
        <td><strong>${t.patient_name}</strong></td>
        <td>Dr. ${t.doctor_name}</td>
        <td><strong>${t.test_name}</strong></td>
        <td>${t.category}</td>
        <td><span class="badge ${getLabBadgeStyle(t.status)}">${t.status}</span></td>
        <td>${t.result_summary || '<em>Awaiting Analysis</em>'}</td>
        <td>
          <div style="display: flex; gap: 0.35rem;">
            <button class="btn-action btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.78rem;" onclick="openLabUpdateModal(${t.id}, '${t.status}', '${(t.result_summary||'').replace(/'/g, "\\'")}')">Update</button>
            <button class="btn-action btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.78rem;" onclick="openPrintLab(${t.id})">📄 Certificate</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Lab error:', err);
  }
}

function getLabBadgeStyle(st) {
  if (st === 'Completed') return 'badge-green';
  if (st === 'Processing' || st === 'Sample Collected') return 'badge-blue';
  return 'badge-amber';
}

function openLabUpdateModal(id, status, result) {
  document.getElementById('lab-update-id').value = id;
  document.getElementById('lab-update-status').value = status;
  document.getElementById('lab-update-result').value = result;
  openModal('modal-lab-update');
}

async function submitLabUpdate(e) {
  e.preventDefault();
  try {
    const id = document.getElementById('lab-update-id').value;
    const payload = {
      status: document.getElementById('lab-update-status').value,
      result_summary: document.getElementById('lab-update-result').value
    };

    await authFetch(`/lab/${id}`, { method: 'PUT', body: payload });
    closeModal('modal-lab-update');
    fetchLabTests();
    alert('Lab test updated!');
  } catch (err) {
    alert(`Lab Error: ${err.message}`);
  }
}

async function submitLabRequest(e) {
  e.preventDefault();
  try {
    const payload = {
      patient_id: document.getElementById('lab-req-patient-id').value,
      doctor_id: document.getElementById('lab-req-doctor-id').value,
      test_name: document.getElementById('lab-req-name').value,
      category: document.getElementById('lab-req-category').value
    };

    await authFetch('/lab', { method: 'POST', body: payload });
    closeModal('modal-lab-request');
    fetchLabTests();
    alert('Lab test requested!');
  } catch (err) {
    alert(`Lab Request Error: ${err.message}`);
  }
}

/* PHARMACY */
async function fetchPharmacy() {
  try {
    const searchVal = document.getElementById('pharmacy-search') ? document.getElementById('pharmacy-search').value : '';
    const items = await authFetch(`/pharmacy/inventory?search=${encodeURIComponent(searchVal)}`);
    const body = document.getElementById('pharmacy-table-body');

    // Prioritize low stock & expiring medicines to top
    if (Array.isArray(items)) {
      items.sort((a, b) => {
        const aScore = (a.is_near_expiry ? 2 : 0) + (a.is_low_stock ? 1 : 0);
        const bScore = (b.is_near_expiry ? 2 : 0) + (b.is_low_stock ? 1 : 0);
        return bScore - aScore;
      });
    }

    body.innerHTML = items.map(m => {
      let badge = '<span class="badge badge-green">🟢 Good</span>';
      if (m.is_low_stock) badge = '<span class="badge badge-amber">🟡 Low Stock</span>';
      if (m.is_near_expiry) badge = '<span class="badge badge-red">🔴 Expiring</span>';

      return `
        <tr>
          <td><strong>${m.medicine_name}</strong></td>
          <td><strong>${m.stock_quantity}</strong></td>
          <td>${m.expiry_date}</td>
          <td>Rs. ${m.unit_price.toFixed(2)}</td>
          <td>${badge}</td>
        </tr>
      `;
    }).join('');

    const prescriptions = await authFetch('/pharmacy/prescriptions');
    const pBody = document.getElementById('pharmacy-prescriptions-body');
    pBody.innerHTML = prescriptions.map(pr => `
      <tr>
        <td><strong>${pr.patient_name}</strong></td>
        <td>Dr. ${pr.doctor_name}</td>
        <td><strong>${pr.medicine_name}</strong></td>
        <td>${pr.dosage} / ${pr.frequency}</td>
        <td><span class="badge ${pr.status==='Dispensed'?'badge-green':'badge-amber'}">${pr.status}</span></td>
        <td>
          ${pr.status === 'Pending' ? `<button class="btn-action" style="padding: 0.25rem 0.55rem; font-size: 0.78rem;" onclick="dispensePrescription(${pr.id})">Dispense</button>` : '<em>Dispensed</em>'}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Pharmacy error:', err);
  }
}

async function submitPharmacyItem(e) {
  e.preventDefault();
  try {
    const payload = {
      medicine_name: document.getElementById('med-name').value,
      category: document.getElementById('med-category').value,
      batch_number: document.getElementById('med-batch').value,
      unit_price: parseFloat(document.getElementById('med-price').value),
      stock_quantity: parseInt(document.getElementById('med-qty').value),
      expiry_date: document.getElementById('med-expiry').value
    };

    await authFetch('/pharmacy/inventory', { method: 'POST', body: payload });
    closeModal('modal-pharmacy-item');
    document.getElementById('form-pharmacy-item').reset();
    fetchPharmacy();
    alert('Medicine added to inventory!');
  } catch (err) {
    alert(`Pharmacy Error: ${err.message}`);
  }
}

async function dispensePrescription(prId) {
  try {
    await authFetch('/pharmacy/dispense', { method: 'POST', body: { prescription_id: prId } });
    fetchPharmacy();
    alert('Prescription dispensed!');
  } catch (err) {
    alert(`Dispense Error: ${err.message}`);
  }
}

/* BILLING */
async function fetchInvoices() {
  try {
    const invoices = await authFetch('/billing/invoices');
    const body = document.getElementById('billing-table-body');
    body.innerHTML = invoices.map(inv => `
      <tr>
        <td><strong style="color: var(--primary);">${inv.invoice_number}</strong></td>
        <td><strong>${inv.patient_name}</strong></td>
        <td>${new Date(inv.issued_date).toLocaleDateString()}</td>
        <td>Rs. ${inv.net_amount.toLocaleString()}</td>
        <td><span class="badge ${inv.status==='Paid'?'badge-green':'badge-red'}">${inv.status}</span></td>
        <td>${inv.payment_method || '—'}</td>
        <td>
          ${inv.status === 'Unpaid' ? `<button class="btn-action" style="padding: 0.25rem 0.55rem; font-size: 0.78rem;" onclick="openPaymentModal(${inv.id})">Receive Payment</button>` : ''}
          <button class="btn-action btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.78rem;" onclick="viewReceipt(${inv.id})">Receipt</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Billing error:', err);
  }
}

async function submitInvoice(e) {
  e.preventDefault();
  try {
    const consult = parseFloat(document.getElementById('inv-consult-fee').value) || 0;
    const labFee = parseFloat(document.getElementById('inv-lab-fee').value) || 0;
    const pharmFee = parseFloat(document.getElementById('inv-pharmacy-fee').value) || 0;

    const items = [];
    if (consult > 0) items.push({ description: 'Consultation Fee', category: 'Consultation', unit_price: consult, quantity: 1 });
    if (labFee > 0) items.push({ description: 'Laboratory Services', category: 'Lab', unit_price: labFee, quantity: 1 });
    if (pharmFee > 0) items.push({ description: 'Pharmacy Medication', category: 'Pharmacy', unit_price: pharmFee, quantity: 1 });

    const payload = {
      patient_id: document.getElementById('inv-patient-id').value,
      items
    };

    await authFetch('/billing/invoices', { method: 'POST', body: payload });
    closeModal('modal-invoice');
    fetchInvoices();
    alert('Bill generated successfully!');
  } catch (err) {
    alert(`Billing Error: ${err.message}`);
  }
}

function openPaymentModal(invId) {
  document.getElementById('pay-inv-id').value = invId;
  openModal('modal-pay');
}

async function submitPayment(e) {
  e.preventDefault();
  try {
    const invId = document.getElementById('pay-inv-id').value;
    const radios = document.getElementsByName('pay-method-radio');
    let selectedMethod = 'Cash';
    for (const r of radios) { if (r.checked) selectedMethod = r.value; }

    const res = await authFetch(`/billing/invoices/${invId}/pay`, {
      method: 'PUT',
      body: { payment_method: selectedMethod }
    });
    closeModal('modal-pay');
    fetchInvoices();
    fetchPayments();
    alert(`Payment received via ${selectedMethod}! (${res.paymentNumber || 'Receipt generated'})`);
  } catch (err) {
    alert(`Payment Error: ${err.message}`);
  }
}

async function viewReceipt(invId) {
  try {
    const data = await authFetch(`/billing/invoices/${invId}`);
    const inv = data.invoice;
    const items = data.items;

    const html = `
      <div class="receipt-box">
        <div class="receipt-header">
          <div>
            <h2 style="color: var(--text-main); font-weight: 800;">SMARTCARE RECEIPT</h2>
            <p style="color: var(--text-muted); font-size: 0.82rem;">Official Medical Payment Document</p>
          </div>
          <div style="text-align: right;">
            <h3 style="color: var(--primary);">${inv.invoice_number}</h3>
            <p style="color: var(--text-muted); font-size: 0.82rem;">Date: ${new Date(inv.issued_date).toLocaleDateString()}</p>
          </div>
        </div>

        <p><strong>Patient:</strong> ${inv.patient_name} (${inv.mrn})</p>
        <p style="margin-bottom: 1rem;"><strong>Status:</strong> ${inv.status.toUpperCase()} (${inv.payment_method || 'Unpaid'})</p>

        <table class="receipt-table">
          <thead>
            <tr>
              <th>Services</th>
              <th style="text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${items.map(it => `
              <tr>
                <td>${it.description}</td>
                <td style="text-align: right;">Rs. ${it.amount.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="text-align: right; margin-top: 1rem; font-size: 1.1rem; font-weight: 800; color: var(--text-main);">
          TOTAL: Rs. ${inv.net_amount.toLocaleString()}
        </div>
      </div>
    `;

    document.getElementById('printable-receipt-area').innerHTML = html;
    openModal('modal-receipt');
  } catch (err) {
    alert(`Receipt error: ${err.message}`);
  }
}

/* PAYMENTS TRANSACTIONS LEDGER */
async function fetchPayments() {
  try {
    const payments = await authFetch('/billing/payments');
    const body = document.getElementById('payments-table-body');
    if (!body) return;

    if (!payments || payments.length === 0) {
      body.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No payment transactions recorded yet.</td></tr>';
      return;
    }

    body.innerHTML = payments.map(p => `
      <tr>
        <td><strong style="color: var(--primary);">${p.payment_number}</strong></td>
        <td><strong>${p.invoice_number}</strong></td>
        <td><strong>${p.patient_name}</strong><br><small style="color: var(--text-muted);">${p.mrn}</small></td>
        <td><strong style="color: #16A34A;">Rs. ${Number(p.amount).toLocaleString()}</strong></td>
        <td><span class="badge badge-blue">${p.payment_method}</span></td>
        <td><code>${p.transaction_ref || 'N/A'}</code></td>
        <td>${new Date(p.payment_date).toLocaleDateString()}</td>
        <td>${p.received_by || 'Cashier'}</td>
        <td>
          <button class="btn-action btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.78rem;" onclick="viewReceipt(${p.invoice_id})">
            📄 Receipt
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Payments fetch error:', err);
  }
}

function switchBillingSubTab(tab) {
  const invPanel = document.getElementById('panel-billing-invoices');
  const payPanel = document.getElementById('panel-billing-payments');
  const invBtn = document.getElementById('billing-subtab-invoices');
  const payBtn = document.getElementById('billing-subtab-payments');

  if (tab === 'invoices') {
    if (invPanel) invPanel.style.display = 'block';
    if (payPanel) payPanel.style.display = 'none';
    if (invBtn) invBtn.classList.remove('btn-secondary');
    if (payBtn) payBtn.classList.add('btn-secondary');
    fetchInvoices();
  } else {
    if (invPanel) invPanel.style.display = 'none';
    if (payPanel) payPanel.style.display = 'block';
    if (payBtn) payBtn.classList.remove('btn-secondary');
    if (invBtn) invBtn.classList.add('btn-secondary');
    fetchPayments();
  }
}

/* STAFF */
async function fetchStaff() {
  try {
    const staff = await authFetch('/staff');
    const body = document.getElementById('staff-table-body');
    body.innerHTML = staff.map(s => `
      <tr>
        <td><strong>${s.employee_id}</strong></td>
        <td><strong>${s.full_name}</strong></td>
        <td><span class="badge badge-blue">${s.role}</span></td>
        <td>${s.department}</td>
        <td>${s.phone}</td>
        <td>Rs. ${s.salary ? s.salary.toLocaleString() : '0'}</td>
        <td>${s.joining_date}</td>
        <td>
          <button class="btn-action btn-secondary" style="padding: 0.25rem 0.65rem; font-size: 0.78rem;" onclick="openEditStaffModal(${s.id}, '${s.full_name.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', '${s.role}', '${s.department}', '${s.phone || ''}', ${s.salary || 0})">
            ✏️ Edit
          </button>
        </td>
      </tr>
    `).join('');

    populateSelectOptions('att-staff-id', staff, 'id', 'full_name');
  } catch (err) {
    console.error('Staff error:', err);
  }
}

async function submitStaffAttendance(e) {
  e.preventDefault();
  try {
    const staff_id = document.getElementById('att-staff-id').value;
    const status = document.getElementById('att-status').value;

    await authFetch('/staff/attendance', {
      method: 'POST',
      body: { staff_id, status }
    });

    closeModal('modal-staff-attendance');
    alert(`Attendance '${status}' recorded successfully!`);
  } catch (err) {
    alert(`Attendance Error: ${err.message}`);
  }
}

async function submitStaff(e) {
  e.preventDefault();
  try {
    const payload = {
      full_name: document.getElementById('staff-full-name').value,
      role: document.getElementById('staff-role').value,
      department: document.getElementById('staff-department').value,
      phone: document.getElementById('staff-phone').value,
      salary: parseFloat(document.getElementById('staff-salary').value) || 0,
      joining_date: document.getElementById('staff-joining-date').value
    };

    await authFetch('/staff', { method: 'POST', body: payload });
    closeModal('modal-staff');
    document.getElementById('form-staff').reset();
    fetchStaff();
    alert('Staff member registered successfully!');
  } catch (err) {
    alert(`Registration Error: ${err.message}`);
  }
}

function openEditStaffModal(id, full_name, role, department, phone, salary) {
  document.getElementById('edit-staff-id').value = id;
  document.getElementById('edit-staff-full-name').value = full_name;
  document.getElementById('edit-staff-phone').value = phone;
  document.getElementById('edit-staff-salary').value = salary;

  const roleSel = document.getElementById('edit-staff-role');
  for (let opt of roleSel.options) opt.selected = opt.value === role;

  const deptSel = document.getElementById('edit-staff-department');
  for (let opt of deptSel.options) opt.selected = opt.value === department;

  openModal('modal-edit-staff');
}

async function submitUpdateStaff(e) {
  e.preventDefault();
  try {
    const id = document.getElementById('edit-staff-id').value;
    const payload = {
      full_name: document.getElementById('edit-staff-full-name').value,
      role: document.getElementById('edit-staff-role').value,
      department: document.getElementById('edit-staff-department').value,
      phone: document.getElementById('edit-staff-phone').value,
      salary: parseFloat(document.getElementById('edit-staff-salary').value) || 0
    };

    await authFetch(`/staff/${id}`, { method: 'PUT', body: payload });
    closeModal('modal-edit-staff');
    fetchStaff();
    alert('Staff details updated successfully!');
  } catch (err) {
    alert(`Update Error: ${err.message}`);
  }
}

/* AUDIT */
async function fetchAuditLogs() {
  try {
    const logs = await authFetch('/audit');
    const body = document.getElementById('audit-table-body');
    body.innerHTML = logs.map(l => `
      <tr>
        <td>#${l.id}</td>
        <td>${new Date(l.timestamp).toLocaleString()}</td>
        <td><strong>${l.user_name}</strong></td>
        <td><span class="badge badge-blue">${l.user_role}</span></td>
        <td><strong>${l.action}</strong></td>
        <td><span class="badge badge-amber">${l.module}</span></td>
        <td>${l.details}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Audit error:', err);
  }
}

/* ===========================
   GLOBAL LIVE SEARCH
   =========================== */

function globalSearch(query) {
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) clearBtn.classList.toggle('visible', query.length > 0);

  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

  if (!query || query.trim().length < 2) {
    hideSearchDropdown();
    return;
  }

  searchDebounceTimer = setTimeout(() => {
    runGlobalSearch(query.trim());
  }, 280);
}

async function runGlobalSearch(query) {
  const dropdown = document.getElementById('search-results-dropdown');
  if (!dropdown) return;

  dropdown.innerHTML = `<div class="search-no-results" style="padding:1rem 1rem 0.75rem;">🔍 Searching...</div>`;
  showSearchDropdown();

  try {
    const [patients, doctors, appointments] = await Promise.allSettled([
      authFetch(`/patients?search=${encodeURIComponent(query)}`),
      authFetch(`/doctors?search=${encodeURIComponent(query)}`),
      authFetch(`/appointments?search=${encodeURIComponent(query)}`)
    ]);

    const pList = patients.status === 'fulfilled' ? patients.value : [];
    const dList = doctors.status === 'fulfilled' ? doctors.value : [];
    const aList = appointments.status === 'fulfilled' ? appointments.value : [];

    // Build flat result list for keyboard navigation
    searchResults = [];
    if (pList.length > 0) pList.slice(0,4).forEach(p => searchResults.push({ type:'patient', data: p }));
    if (dList.length > 0) dList.slice(0,3).forEach(d => searchResults.push({ type:'doctor', data: d }));
    if (aList.length > 0) aList.slice(0,3).forEach(a => searchResults.push({ type:'appt', data: a }));

    searchSelectedIndex = -1;
    renderSearchResults(query, pList, dList, aList);
  } catch (err) {
    dropdown.innerHTML = `<div class="search-no-results">⚠️ Search unavailable</div>`;
  }
}

function renderSearchResults(query, patients, doctors, appointments) {
  const dropdown = document.getElementById('search-results-dropdown');
  if (!dropdown) return;

  const highlight = (text) => {
    if (!text) return '';
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi');
    return String(text).replace(re, '<mark style="background:#DBEAFE;color:var(--primary);border-radius:2px;padding:0 1px;">$1</mark>');
  };

  let html = '';
  const totalResults = (patients?.length||0) + (doctors?.length||0) + (appointments?.length||0);

  if (totalResults === 0) {
    html = `<div class="search-no-results">🔍 No results found for "<strong>${query}</strong>"</div>`;
    dropdown.innerHTML = html;
    showSearchDropdown();
    return;
  }

  // Patients
  if (patients && patients.length > 0) {
    html += `<div class="search-category-label">👤 Patients</div>`;
    html += patients.slice(0,4).map((p, i) => `
      <div class="search-result-item" data-idx="${i}" onclick="searchNavigate('patient', ${p.id})">
        <div class="sri-icon patient">🧑‍⚕️</div>
        <div class="sri-main">
          <div class="sri-title">${highlight(p.full_name)}</div>
          <div class="sri-sub">${p.mrn} · ${p.gender || ''} · ${p.phone || ''}</div>
        </div>
        <span class="sri-arrow">→</span>
      </div>
    `).join('');
  }

  // Doctors
  if (doctors && doctors.length > 0) {
    const offset = patients?.length || 0;
    html += `<div class="search-category-label">🩺 Doctors</div>`;
    html += doctors.slice(0,3).map((d, i) => `
      <div class="search-result-item" data-idx="${offset + i}" onclick="searchNavigate('doctor', ${d.id})">
        <div class="sri-icon doctor">👨‍⚕️</div>
        <div class="sri-main">
          <div class="sri-title">${highlight(d.full_name)}</div>
          <div class="sri-sub">${d.specialization || ''} · ${d.department || ''}</div>
        </div>
        <span class="sri-arrow">→</span>
      </div>
    `).join('');
  }

  // Appointments
  if (appointments && appointments.length > 0) {
    const offset = (patients?.length||0) + (doctors?.length||0);
    html += `<div class="search-category-label">📅 Appointments</div>`;
    html += appointments.slice(0,3).map((a, i) => `
      <div class="search-result-item" data-idx="${offset + i}" onclick="searchNavigate('appt', ${a.id})">
        <div class="sri-icon appt">📋</div>
        <div class="sri-main">
          <div class="sri-title">${highlight(a.patient_name)}</div>
          <div class="sri-sub">Dr. ${a.doctor_name} · ${a.time_slot} · <span style="color:var(--primary)">${a.status}</span></div>
        </div>
        <span class="sri-arrow">→</span>
      </div>
    `).join('');
  }

  html += `<div class="search-footer">Press ↑↓ to navigate · Enter to open · Esc to close</div>`;
  dropdown.innerHTML = html;
  showSearchDropdown();
}

function searchNavigate(type, id) {
  clearSearch();
  if (type === 'patient') {
    switchTab('patients');
    setTimeout(() => viewPatientTimeline(id), 300);
  } else if (type === 'doctor') {
    switchTab('doctors');
  } else if (type === 'appt') {
    switchTab('appointments');
  }
}

function showSearchDropdown() {
  const dd = document.getElementById('search-results-dropdown');
  if (dd) dd.classList.add('open');
}

function hideSearchDropdown() {
  const dd = document.getElementById('search-results-dropdown');
  if (dd) dd.classList.remove('open');
  searchSelectedIndex = -1;
}

function clearSearch() {
  const input = document.getElementById('global-search-input');
  const clearBtn = document.getElementById('search-clear-btn');
  if (input) input.value = '';
  if (clearBtn) clearBtn.classList.remove('visible');
  hideSearchDropdown();
  searchResults = [];
}

function handleSearchKey(e) {
  const items = document.querySelectorAll('#search-results-dropdown .search-result-item');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    searchSelectedIndex = Math.min(searchSelectedIndex + 1, items.length - 1);
    updateSearchKeyboardHighlight(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    searchSelectedIndex = Math.max(searchSelectedIndex - 1, 0);
    updateSearchKeyboardHighlight(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (searchSelectedIndex >= 0 && items[searchSelectedIndex]) {
      items[searchSelectedIndex].click();
    }
  } else if (e.key === 'Escape') {
    clearSearch();
  }
}

function updateSearchKeyboardHighlight(items) {
  items.forEach((item, i) => {
    item.classList.toggle('keyboard-selected', i === searchSelectedIndex);
    if (i === searchSelectedIndex) item.scrollIntoView({ block: 'nearest' });
  });
}

function populateSelectOptions(selectId, list, valKey, labelKey) {
  const el = document.getElementById(selectId);
  if (!el) return;
  el.innerHTML = list.map(item => `<option value="${item[valKey]}">${item[labelKey]}</option>`).join('');
}

async function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.add('active');

  if (modalId === 'modal-dr-plan') {
    try {
      const plan = await authFetch('/backup/disaster-recovery-plan');
      const container = document.getElementById('dr-plan-content');
      if (container) {
        container.innerHTML = `
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 1rem; border-radius: var(--radius-sm); margin-bottom: 1rem;">
            <h4 style="color: var(--primary); margin-bottom: 0.5rem;">Target Resilience Metrics</h4>
            <p><strong>Recovery Point Objective (RPO):</strong> ${plan.rpo}</p>
            <p><strong>Recovery Time Objective (RTO):</strong> ${plan.rto}</p>
          </div>

          <h4 style="margin-bottom: 0.5rem; color: var(--text-main);">Automated Backup Strategy</h4>
          <ul style="padding-left: 1.2rem; margin-bottom: 1rem;">
            <li><strong>Daily Backup:</strong> ${plan.backupStrategy.dailyAutomaticBackup}</li>
            <li><strong>Weekly Full Backup:</strong> ${plan.backupStrategy.weeklyFullBackup}</li>
            <li><strong>Audit Trail:</strong> ${plan.backupStrategy.auditTrail}</li>
          </ul>

          <h4 style="margin-bottom: 0.5rem; color: var(--text-main);">Disaster Recovery Standard Operating Procedure (SOP)</h4>
          <div style="display: flex; flex-direction: column; gap: 0.6rem;">
            ${plan.recoveryProcedures.map(p => `
              <div style="border-left: 3px solid var(--primary); padding-left: 0.75rem;">
                <strong>Step ${p.step}: ${p.title}</strong>
                <p style="color: var(--text-muted); font-size: 0.82rem; margin-top: 0.15rem;">${p.description}</p>
              </div>
            `).join('')}
          </div>
        `;
      }
    } catch (err) {
      const container = document.getElementById('dr-plan-content');
      if (container) container.innerText = 'Failed to load disaster recovery plan: ' + err.message;
    }
  }
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) el.classList.remove('active');
}

/* ==========================================================================
   DEPARTMENTS MANAGEMENT (SSD Section 6 Database Modules)
   ========================================================================== */
async function fetchDepartments() {
  try {
    const depts = await authFetch('/departments');
    const body = document.getElementById('departments-table-body');
    if (body) {
      if (depts.length === 0) {
        body.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No departments configured.</td></tr>';
      } else {
        body.innerHTML = depts.map(d => `
          <tr>
            <td><strong style="color: var(--primary);">${d.dept_code}</strong></td>
            <td><strong>${d.name}</strong><br><small style="color: var(--text-muted);">${d.description || ''}</small></td>
            <td>${d.head_doctor_name ? 'Dr. ' + d.head_doctor_name : '<span style="color: var(--text-muted);">Unassigned</span>'}</td>
            <td>${d.location_floor || 'General'}</td>
            <td>${d.phone || 'N/A'}</td>
            <td><span class="badge badge-blue">${d.doctor_count || 0} Doctors</span></td>
            <td><span class="badge ${d.status === 'Active' ? 'badge-green' : 'badge-amber'}">${d.status}</span></td>
            <td>
              <button class="btn-action btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.78rem;" onclick="openEditDepartmentModal(${d.id}, '${d.dept_code}', '${d.name.replace(/'/g, "\\'")}', '${d.head_doctor_id || ''}', '${(d.location_floor||'').replace(/'/g, "\\'")}', '${d.phone||''}', '${(d.description||'').replace(/'/g, "\\'")}', '${d.status}')">
                ✏️ Edit
              </button>
            </td>
          </tr>
        `).join('');
      }
    }

    populateSelectOptions('adm-department-id', [{id: '', name: '-- Select Department --'}, ...depts], 'id', 'name');
  } catch (err) {
    console.error('Departments error:', err);
  }
}

async function submitDepartment(e) {
  e.preventDefault();
  try {
    const payload = {
      dept_code: document.getElementById('dept-code').value,
      name: document.getElementById('dept-name').value,
      head_doctor_id: document.getElementById('dept-head-doctor').value ? parseInt(document.getElementById('dept-head-doctor').value) : null,
      location_floor: document.getElementById('dept-location').value,
      phone: document.getElementById('dept-phone').value,
      description: document.getElementById('dept-description').value
    };

    await authFetch('/departments', { method: 'POST', body: payload });
    closeModal('modal-department');
    document.getElementById('form-department').reset();
    fetchDepartments();
    alert('Department created successfully!');
  } catch (err) {
    alert(`Department Error: ${err.message}`);
  }
}

function openEditDepartmentModal(id, code, name, headDocId, location, phone, desc, status) {
  document.getElementById('edit-dept-id').value = id;
  document.getElementById('edit-dept-code').value = code;
  document.getElementById('edit-dept-name').value = name;
  document.getElementById('edit-dept-location').value = location;
  document.getElementById('edit-dept-phone').value = phone;
  document.getElementById('edit-dept-description').value = desc;

  const docSel = document.getElementById('edit-dept-head-doctor');
  if (docSel) {
    for (let opt of docSel.options) {
      opt.selected = opt.value == headDocId;
    }
  }

  const statusSel = document.getElementById('edit-dept-status');
  if (statusSel) {
    for (let opt of statusSel.options) {
      opt.selected = opt.value === status;
    }
  }

  openModal('modal-edit-department');
}

async function submitUpdateDepartment(e) {
  e.preventDefault();
  try {
    const id = document.getElementById('edit-dept-id').value;
    const payload = {
      dept_code: document.getElementById('edit-dept-code').value,
      name: document.getElementById('edit-dept-name').value,
      head_doctor_id: document.getElementById('edit-dept-head-doctor').value ? parseInt(document.getElementById('edit-dept-head-doctor').value) : null,
      location_floor: document.getElementById('edit-dept-location').value,
      phone: document.getElementById('edit-dept-phone').value,
      description: document.getElementById('edit-dept-description').value,
      status: document.getElementById('edit-dept-status').value
    };

    await authFetch(`/departments/${id}`, { method: 'PUT', body: payload });
    closeModal('modal-edit-department');
    fetchDepartments();
    alert('Department updated successfully!');
  } catch (err) {
    alert(`Update Error: ${err.message}`);
  }
}

/* ==========================================================================
   ADMISSIONS (In-Patient Ward / Bed Management)
   ========================================================================== */
let currentAdmissionsFilter = '';

async function fetchAdmissions(statusFilter = currentAdmissionsFilter) {
  try {
    currentAdmissionsFilter = statusFilter;
    let url = '/admissions?1=1';
    if (statusFilter) url += `&status=${encodeURIComponent(statusFilter)}`;

    const admits = await authFetch(url);
    const body = document.getElementById('admissions-table-body');
    if (!body) return;

    if (!admits || admits.length === 0) {
      body.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No in-patient admission records found.</td></tr>';
      return;
    }

    body.innerHTML = admits.map(a => `
      <tr>
        <td><strong>${a.patient_name}</strong><br><small style="color: var(--text-muted);">${a.mrn}</small></td>
        <td><strong style="color: var(--primary);">${a.room_no}</strong> — ${a.bed_no}</td>
        <td>Dr. ${a.doctor_name}</td>
        <td>${a.department_name || 'General Ward'}</td>
        <td>${new Date(a.admission_date).toLocaleDateString()}</td>
        <td><span class="badge ${a.admission_type === 'Emergency' ? 'badge-red' : (a.admission_type === 'ICU' ? 'badge-amber' : 'badge-blue')}">${a.admission_type}</span></td>
        <td><span class="badge ${a.status === 'Admitted' ? 'badge-green' : 'badge-amber'}">${a.status}</span></td>
        <td>
          ${a.status === 'Admitted' ? `
            <button class="btn-action btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.78rem; border-color: #16A34A; color: #16A34A;" onclick="openDischargeModal(${a.id}, '${a.patient_name.replace(/'/g, "\\'")}', '${a.mrn}', '${a.room_no}', '${a.bed_no}')">
              🩺 Discharge
            </button>
          ` : `<small style="color: var(--text-muted);">Discharged: ${a.discharge_date ? new Date(a.discharge_date).toLocaleDateString() : 'Yes'}</small>`}
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Admissions error:', err);
  }
}

function filterAdmissions(status) {
  fetchAdmissions(status);
}

async function submitAdmission(e) {
  e.preventDefault();
  try {
    const payload = {
      patient_id: parseInt(document.getElementById('adm-patient-id').value),
      doctor_id: parseInt(document.getElementById('adm-doctor-id').value),
      department_id: document.getElementById('adm-department-id').value ? parseInt(document.getElementById('adm-department-id').value) : null,
      room_no: document.getElementById('adm-room').value,
      bed_no: document.getElementById('adm-bed').value,
      admission_type: document.getElementById('adm-type').value,
      notes: document.getElementById('adm-notes').value
    };

    await authFetch('/admissions', { method: 'POST', body: payload });
    closeModal('modal-admission');
    document.getElementById('form-admission').reset();
    fetchAdmissions();
    alert('Patient admitted successfully to ward!');
  } catch (err) {
    alert(`Admission Error: ${err.message}`);
  }
}

function openDischargeModal(id, patientName, mrn, room, bed) {
  document.getElementById('discharge-admission-id').value = id;
  document.getElementById('discharge-patient-summary').innerText = `Patient: ${patientName} (${mrn}) | Assigned: ${room}, ${bed}`;
  document.getElementById('discharge-notes').value = '';
  openModal('modal-discharge');
}

async function submitDischarge(e) {
  e.preventDefault();
  try {
    const id = document.getElementById('discharge-admission-id').value;
    const notes = document.getElementById('discharge-notes').value;

    await authFetch(`/admissions/${id}/discharge`, {
      method: 'PUT',
      body: { notes }
    });

    closeModal('modal-discharge');
    fetchAdmissions();
    alert('Patient discharged successfully!');
  } catch (err) {
    alert(`Discharge Error: ${err.message}`);
  }
}

/* ==========================================================================
   BACKUP & RECOVERY (SSD Section 10)
   ========================================================================== */
async function fetchBackupData() {
  try {
    const list = await authFetch('/backup/list');
    const body = document.getElementById('backups-table-body');
    if (!body) return;

    if (!list || list.length === 0) {
      body.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No backup archives generated yet. Click "Trigger Backup" to generate one.</td></tr>';
      return;
    }

    body.innerHTML = list.map(b => `
      <tr>
        <td><strong>📦 ${b.filename}</strong></td>
        <td><span class="badge ${b.type.includes('Weekly') ? 'badge-green' : (b.type.includes('Daily') ? 'badge-blue' : 'badge-amber')}">${b.type}</span></td>
        <td>${b.sizeFormatted}</td>
        <td>${new Date(b.createdAt).toLocaleString()}</td>
        <td>
          <button class="btn-action btn-secondary" style="padding: 0.25rem 0.6rem; font-size: 0.78rem;" onclick="downloadBackupFile('${b.filename}')">
            ⬇️ Download
          </button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Backup error:', err);
  }
}

async function triggerImmediateBackup(type) {
  try {
    const res = await authFetch('/backup/trigger', {
      method: 'POST',
      body: { type }
    });
    alert(`Success: ${res.message}`);
    fetchBackupData();
  } catch (err) {
    alert(`Backup Trigger Error: ${err.message}`);
  }
}

function downloadBackupFile(filename) {
  window.open(`${API_BASE}/backup/download/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`, '_blank');
}

/* ==========================================================================
   REPORTS & ANALYTICS MODULE (SSD Section 1.2 & Section 3.10)
   ========================================================================== */
let currentReportTab = 'patients';
let currentReportRawData = null;
let currentReportDisplayRows = [];

function switchReportTab(tab) {
  currentReportTab = tab;
  
  // Highlight active subtab button
  document.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(`rep-btn-${tab}`);
  if (activeBtn) activeBtn.classList.add('active');

  loadReportData(tab);
}

async function loadReportData(tab) {
  try {
    const fromDate = document.getElementById('rep-filter-from') ? document.getElementById('rep-filter-from').value : '';
    const toDate = document.getElementById('rep-filter-to') ? document.getElementById('rep-filter-to').value : '';
    
    let url = `/reports/${tab}?1=1`;
    if (fromDate) url += `&start_date=${fromDate}`;
    if (toDate) url += `&end_date=${toDate}`;

    const data = await authFetch(url);
    currentReportRawData = data;

    if (tab === 'patients') renderPatientsReport(data);
    else if (tab === 'appointments') renderAppointmentsReport(data);
    else if (tab === 'revenue') renderRevenueReport(data);
    else if (tab === 'pharmacy') renderPharmacyReport(data);
    else if (tab === 'laboratory') renderLaboratoryReport(data);
    else if (tab === 'staff') renderStaffReport(data);
  } catch (err) {
    console.error('Reports load error:', err);
  }
}

function applyReportFilter() {
  const keyword = document.getElementById('rep-filter-search') ? document.getElementById('rep-filter-search').value.toLowerCase().trim() : '';
  if (!currentReportDisplayRows) return;

  const tableBody = document.getElementById('report-table-body');
  if (!tableBody) return;

  if (!keyword) {
    renderReportTableRows(currentReportDisplayRows);
    return;
  }

  const filtered = currentReportDisplayRows.filter(row => {
    return row.some(cell => String(cell).toLowerCase().includes(keyword));
  });

  renderReportTableRows(filtered);
}

function resetReportFilter() {
  if (document.getElementById('rep-filter-from')) document.getElementById('rep-filter-from').value = '';
  if (document.getElementById('rep-filter-to')) document.getElementById('rep-filter-to').value = '';
  if (document.getElementById('rep-filter-search')) document.getElementById('rep-filter-search').value = '';
  loadReportData(currentReportTab);
}

function renderReportKPIs(kpis) {
  for (let i = 1; i <= 4; i++) {
    const k = kpis[i - 1] || { icon: '📊', label: 'Metric', val: '--', sub: '' };
    const iconEl = document.getElementById(`rep-kpi-icon-${i}`);
    const lblEl = document.getElementById(`rep-kpi-lbl-${i}`);
    const valEl = document.getElementById(`rep-kpi-val-${i}`);
    const subEl = document.getElementById(`rep-kpi-sub-${i}`);

    if (iconEl) iconEl.innerText = k.icon;
    if (lblEl) lblEl.innerText = k.label;
    if (valEl) valEl.innerText = k.val;
    if (subEl) subEl.innerText = k.sub;
  }
}

function renderReportTableRows(rows) {
  const body = document.getElementById('report-table-body');
  const countEl = document.getElementById('report-row-count');
  if (countEl) countEl.innerText = `${rows.length} Record${rows.length === 1 ? '' : 's'}`;

  if (!body) return;
  if (!rows || rows.length === 0) {
    body.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2rem;">No matching report records found.</td></tr>';
    return;
  }

  body.innerHTML = rows.map(r => `<tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
}

/* 1. Patient Reports */
function renderPatientsReport(data) {
  document.getElementById('rep-current-view-title').innerText = 'Patient Demographic & Registration Report (SSD 3.10)';
  document.getElementById('report-table-title').innerText = 'Patient Registry & Clinical Utilization Master Ledger';
  document.getElementById('report-table-subtitle').innerText = 'Demographic segmentation, visit frequencies, and chronic conditions';

  // KPIs
  const total = data.totalCount || 0;
  const maleCount = (data.genderDistribution.find(g => g.gender === 'Male') || {}).count || 0;
  const femaleCount = (data.genderDistribution.find(g => g.gender === 'Female') || {}).count || 0;
  const topBlood = data.bloodGroupDistribution[0] ? `${data.bloodGroupDistribution[0].blood_group} (${data.bloodGroupDistribution[0].count})` : 'O+';

  renderReportKPIs([
    { icon: '👥', label: 'Total Patients', val: total.toLocaleString(), sub: 'Registered hospital MRNs' },
    { icon: '👨', label: 'Male Patients', val: maleCount.toLocaleString(), sub: `${total ? Math.round((maleCount/total)*100) : 0}% of registry` },
    { icon: '👩', label: 'Female Patients', val: femaleCount.toLocaleString(), sub: `${total ? Math.round((femaleCount/total)*100) : 0}% of registry` },
    { icon: '🩸', label: 'Top Blood Group', val: topBlood, sub: 'Highest donor frequency' }
  ]);

  // Breakdowns
  const container = document.getElementById('report-breakdown-container');
  container.innerHTML = `
    <div class="card-panel">
      <h3 class="panel-title" style="margin-bottom: 0.75rem;">Gender Breakdown</h3>
      <div style="display: flex; flex-direction: column; gap: 0.6rem;">
        ${data.genderDistribution.map(g => `
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.2rem;">
              <span><strong>${g.gender}</strong></span>
              <span>${g.count} (${total ? Math.round((g.count/total)*100) : 0}%)</span>
            </div>
            <div style="height: 6px; background: #E2E8F0; border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; width: ${total ? (g.count/total)*100 : 0}%; background: var(--primary);"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card-panel">
      <h3 class="panel-title" style="margin-bottom: 0.75rem;">Blood Group Distribution</h3>
      <div style="display: flex; flex-wrap: wrap; gap: 0.6rem;">
        ${data.bloodGroupDistribution.map(b => `
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 0.45rem 0.85rem; text-align: center; flex: 1; min-width: 75px;">
            <div style="font-size: 0.88rem; font-weight: 800; color: #DC2626;">${b.blood_group}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${b.count} Pts</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Master Table
  const thead = document.getElementById('report-table-head');
  thead.innerHTML = `
    <tr>
      <th>MRN</th>
      <th>Patient Full Name</th>
      <th>Gender / Age</th>
      <th>Contact</th>
      <th>Blood Group</th>
      <th>Allergies</th>
      <th>Appointments</th>
      <th>EMR Visits</th>
    </tr>
  `;

  currentReportDisplayRows = (data.patients || []).map(p => [
    `<strong style="color: var(--primary);">${p.mrn}</strong>`,
    `<strong>${p.full_name}</strong>`,
    `${p.gender} (${getAge(p.dob)} yrs)`,
    `${p.phone || 'N/A'}`,
    `<span class="badge badge-red">${p.blood_group || 'Unknown'}</span>`,
    p.allergies && p.allergies !== 'None' ? `<span style="color:#DC2626; font-weight:600;">⚠️ ${p.allergies}</span>` : '<span style="color:var(--text-muted);">None</span>',
    `<span class="badge badge-blue">${p.appointment_count || 0}</span>`,
    `<span class="badge badge-green">${p.emr_count || 0}</span>`
  ]);

  renderReportTableRows(currentReportDisplayRows);
}

/* 2. Appointment Reports */
function renderAppointmentsReport(data) {
  document.getElementById('rep-current-view-title').innerText = 'Appointment Volume & Status Report (SSD 3.10)';
  document.getElementById('report-table-title').innerText = 'Clinical Appointment Scheduling & Attendance Log';
  document.getElementById('report-table-subtitle').innerText = 'Doctor consultations, status tracking, cancellations and booking slots';

  const total = (data.appointments || []).length;
  const completed = ((data.statusDistribution.find(s => s.status === 'Completed')) || {}).count || 0;
  const cancelled = ((data.statusDistribution.find(s => s.status === 'Cancelled')) || {}).count || 0;
  const scheduled = ((data.statusDistribution.find(s => s.status === 'Scheduled')) || {}).count || 0;

  renderReportKPIs([
    { icon: '📅', label: 'Total Bookings', val: total.toLocaleString(), sub: 'In selected range' },
    { icon: '✅', label: 'Completed Visits', val: completed.toLocaleString(), sub: `${total ? Math.round((completed/total)*100) : 0}% completion rate` },
    { icon: '⏳', label: 'Pending / Scheduled', val: scheduled.toLocaleString(), sub: 'Upcoming visits' },
    { icon: '❌', label: 'Cancelled Visits', val: cancelled.toLocaleString(), sub: `${total ? Math.round((cancelled/total)*100) : 0}% cancellation rate` }
  ]);

  const container = document.getElementById('report-breakdown-container');
  container.innerHTML = `
    <div class="card-panel">
      <h3 class="panel-title" style="margin-bottom: 0.75rem;">Status Breakdown</h3>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${(data.statusDistribution || []).map(s => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px dashed #E2E8F0;">
            <span><span class="badge ${getApptBadgeStyle(s.status)}">${s.status}</span></span>
            <strong>${s.count} (${total ? Math.round((s.count/total)*100) : 0}%)</strong>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card-panel">
      <h3 class="panel-title" style="margin-bottom: 0.75rem;">Top Doctors by Appointment Volume</h3>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${(data.doctorVolume || []).slice(0, 4).map(d => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px dashed #E2E8F0;">
            <div>
              <strong>${d.doctor_name}</strong>
              <div style="font-size: 0.72rem; color: var(--text-muted);">${d.specialization} • ${d.department}</div>
            </div>
            <span class="badge badge-blue">${d.total_appointments} Appts</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const thead = document.getElementById('report-table-head');
  thead.innerHTML = `
    <tr>
      <th>Date & Slot</th>
      <th>Patient Name (MRN)</th>
      <th>Attending Doctor</th>
      <th>Clinical Reason</th>
      <th>Status</th>
    </tr>
  `;

  currentReportDisplayRows = (data.appointments || []).map(a => [
    `<strong>${a.appointment_date ? a.appointment_date.split('T')[0] : ''}</strong><br><small style="color:var(--text-muted);">${a.time_slot}</small>`,
    `<strong>${a.patient_name}</strong><br><small style="color:var(--text-muted);">${a.mrn}</small>`,
    `Dr. ${a.doctor_name} (${a.specialization})`,
    `${a.reason || 'General Consultation'}`,
    `<span class="badge ${getApptBadgeStyle(a.status)}">${a.status}</span>`
  ]);

  renderReportTableRows(currentReportDisplayRows);
}

/* 3. Revenue Reports */
function renderRevenueReport(data) {
  document.getElementById('rep-current-view-title').innerText = 'Hospital Revenue & Financial Audit Report (SSD 3.10)';
  document.getElementById('report-table-title').innerText = 'Patient Billing, Invoicing & Settlement Ledger';
  document.getElementById('report-table-subtitle').innerText = 'Revenue breakdown by department, collection method, and outstanding dues';

  const s = data.summary || {};
  renderReportKPIs([
    { icon: '💵', label: 'Total Billed', val: `Rs. ${Number(s.totalBilled || 0).toLocaleString()}`, sub: `${s.totalInvoices || 0} Invoices issued` },
    { icon: '🟢', label: 'Total Collected', val: `Rs. ${Number(s.totalPaid || 0).toLocaleString()}`, sub: `${s.paidInvoices || 0} Settled invoices` },
    { icon: '🔴', label: 'Pending Dues', val: `Rs. ${Number(s.totalPending || 0).toLocaleString()}`, sub: `${s.pendingInvoices || 0} Unpaid bills` },
    { icon: '💳', label: 'Collection Rate', val: `${s.totalBilled ? Math.round((s.totalPaid / s.totalBilled)*100) : 0}%`, sub: 'Realized hospital cashflow' }
  ]);

  const container = document.getElementById('report-breakdown-container');
  container.innerHTML = `
    <div class="card-panel">
      <h3 class="panel-title" style="margin-bottom: 0.75rem;">Revenue by Service Category</h3>
      <div style="display: flex; flex-direction: column; gap: 0.6rem;">
        ${(data.categoryBreakdown || []).map(c => `
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 0.2rem;">
              <span><strong>${c.category}</strong> (${c.item_count} items)</span>
              <strong>Rs. ${Number(c.total_revenue).toLocaleString()}</strong>
            </div>
            <div style="height: 6px; background: #E2E8F0; border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; width: ${s.totalBilled ? Math.min(100, (c.total_revenue / s.totalBilled)*100) : 0}%; background: #16A34A;"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card-panel">
      <h3 class="panel-title" style="margin-bottom: 0.75rem;">Settlement by Payment Method</h3>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${(data.paymentMethodBreakdown || []).map(m => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px dashed #E2E8F0;">
            <span><span class="badge badge-blue">${m.payment_method}</span> <small style="color:var(--text-muted);">${m.transaction_count} txns</small></span>
            <strong style="color: #16A34A;">Rs. ${Number(m.total_collected).toLocaleString()}</strong>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const thead = document.getElementById('report-table-head');
  thead.innerHTML = `
    <tr>
      <th>Invoice #</th>
      <th>Patient Name (MRN)</th>
      <th>Issued Date</th>
      <th>Gross Amount</th>
      <th>Net Amount</th>
      <th>Status</th>
      <th>Payment Method</th>
    </tr>
  `;

  currentReportDisplayRows = (data.invoices || []).map(inv => [
    `<strong style="color: var(--primary);">${inv.invoice_number}</strong>`,
    `<strong>${inv.patient_name}</strong> (${inv.mrn})`,
    `${new Date(inv.issued_date).toLocaleDateString()}`,
    `Rs. ${Number(inv.total_amount).toLocaleString()}`,
    `<strong>Rs. ${Number(inv.net_amount).toLocaleString()}</strong>`,
    `<span class="badge ${inv.status === 'Paid' ? 'badge-green' : 'badge-red'}">${inv.status}</span>`,
    inv.payment_method || '—'
  ]);

  renderReportTableRows(currentReportDisplayRows);
}

/* 4. Pharmacy Reports */
function renderPharmacyReport(data) {
  document.getElementById('rep-current-view-title').innerText = 'Pharmacy Inventory & Dispensing Audit Report (SSD 3.10)';
  document.getElementById('report-table-title').innerText = 'Medicine Stock Valuations & Critical Reorder Thresholds';
  document.getElementById('report-table-subtitle').innerText = 'Pharmaceutical inventory levels, near-expiry alerts, batch numbers and stock valuation';

  const s = data.summary || {};
  renderReportKPIs([
    { icon: '💊', label: 'Unique Medicines', val: (s.uniqueItems || 0).toLocaleString(), sub: `${(s.totalUnits || 0).toLocaleString()} Total units` },
    { icon: '💰', label: 'Inventory Valuation', val: `Rs. ${Number(s.totalValuation || 0).toLocaleString()}`, sub: 'Stock capital value' },
    { icon: '⚠️', label: 'Low Stock Alerts', val: (s.lowStockAlerts || 0).toLocaleString(), sub: 'At or below reorder level' },
    { icon: '🔴', label: 'Near Expiry Alerts', val: (s.nearExpiryAlerts || 0).toLocaleString(), sub: 'Expiring within 30 days' }
  ]);

  const container = document.getElementById('report-breakdown-container');
  container.innerHTML = `
    <div class="card-panel">
      <h3 class="panel-title" style="margin-bottom: 0.75rem; color: #D97706;">⚠️ Low Stock Critical Alert List</h3>
      <div style="display: flex; flex-direction: column; gap: 0.4rem; max-height: 180px; overflow-y: auto;">
        ${(data.lowStockItems || []).length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem;">All medicines currently meet safety stock threshold.</p>' : ''}
        ${(data.lowStockItems || []).map(m => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px dashed #E2E8F0;">
            <div>
              <strong>${m.medicine_name}</strong>
              <div style="font-size:0.72rem; color:var(--text-muted);">Batch: ${m.batch_number} • Reorder at: ${m.reorder_level}</div>
            </div>
            <span class="badge badge-amber">${m.stock_quantity} left</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card-panel">
      <h3 class="panel-title" style="margin-bottom: 0.75rem; color: #DC2626;">🔴 Near Expiry Surveillance</h3>
      <div style="display: flex; flex-direction: column; gap: 0.4rem; max-height: 180px; overflow-y: auto;">
        ${(data.nearExpiryItems || []).length === 0 ? '<p style="color:var(--text-muted);font-size:0.85rem;">No medicines expiring within the next 30 days.</p>' : ''}
        ${(data.nearExpiryItems || []).map(m => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px dashed #E2E8F0;">
            <div>
              <strong>${m.medicine_name}</strong>
              <div style="font-size:0.72rem; color:var(--text-muted);">Batch: ${m.batch_number} • Qty: ${m.stock_quantity}</div>
            </div>
            <span class="badge badge-red">Exp: ${m.expiry_date}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const thead = document.getElementById('report-table-head');
  thead.innerHTML = `
    <tr>
      <th>Medicine Name</th>
      <th>Category</th>
      <th>Batch Number</th>
      <th>Unit Price</th>
      <th>Stock Units</th>
      <th>Total Valuation</th>
      <th>Expiry Date</th>
      <th>Stock Health</th>
    </tr>
  `;

  currentReportDisplayRows = (data.lowStockItems.concat(data.nearExpiryItems).concat(data.categoryBreakdown) ? (data.prescriptions || []) : []).length >= 0 ? 
    (data.lowStockItems || []).concat(data.nearExpiryItems || []).map(m => [
      `<strong>${m.medicine_name}</strong>`,
      `${m.category}`,
      `<code>${m.batch_number}</code>`,
      `Rs. ${Number(m.unit_price).toFixed(2)}`,
      `<strong>${m.stock_quantity}</strong>`,
      `Rs. ${(m.unit_price * m.stock_quantity).toLocaleString()}`,
      `${m.expiry_date}`,
      m.stock_quantity <= m.reorder_level ? '<span class="badge badge-amber">Low Stock</span>' : '<span class="badge badge-green">Healthy</span>'
    ]) : [];

  renderReportTableRows(currentReportDisplayRows);
}

/* 5. Laboratory Reports */
function renderLaboratoryReport(data) {
  document.getElementById('rep-current-view-title').innerText = 'Laboratory Diagnostics & Workload Report (SSD 3.10)';
  document.getElementById('report-table-title').innerText = 'Pathology & Diagnostic Test Order Master Register';
  document.getElementById('report-table-subtitle').innerText = 'Test categories, completion turnaround, sample tracking, and pathologist results';

  const total = data.totalTests || 0;
  const completed = ((data.statusBreakdown.find(s => s.status === 'Completed')) || {}).count || 0;
  const inProgress = ((data.statusBreakdown.find(s => s.status === 'Sample Collected' || s.status === 'Processing' || s.status === 'In-Progress')) || {}).count || 0;
  const requested = ((data.statusBreakdown.find(s => s.status === 'Requested')) || {}).count || 0;

  renderReportKPIs([
    { icon: '🔬', label: 'Total Diagnostic Tests', val: total.toLocaleString(), sub: 'Orders generated' },
    { icon: '✅', label: 'Completed Results', val: completed.toLocaleString(), sub: `${total ? Math.round((completed/total)*100) : 0}% completion rate` },
    { icon: '🧪', label: 'Samples in Analysis', val: inProgress.toLocaleString(), sub: 'Under active testing' },
    { icon: '📋', label: 'Pending Collection', val: requested.toLocaleString(), sub: 'Awaiting lab specimen' }
  ]);

  const container = document.getElementById('report-breakdown-container');
  container.innerHTML = `
    <div class="card-panel">
      <h3 class="panel-title" style="margin-bottom: 0.75rem;">Tests by Diagnostic Category</h3>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${(data.categoryBreakdown || []).map(c => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px dashed #E2E8F0;">
            <strong>${c.category}</strong>
            <span class="badge badge-blue">${c.count} Tests (${total ? Math.round((c.count/total)*100) : 0}%)</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card-panel">
      <h3 class="panel-title" style="margin-bottom: 0.75rem;">Lab Workflow Processing Status</h3>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${(data.statusBreakdown || []).map(s => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px dashed #E2E8F0;">
            <span class="badge ${getLabBadgeStyle(s.status)}">${s.status}</span>
            <strong>${s.count} Orders</strong>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const thead = document.getElementById('report-table-head');
  thead.innerHTML = `
    <tr>
      <th>Requested Date</th>
      <th>Patient Name (MRN)</th>
      <th>Doctor</th>
      <th>Test Name</th>
      <th>Category</th>
      <th>Status</th>
      <th>Result Summary</th>
    </tr>
  `;

  currentReportDisplayRows = (data.tests || []).map(t => [
    `${new Date(t.requested_date).toLocaleDateString()}`,
    `<strong>${t.patient_name}</strong> (${t.mrn})`,
    `Dr. ${t.doctor_name}`,
    `<strong>${t.test_name}</strong>`,
    `${t.category}`,
    `<span class="badge ${getLabBadgeStyle(t.status)}">${t.status}</span>`,
    t.result_summary || '<em>Pending Lab Review</em>'
  ]);

  renderReportTableRows(currentReportDisplayRows);
}

/* 6. Staff Reports */
function renderStaffReport(data) {
  document.getElementById('rep-current-view-title').innerText = 'Hospital Staff & Human Resources Report (SSD 3.10)';
  document.getElementById('report-table-title').innerText = 'Hospital Workforce, Department Staffing & Payroll Audit';
  document.getElementById('report-table-subtitle').innerText = 'Employee rosters, monthly payroll obligations, department distribution and leave records';

  const s = data.summary || {};
  renderReportKPIs([
    { icon: '👥', label: 'Total Hospital Staff', val: (s.totalStaff || 0).toLocaleString(), sub: 'Active workforce' },
    { icon: '💼', label: 'Monthly Payroll', val: `Rs. ${Number(s.monthlyPayroll || 0).toLocaleString()}`, sub: 'Total salary commitment' },
    { icon: '🏥', label: 'Departments', val: (data.departmentBreakdown || []).length.toLocaleString(), sub: 'Hospital divisions' },
    { icon: '🏖️', label: 'Leave Requests', val: (data.leaves || []).length.toLocaleString(), sub: 'Staff leave records' }
  ]);

  const container = document.getElementById('report-breakdown-container');
  container.innerHTML = `
    <div class="card-panel">
      <h3 class="panel-title" style="margin-bottom: 0.75rem;">Staffing by Department</h3>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${(data.departmentBreakdown || []).map(d => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px dashed #E2E8F0;">
            <div>
              <strong>${d.department}</strong>
              <div style="font-size:0.72rem; color:var(--text-muted);">${d.staff_count} personnel</div>
            </div>
            <strong>Rs. ${Number(d.department_payroll || 0).toLocaleString()}</strong>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card-panel">
      <h3 class="panel-title" style="margin-bottom: 0.75rem;">Staffing by Professional Role</h3>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        ${(data.roleBreakdown || []).map(r => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.35rem 0; border-bottom: 1px dashed #E2E8F0;">
            <span class="badge badge-blue">${r.role}</span>
            <strong>${r.count} Staff</strong>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  const thead = document.getElementById('report-table-head');
  thead.innerHTML = `
    <tr>
      <th>Employee ID</th>
      <th>Full Name</th>
      <th>Designation / Role</th>
      <th>Department</th>
      <th>Contact Phone</th>
      <th>Monthly Salary</th>
      <th>Joining Date</th>
    </tr>
  `;

  currentReportDisplayRows = (data.staffList || []).map(st => [
    `<strong style="color:var(--primary);">${st.employee_id}</strong>`,
    `<strong>${st.full_name}</strong>`,
    `<span class="badge badge-blue">${st.role}</span>`,
    `${st.department}`,
    `${st.phone || 'N/A'}`,
    `Rs. ${Number(st.salary || 0).toLocaleString()}`,
    `${st.joining_date || 'N/A'}`
  ]);

  renderReportTableRows(currentReportDisplayRows);
}

/* CSV Export Utility */
function exportCurrentReportCSV() {
  const table = document.getElementById('report-main-table');
  if (!table) return;

  const rows = Array.from(table.querySelectorAll('tr'));
  if (!rows || rows.length <= 1) {
    alert('No data available to export.');
    return;
  }

  let csvContent = rows.map(row => {
    const cells = Array.from(row.querySelectorAll('th, td'));
    return cells.map(c => `"${c.innerText.replace(/"/g, '""').trim()}"`).join(',');
  }).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SmartCare_${currentReportTab.toUpperCase()}_Report_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function printCurrentReport() {
  window.print();
}

/* ==========================================================================
   DOCTOR WEEKLY SCHEDULE MANAGEMENT (SSD Section 3.3)
   ========================================================================== */
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

async function openDoctorScheduleModal(doctorId, doctorName) {
  document.getElementById('sched-doctor-id').value = doctorId;
  document.getElementById('schedule-modal-title').innerText = `📅 Weekly Schedule: ${doctorName}`;

  const container = document.getElementById('schedule-days-container');
  container.innerHTML = '<p style="color:var(--text-muted); padding:1rem;">Loading doctor schedule...</p>';
  openModal('modal-doctor-schedule');

  try {
    const existing = await authFetch(`/doctors/${doctorId}/schedule`);
    
    container.innerHTML = `
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: var(--radius-sm); overflow: hidden;">
        <div style="display: grid; grid-template-columns: 120px 100px 1fr 1fr; gap: 1rem; padding: 0.6rem 0.75rem; background: #F1F5F9; font-weight: 700; font-size: 0.78rem; color: var(--text-muted); text-transform: uppercase;">
          <div>Day</div>
          <div>Available</div>
          <div>Start Time</div>
          <div>End Time</div>
        </div>
        ${WEEKDAYS.map((day, idx) => {
          const match = (existing || []).find(s => s.day_of_week === day);
          const isAvail = match ? (match.is_available === 1 || match.is_available === true) : (idx < 5); // default Mon-Fri
          const start = match ? (match.start_time || '09:00') : '09:00';
          const end = match ? (match.end_time || '17:00') : '17:00';

          return `
            <div class="schedule-day-row">
              <div><strong>${day}</strong></div>
              <div>
                <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; font-size: 0.85rem;">
                  <input type="checkbox" id="sched-avail-${day}" ${isAvail ? 'checked' : ''}> Active
                </label>
              </div>
              <div>
                <input type="time" id="sched-start-${day}" class="input-field" value="${start}" style="padding: 0.3rem 0.5rem; font-size: 0.82rem;">
              </div>
              <div>
                <input type="time" id="sched-end-${day}" class="input-field" value="${end}" style="padding: 0.3rem 0.5rem; font-size: 0.82rem;">
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color:#DC2626; padding:1rem;">Error loading schedule: ${err.message}</p>`;
  }
}

async function submitDoctorSchedule(e) {
  e.preventDefault();
  try {
    const doctorId = document.getElementById('sched-doctor-id').value;
    const slots = WEEKDAYS.map(day => ({
      day_of_week: day,
      start_time: document.getElementById(`sched-start-${day}`).value,
      end_time: document.getElementById(`sched-end-${day}`).value,
      is_available: document.getElementById(`sched-avail-${day}`).checked
    }));

    await authFetch(`/doctors/${doctorId}/schedule`, {
      method: 'POST',
      body: { slots }
    });

    closeModal('modal-doctor-schedule');
    alert('Weekly consultation schedule updated successfully!');
  } catch (err) {
    alert(`Schedule Error: ${err.message}`);
  }
}

/* ==========================================================================
   OFFICIAL PRINTABLE EMR & LAB REPORTS (SSD 3.5 & 3.6)
   ========================================================================== */
async function openPrintEMR(recordId) {
  try {
    const records = await authFetch('/emr');
    const rec = (records || []).find(r => r.id == recordId);
    if (!rec) throw new Error('Medical record not found');

    const html = `
      <div class="official-doc-print">
        <div class="doc-header-banner">
          <div>
            <h2 style="color: var(--primary); font-size: 1.5rem; font-weight: 800; margin: 0;">SMARTCARE HEALTHCARE SYSTEM</h2>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.2rem;">Official Clinical Evaluation & Medical Consultation Report</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Accredited Tertiary Care Hospital • ISO 9001:2015 Healthcare Certified</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.9rem; font-weight: 800; color: var(--text-main);">CONFIDENTIAL MEDICAL RECORD</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Consultation Date: ${new Date(rec.record_date).toLocaleDateString()}</div>
            <div style="font-size: 0.8rem; color: var(--primary); font-weight: 700;">Record ID: EMR-${rec.id}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem;">
          <div>
            <p><strong>Patient:</strong> ${rec.patient_name || 'Patient #' + rec.patient_id}</p>
            <p><strong>Medical Record Number (MRN):</strong> ${rec.mrn || 'N/A'}</p>
            <p><strong>Gender / Age:</strong> ${rec.gender || 'N/A'} ${rec.dob ? `(${getAge(rec.dob)} yrs)` : ''}</p>
          </div>
          <div>
            <p><strong>Attending Physician:</strong> Dr. ${rec.doctor_name || 'Doctor #' + rec.doctor_id}</p>
            <p><strong>Specialization:</strong> ${rec.specialization || 'Clinical Medicine'}</p>
            <p><strong>Consultation Status:</strong> Complete & Documented</p>
          </div>
        </div>

        <div style="margin-bottom: 1.25rem;">
          <h4 style="color: var(--text-main); margin-bottom: 0.4rem; text-transform: uppercase; font-size: 0.82rem; letter-spacing: 0.5px;">Clinical Vitals</h4>
          <div style="display: flex; gap: 1.5rem; background: #FFFFFF; border: 1px solid #E2E8F0; padding: 0.75rem; border-radius: 6px;">
            <span><strong>Blood Pressure:</strong> ${rec.vitals_bp || '120/80 mmHg'}</span>
            <span><strong>Temperature:</strong> ${rec.vitals_temp || '98.6 °F'}</span>
            <span><strong>Pulse:</strong> ${rec.vitals_pulse || '72 bpm'}</span>
            <span><strong>Weight:</strong> ${rec.vitals_weight || 'Normal'}</span>
          </div>
        </div>

        <div style="margin-bottom: 1.25rem;">
          <h4 style="color: var(--text-main); margin-bottom: 0.4rem; text-transform: uppercase; font-size: 0.82rem; letter-spacing: 0.5px;">Primary Clinical Diagnosis</h4>
          <div style="background: #EFF6FF; border-left: 4px solid var(--primary); padding: 0.85rem; font-size: 1rem; font-weight: 700; color: var(--primary);">
            ${rec.diagnosis}
          </div>
          ${rec.symptoms ? `<p style="margin-top: 0.4rem; font-size: 0.88rem; color: var(--text-muted);"><strong>Presenting Symptoms:</strong> ${rec.symptoms}</p>` : ''}
        </div>

        ${rec.treatment_plan ? `
          <div style="margin-bottom: 1.25rem;">
            <h4 style="color: var(--text-main); margin-bottom: 0.4rem; text-transform: uppercase; font-size: 0.82rem; letter-spacing: 0.5px;">Treatment Plan</h4>
            <p style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 0.75rem; border-radius: 6px; font-size: 0.88rem;">${rec.treatment_plan}</p>
          </div>
        ` : ''}

        <div style="margin-bottom: 1.5rem;">
          <h4 style="color: var(--text-main); margin-bottom: 0.4rem; text-transform: uppercase; font-size: 0.82rem; letter-spacing: 0.5px;">Prescribed Medications</h4>
          ${(!rec.prescriptions || rec.prescriptions.length === 0) ? '<p style="color: var(--text-muted); font-size: 0.85rem;">No medications prescribed during this consultation.</p>' : `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Medicine</th>
                  <th>Dosage</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                ${rec.prescriptions.map(p => `
                  <tr>
                    <td><strong>${p.medicine_name}</strong></td>
                    <td>${p.dosage}</td>
                    <td>${p.frequency}</td>
                    <td>${p.duration_days} Days</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>

        <div class="doc-stamp-sig">
          <div>
            <div style="font-weight: 700; font-size: 0.82rem; color: var(--text-muted);">HOSPITAL SEAL & VERIFICATION</div>
            <div style="border: 2px dashed #94A3B8; width: 130px; height: 50px; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; color: var(--text-muted); margin-top: 0.5rem;">
              SMARTCARE CLINICAL SEAL
            </div>
          </div>
          <div style="text-align: right;">
            <div style="width: 180px; border-bottom: 1px solid #334155; margin-bottom: 0.35rem;"></div>
            <strong style="font-size: 0.9rem;">Dr. ${rec.doctor_name || 'Attending Physician'}</strong>
            <div style="font-size: 0.78rem; color: var(--text-muted);">Authorized Medical Officer</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('printable-emr-content').innerHTML = html;
    openModal('modal-print-emr');
  } catch (err) {
    alert(`EMR Print Error: ${err.message}`);
  }
}

async function openPrintLab(testId) {
  try {
    const tests = await authFetch('/lab');
    const test = (tests || []).find(t => t.id == testId);
    if (!test) throw new Error('Lab test not found');

    const html = `
      <div class="official-doc-print">
        <div class="doc-header-banner">
          <div>
            <h2 style="color: #0F766E; font-size: 1.5rem; font-weight: 800; margin: 0;">SMARTCARE DIAGNOSTIC LABORATORIES</h2>
            <div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 0.2rem;">Pathology, Hematology & Diagnostic Imaging Department</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">ISO 15189 Medical Testing Laboratory Certified</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 0.9rem; font-weight: 800; color: #0F766E;">OFFICIAL LAB CERTIFICATE</div>
            <div style="font-size: 0.8rem; color: var(--text-muted);">Order Date: ${new Date(test.requested_date).toLocaleDateString()}</div>
            <div style="font-size: 0.8rem; color: var(--primary); font-weight: 700;">Sample Ref: LAB-${test.id}</div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; background: #F8FAFC; border: 1px solid #E2E8F0; padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem;">
          <div>
            <p><strong>Patient Name:</strong> ${test.patient_name}</p>
            <p><strong>MRN Number:</strong> ${test.mrn}</p>
            <p><strong>Specimen Status:</strong> <span class="badge ${getLabBadgeStyle(test.status)}">${test.status}</span></p>
          </div>
          <div>
            <p><strong>Referring Doctor:</strong> Dr. ${test.doctor_name}</p>
            <p><strong>Laboratory Category:</strong> ${test.category}</p>
            <p><strong>Analysis Completed:</strong> ${test.completed_date ? new Date(test.completed_date).toLocaleDateString() : 'Awaiting Final Validation'}</p>
          </div>
        </div>

        <div style="margin-bottom: 1.5rem;">
          <h3 style="color: var(--text-main); font-size: 1.15rem; font-weight: 800; border-bottom: 2px solid #E2E8F0; padding-bottom: 0.4rem; margin-bottom: 1rem;">
            Test Order: ${test.test_name}
          </h3>

          <table class="data-table">
            <thead>
              <tr>
                <th>Investigation Item</th>
                <th>Observed Diagnostic Finding</th>
                <th>Biological Reference Interval</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>${test.test_name}</strong></td>
                <td><strong style="color: var(--primary); font-size: 1.05rem;">${test.result_summary || 'Analysis in progress'}</strong></td>
                <td>${test.normal_range || 'Normal Reference Limits'}</td>
                <td><span class="badge ${getLabBadgeStyle(test.status)}">${test.status}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        ${test.notes ? `
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; padding: 0.85rem; border-radius: 6px; margin-bottom: 1.5rem;">
            <strong>Pathologist Notes:</strong>
            <p style="margin-top: 0.25rem; font-size: 0.85rem; color: var(--text-muted);">${test.notes}</p>
          </div>
        ` : ''}

        <div class="doc-stamp-sig">
          <div>
            <div style="font-weight: 700; font-size: 0.82rem; color: var(--text-muted);">LABORATORY ACCREDITATION STAMP</div>
            <div style="border: 2px dashed #0F766E; width: 140px; height: 50px; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; color: #0F766E; margin-top: 0.5rem;">
              VALIDATED CLINICAL RESULT
            </div>
          </div>
          <div style="text-align: right;">
            <div style="width: 180px; border-bottom: 1px solid #334155; margin-bottom: 0.35rem;"></div>
            <strong style="font-size: 0.9rem;">Chief Pathologist / Lab Director</strong>
            <div style="font-size: 0.78rem; color: var(--text-muted);">SmartCare Diagnostic Services</div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('printable-lab-content').innerHTML = html;
    openModal('modal-print-lab');
  } catch (err) {
    alert(`Lab Print Error: ${err.message}`);
  }
}

/* ==========================================================================
   AUTOMATIC SESSION INACTIVITY TIMEOUT (SSD Section 4 Security)
   ========================================================================== */
let inactivityTimer = null;
const IDLE_LIMIT_MS = 15 * 60 * 1000; // 15 minutes idle timeout

function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);

  // Only track inactivity if user is authenticated
  if (token && currentUser) {
    inactivityTimer = setTimeout(() => {
      openModal('modal-idle-timeout');
    }, IDLE_LIMIT_MS);
  }
}

// Attach user activity listeners
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
  window.addEventListener(evt, () => {
    resetInactivityTimer();
  }, { passive: true });
});

// Start timer on initial load
resetInactivityTimer();

