/**
 * MNH RCH - Patient Actions & Dashboard Logic
 * Handles data fetching, UI population, and user actions for the Mother Portal.
 */

console.log('[Patient Actions] Script loaded');

// ==========================================
// 1. CONFIGURATION & INITIALIZATION
// ==========================================
const SUPABASE_URL = 'https://fmaaudmdgmgklvqcmvad.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Global state - stores current patient data so actions can use it
let currentPatient = null;
let currentVitals = null;
let currentVisits = [];

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================
function calculateAge(dobString) {
    if (!dobString) return 'Not recorded';
    const dob = new Date(dobString);
    const today = new Date();
    let months = (today.getFullYear() - dob.getFullYear()) * 12;
    months -= dob.getMonth();
    months += today.getMonth();
    
    if (months < 1) return 'Newborn';
    if (months < 12) return months + ' month' + (months > 1 ? 's' : '');
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    return remainingMonths > 0 ? years + ' year' + (years > 1 ? 's' : '') + ', ' + remainingMonths + ' mo' : years + ' year' + (years > 1 ? 's' : '');
}

function evaluateMUAC(muac) {
    if (!muac) return { status: 'Pending Assessment', class: 'warning', icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>' };
    const val = parseFloat(muac);
    if (val < 115) return { status: 'Severe Risk', class: 'warning', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' };
    if (val < 125) return { status: 'Moderate Risk', class: 'warning', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' };
    return { status: 'Normal', class: 'success', icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' };
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ==========================================
// 3. MODAL SYSTEM
// ==========================================
function showModal(title, contentHTML, options) {
    options = options || {};
    const existingModal = document.getElementById('dynamic_modal');
    if (existingModal) existingModal.remove();

    const footerHTML = options.noCloseButton ? '' : 
        '<div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; text-align: right;"><button onclick="closeModal()" style="background: #1e3a8a; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Close</button></div>';

    const modalHTML = '<div id="dynamic_modal" onclick="if(event.target===this)closeModal()" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; overflow-y: auto;"><div style="background: white; border-radius: 16px; width: 100%; max-width: 500px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); animation: slideUp 0.3s ease-out;"><div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;"><h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">' + title + '</h3><button onclick="closeModal()" style="background: none; border: none; cursor: pointer; color: #64748b; padding: 4px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div style="padding: 24px; color: #334155; line-height: 1.6;">' + contentHTML + '</div>' + footerHTML + '</div></div>';
    
    if (!document.getElementById('modal-anim-style')) {
        const style = document.createElement('style');
        style.id = 'modal-anim-style';
        style.textContent = '@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }';
        document.head.appendChild(style);
    }

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function closeModal() {
    const modal = document.getElementById('dynamic_modal');
    if (modal) modal.remove();
}

// ==========================================
// 4. MAIN DASHBOARD LOADER
// ==========================================
async function loadMotherDashboard() {
    const phone = localStorage.getItem('mnh_user_phone');
    const name = localStorage.getItem('mnh_user_name');

    if (!phone) {
        console.warn('[Patient Actions] No user phone found. Redirecting.');
        window.location.href = 'register.html';
        return;
    }

    if (name) document.getElementById('user_name').textContent = name;
    document.getElementById('user_phone').textContent = phone;

    try {
        // Fetch patient
        const { data: patients, error: pError } = await supabase
            .from('patients')
            .select('*')
            .eq('phone_number', phone)
            .order('created_at', { ascending: false })
            .limit(1);

        if (pError || !patients || patients.length === 0) {
            document.getElementById('child_name').textContent = 'No record found';
            return;
        }

        currentPatient = patients[0];

        // Populate Child Profile
        document.getElementById('child_name').textContent = currentPatient.child_name || 'Unborn / Not Recorded';
        
        const age = calculateAge(currentPatient.child_dob);
        const dobFormatted = currentPatient.child_dob ? formatDate(currentPatient.child_dob) : 'Not recorded';
        document.getElementById('child_dob').textContent = currentPatient.child_dob ? dobFormatted + ' (' + age + ')' : 'Not recorded';
        document.getElementById('child_sex').textContent = currentPatient.child_sex || 'Not recorded';

        // Fetch vitals
        const { data: vitals } = await supabase
            .from('vitals')
            .select('muac_mm, weight_kg, temperature, recorded_at')
            .eq('patient_id', currentPatient.id)
            .order('recorded_at', { ascending: false })
            .limit(1);

        currentVitals = (vitals && vitals.length > 0) ? vitals[0] : null;

        if (currentVitals) {
            const muacEval = evaluateMUAC(currentVitals.muac_mm);
            document.getElementById('nutrition_status').className = 'status-badge ' + muacEval.class;
            document.getElementById('nutrition_status').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 12px; height: 12px;">' + muacEval.icon + '</svg>' + muacEval.status;
        } else {
            document.getElementById('nutrition_status').className = 'status-badge warning';
            document.getElementById('nutrition_status').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 12px; height: 12px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>Pending Assessment';
        }

        // Fetch visits
        const { data: visits } = await supabase
            .from('queue')
            .select('status, current_station, created_at, diagnosis, prescription')
            .eq('patient_id', currentPatient.id)
            .order('created_at', { ascending: false })
            .limit(5);

        currentVisits = visits || [];
        renderActivityList(currentVisits);

        // Dynamic vaccination text based on child DOB
        updateVaccinationAlert();

    } catch (error) {
        console.error('[Patient Actions] Load error:', error);
    }
}

function updateVaccinationAlert() {
    const el = document.getElementById('next_vaccine_text');
    if (!currentPatient || !currentPatient.child_dob) {
        el.textContent = 'Register your newborn to see vaccination schedule';
        return;
    }
    const dob = new Date(currentPatient.child_dob);
    const ageDays = Math.floor((new Date() - dob) / (1000 * 60 * 60 * 24));
    
    if (ageDays < 0) {
        el.textContent = 'BCG & OPV0 - At birth';
    } else if (ageDays < 42) {
        const daysUntil = 42 - ageDays;
        el.textContent = 'Pentavalent 1 due in ' + daysUntil + ' days (at 6 weeks)';
    } else if (ageDays < 70) {
        const daysUntil = 70 - ageDays;
        el.textContent = 'Pentavalent 2 due in ' + daysUntil + ' days (at 10 weeks)';
    } else if (ageDays < 98) {
        const daysUntil = 98 - ageDays;
        el.textContent = 'Pentavalent 3 due in ' + daysUntil + ' days (at 14 weeks)';
    } else {
        el.textContent = 'Measles vaccine due at 9 months';
    }
}

// ==========================================
// 5. UI RENDERING
// ==========================================
function renderActivityList(visits) {
    const listContainer = document.getElementById('activity_list');
    
    if (!visits || visits.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">No clinical visits recorded yet.</div>';
        return;
    }

    listContainer.innerHTML = visits.map(visit => {
        const date = new Date(visit.created_at);
        const day = String(date.getDate()).padStart(2, '0');
        const month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
        
        let title = 'Clinic Visit';
        let details = 'Station: ' + (visit.current_station || 'General') + ' | Status: ' + visit.status;

        if (visit.diagnosis) {
            title = 'Consultation';
            details = 'Diagnosis: ' + visit.diagnosis;
            if (visit.prescription) {
                details += ' | Rx: ' + visit.prescription.substring(0, 50) + (visit.prescription.length > 50 ? '...' : '');
            }
        }

        return '<div class="activity-item"><div class="activity-date"><div class="activity-day">' + day + '</div><div class="activity-month">' + month + '</div></div><div class="activity-details" style="flex: 1;"><h4>' + title + '</h4><p>' + details + '</p></div></div>';
    }).join('');
}

// ==========================================
// 6. QUICK ACTION HANDLERS (ALL FUNCTIONAL)
// ==========================================

// --- Immunization Card (dynamic based on DOB) ---
window.viewImmunizationCard = function() {
    if (!currentPatient) return;
    
    const dob = currentPatient.child_dob ? new Date(currentPatient.child_dob) : null;
    const ageDays = dob ? Math.floor((new Date() - dob) / (1000 * 60 * 60 * 24)) : -1;

    function vaccineStatus(dueDays) {
        if (ageDays < 0) return '<span style="color: #94a3b8;">Awaiting birth</span>';
        if (ageDays >= dueDays) return '<span style="color: #16a34a; font-weight: 600;">Completed</span>';
        const remaining = dueDays - ageDays;
        return '<span style="color: #d97706; font-weight: 600;">Due in ' + remaining + ' day' + (remaining !== 1 ? 's' : '') + '</span>';
    }

    const content = dob ? 
        '<p><strong>Child:</strong> ' + (currentPatient.child_name || 'Newborn') + '</p>' +
        '<p><strong>Age:</strong> ' + calculateAge(currentPatient.child_dob) + '</p>' +
        '<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;">' +
        '<ul style="list-style: none; padding: 0; margin: 0;">' +
            '<li style="padding: 10px 0; display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0;"><span>BCG</span>' + vaccineStatus(0) + '</li>' +
            '<li style="padding: 10px 0; display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0;"><span>OPV 0</span>' + vaccineStatus(0) + '</li>' +
            '<li style="padding: 10px 0; display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0;"><span>Pentavalent 1</span>' + vaccineStatus(42) + '</li>' +
            '<li style="padding: 10px 0; display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0;"><span>Pentavalent 2</span>' + vaccineStatus(70) + '</li>' +
            '<li style="padding: 10px 0; display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0;"><span>Pentavalent 3</span>' + vaccineStatus(98) + '</li>' +
            '<li style="padding: 10px 0; display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0;"><span>Measles</span>' + vaccineStatus(270) + '</li>' +
        '</ul>' +
        '<p style="margin-top: 16px; font-size: 13px; color: #64748b;">* Digital Kadi ya Kliniki. Bring this to every clinic visit.</p>' :
        '<div style="text-align: center; padding: 20px; color: #64748b;">' +
            '<p>Your child has not been registered yet.</p>' +
            '<button onclick="closeModal(); registerNewborn();" style="background: #1e3a8a; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; margin-top: 8px;">Register Newborn Now</button>' +
        '</div>';

    showModal('Immunization Card', content);
};

// --- Appointments (dynamic next vaccine date) ---
window.viewAppointments = function() {
    if (!currentPatient || !currentPatient.child_dob) {
        showModal('Upcoming Appointments', 
            '<div style="text-align: center; padding: 20px; color: #64748b;">' +
            '<p>No upcoming appointments.</p>' +
            '<p style="font-size: 13px;">Register your newborn to see the vaccination schedule.</p>' +
            '</div>');
        return;
    }

    const dob = new Date(currentPatient.child_dob);
    const ageDays = Math.floor((new Date() - dob) / (1000 * 60 * 60 * 24));
    
    let nextVisit = null;
    if (ageDays < 42) nextVisit = { name: 'Pentavalent 1 & OPV 1', days: 42 };
    else if (ageDays < 70) nextVisit = { name: 'Pentavalent 2 & OPV 2', days: 70 };
    else if (ageDays < 98) nextVisit = { name: 'Pentavalent 3 & OPV 3', days: 98 };
    else if (ageDays < 270) nextVisit = { name: 'Measles Vaccine', days: 270 };

    let content = '';
    if (nextVisit) {
        const nextDate = new Date(dob.getTime() + nextVisit.days * 24 * 60 * 60 * 1000);
        const remaining = nextVisit.days - ageDays;
        content = '<div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 12px;">' +
            '<div style="font-weight: 700; color: #1e3a8a; margin-bottom: 4px;">' + nextVisit.name + '</div>' +
            '<div style="font-size: 14px;">Date: ' + formatDate(nextDate.toISOString()) + '</div>' +
            '<div style="font-size: 14px; color: #d97706; font-weight: 600; margin-top: 4px;">Due in ' + remaining + ' day' + (remaining !== 1 ? 's' : '') + '</div>' +
            '</div>' +
            '<p style="font-size: 13px; color: #64748b;">You will receive an SMS reminder 2 days before this appointment.</p>';
    } else {
        content = '<p style="text-align: center; color: #16a34a; font-weight: 600;">All scheduled vaccinations completed.</p>';
    }

    showModal('Upcoming Appointments', content);
};

// --- Growth Chart (real data) ---
window.viewGrowthChart = function() {
    if (!currentVitals) {
        showModal('Growth Monitoring',
            '<div style="text-align: center; padding: 20px; color: #64748b;">' +
            '<p>No vital signs recorded yet.</p>' +
            '<p style="font-size: 13px;">Vitals are recorded by the nurse during clinic visits.</p>' +
            '</div>');
        return;
    }

    const muacEval = evaluateMUAC(currentVitals.muac_mm);
    const content = '<p><strong>Latest Measurement:</strong> ' + formatDate(currentVitals.recorded_at) + '</p>' +
        '<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin: 16px 0;">' +
            '<div style="background: #f8fafc; padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 12px; color: #64748b;">Weight</div>' +
                '<div style="font-size: 18px; font-weight: 700; color: #0f172a;">' + (currentVitals.weight_kg || '-') + ' kg</div>' +
            '</div>' +
            '<div style="background: #f8fafc; padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 12px; color: #64748b;">MUAC</div>' +
                '<div style="font-size: 18px; font-weight: 700; color: ' + (muacEval.class === 'success' ? '#16a34a' : '#d97706') + ';">' + (currentVitals.muac_mm || '-') + ' mm</div>' +
            '</div>' +
            '<div style="background: #f8fafc; padding: 12px; border-radius: 8px; text-align: center;">' +
                '<div style="font-size: 12px; color: #64748b;">Temp</div>' +
                '<div style="font-size: 18px; font-weight: 700; color: #0f172a;">' + (currentVitals.temperature || '-') + ' C</div>' +
            '</div>' +
        '</div>' +
        '<div style="padding: 12px; background: ' + (muacEval.class === 'success' ? '#dcfce7' : '#fef3c7') + '; border-radius: 8px; color: ' + (muacEval.class === 'success' ? '#166534' : '#92400e') + '; font-weight: 600; text-align: center;">Nutrition Status: ' + muacEval.status + '</div>';

    showModal('Growth Monitoring', content);
};

// --- Visit History (real visits) ---
window.viewVisitHistory = function() {
    if (!currentVisits || currentVisits.length === 0) {
        showModal('Visit History',
            '<div style="text-align: center; padding: 20px; color: #64748b;">' +
            '<p>No clinic visits recorded yet.</p>' +
            '<p style="font-size: 13px;">Your visit history will appear here after clinic appointments.</p>' +
            '</div>');
        return;
    }

    const content = '<p>Your complete clinical history:</p>' +
        '<div style="margin-top: 12px;">' +
        currentVisits.map(v => {
            return '<div style="padding: 12px; background: #f8fafc; border-left: 3px solid #1e3a8a; border-radius: 6px; margin-bottom: 8px;">' +
                '<div style="font-weight: 700; color: #0f172a; font-size: 14px;">' + formatDate(v.created_at) + '</div>' +
                '<div style="font-size: 13px; color: #64748b; margin-top: 4px;">Station: ' + (v.current_station || 'General') + ' | Status: ' + v.status + '</div>' +
                (v.diagnosis ? '<div style="font-size: 13px; margin-top: 4px;"><strong>Diagnosis:</strong> ' + v.diagnosis + '</div>' : '') +
                (v.prescription ? '<div style="font-size: 13px; margin-top: 4px;"><strong>Prescription:</strong> ' + v.prescription + '</div>' : '') +
            '</div>';
        }).join('') +
        '</div>';

    showModal('Visit History', content);
};

// --- Update My Info (real update to Supabase) ---
window.updateMyInfo = function() {
    if (!currentPatient) return;
    
    const content = '<form id="update_info_form">' +
        '<div class="modal-form-group">' +
            '<label>Full Name</label>' +
            '<input type="text" id="update_name" value="' + (currentPatient.mother_name || '') + '" required>' +
        '</div>' +
        '<div class="modal-form-group">' +
            '<label>Phone Number</label>' +
            '<input type="tel" id="update_phone" value="' + (currentPatient.phone_number || '') + '" required>' +
        '</div>' +
        '<div class="modal-form-group">' +
            '<label>Age</label>' +
            '<input type="number" id="update_age" value="' + (currentPatient.mother_age || '') + '">' +
        '</div>' +
        '<div class="modal-form-group">' +
            '<label>Residence</label>' +
            '<input type="text" id="update_residence" value="' + (currentPatient.residence || '') + '">' +
        '</div>' +
        '<div class="modal-form-group">' +
            '<label>SHA Number</label>' +
            '<input type="text" id="update_sha" value="' + (currentPatient.sha_number || '') + '">' +
        '</div>' +
        '<button type="submit" class="modal-submit-btn" id="update_submit_btn">Save Changes</button>' +
    '</form>';

    showModal('Update My Information', content, { noCloseButton: false });

    setTimeout(() => {
        document.getElementById('update_info_form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('update_submit_btn');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            try {
                const { error } = await supabase
                    .from('patients')
                    .update({
                        mother_name: document.getElementById('update_name').value,
                        phone_number: document.getElementById('update_phone').value,
                        mother_age: document.getElementById('update_age').value ? parseInt(document.getElementById('update_age').value) : null,
                        residence: document.getElementById('update_residence').value || null,
                        sha_number: document.getElementById('update_sha').value || null
                    })
                    .eq('id', currentPatient.id);

                if (error) throw error;

                localStorage.setItem('mnh_user_name', document.getElementById('update_name').value);
                localStorage.setItem('mnh_user_phone', document.getElementById('update_phone').value);
                
                alert('Information updated successfully!');
                closeModal();
                loadMotherDashboard();
            } catch (err) {
                alert('Failed to update: ' + err.message);
                btn.disabled = false;
                btn.textContent = 'Save Changes';
            }
        });
    }, 100);
};

// --- Register Newborn (THE NEW FEATURE) ---
window.registerNewborn = function() {
    if (!currentPatient) return;

    // Check if child already registered
    if (currentPatient.child_name && currentPatient.child_dob) {
        showModal('Child Already Registered',
            '<div style="background: #fef3c7; border: 1px solid #fcd34d; padding: 16px; border-radius: 8px; color: #92400e;">' +
                '<p style="margin: 0 0 8px 0; font-weight: 700;">A child is already on record:</p>' +
                '<p style="margin: 0;"><strong>' + currentPatient.child_name + '</strong></p>' +
                '<p style="margin: 4px 0 0 0; font-size: 13px;">Born: ' + formatDate(currentPatient.child_dob) + '</p>' +
            '</div>' +
            '<p style="margin-top: 16px; font-size: 13px; color: #64748b;">If you have given birth to another child, please visit the clinic so a nurse can create a new patient record for the newborn. This prevents accidentally overwriting your first child\'s data.</p>');
        return;
    }

    const content = '<p style="margin-bottom: 16px; color: #64748b; font-size: 14px;">Congratulations on your newborn. Fill in these details to complete your child\'s digital Kadi ya Kliniki.</p>' +
        '<form id="newborn_form">' +
            '<div class="modal-form-group">' +
                '<label>Child\'s Full Name *</label>' +
                '<input type="text" id="newborn_name" required placeholder="e.g., Neema Sarah">' +
            '</div>' +
            '<div class="modal-form-group">' +
                '<label>Date of Birth *</label>' +
                '<input type="date" id="newborn_dob" required max="' + new Date().toISOString().split('T')[0] + '">' +
            '</div>' +
            '<div class="modal-form-group">' +
                '<label>Sex *</label>' +
                '<select id="newborn_sex" required>' +
                    '<option value="">Select sex</option>' +
                    '<option value="Male">Male</option>' +
                    '<option value="Female">Female</option>' +
                '</select>' +
            '</div>' +
            '<button type="submit" class="modal-submit-btn" id="newborn_submit_btn">Register Newborn</button>' +
        '</form>';

    showModal('Register Your Newborn', content);

    setTimeout(() => {
        document.getElementById('newborn_form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('newborn_submit_btn');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            try {
                const { error } = await supabase
                    .from('patients')
                    .update({
                        child_name: document.getElementById('newborn_name').value.trim(),
                        child_dob: document.getElementById('newborn_dob').value,
                        child_sex: document.getElementById('newborn_sex').value
                    })
                    .eq('id', currentPatient.id);

                if (error) throw error;

                alert('Newborn registered successfully!');
                closeModal();
                loadMotherDashboard(); // Refresh dashboard with new data
            } catch (err) {
                alert('Failed to register newborn: ' + err.message);
                btn.disabled = false;
                btn.textContent = 'Register Newborn';
            }
        });
    }, 100);
};

// --- View Full Schedule (from vaccination alert) ---
window.viewFullSchedule = function() {
    window.viewImmunizationCard();
};

// --- Logout ---
window.handleLogout = async function() {
    if (confirm('Are you sure you want to logout?')) {
        await supabase.auth.signOut();
        localStorage.removeItem('mnh_user_phone');
        localStorage.removeItem('mnh_user_name');
        window.location.href = 'index.html';
    }
};

// ==========================================
// 7. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    loadMotherDashboard();
});
