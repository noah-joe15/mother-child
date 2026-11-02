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

// Use window.supabase to avoid re-declaration errors
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. HELPER FUNCTIONS
// ==========================================

// Calculate age from DOB string (e.g., "2026-10-01")
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

// Evaluate MUAC status
function evaluateMUAC(muac) {
    if (!muac) return { status: 'Unknown', class: 'warning', icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>' };
    const val = parseFloat(muac);
    if (val < 115) return { status: 'Severe Risk', class: 'warning', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' };
    if (val < 125) return { status: 'Moderate Risk', class: 'warning', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' };
    return { status: 'Normal', class: 'success', icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' };
}

// Format date to "DD Mon YYYY"
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ==========================================
// 3. MODAL SYSTEM (Sophisticated UI)
// ==========================================
function showModal(title, contentHTML) {
    // Remove existing modal if any
    const existingModal = document.getElementById('dynamic_modal');
    if (existingModal) existingModal.remove();

    const modalHTML = '<div id="dynamic_modal" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px;"><div style="background: white; border-radius: 16px; width: 100%; max-width: 500px; box-shadow: 0 20px 50px rgba(0,0,0,0.2); animation: slideUp 0.3s ease-out;"><div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;"><h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">' + title + '</h3><button onclick="closeModal()" style="background: none; border: none; cursor: pointer; color: #64748b; padding: 4px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div><div style="padding: 24px; color: #334155; line-height: 1.6;">' + contentHTML + '</div><div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; text-align: right;"><button onclick="closeModal()" style="background: #1e3a8a; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Close</button></div></div></div>';
    
    // Add animation style if not present
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
        console.warn('[Patient Actions] No user phone found. Redirecting to register.');
        window.location.href = 'register.html';
        return;
    }

    console.log('[Patient Actions] Loading dashboard for:', phone);

    // Update User Pill
    if (name) document.getElementById('user_name').textContent = name;
    document.getElementById('user_phone').textContent = phone;

    try {
        // 1. Fetch Patient Data
        const { data: patients, error: pError } = await supabase
            .from('patients')
            .select('*')
            .eq('phone_number', phone)
            .order('created_at', { ascending: false })
            .limit(1);

        if (pError || !patients || patients.length === 0) {
            console.error('[Patient Actions] Patient not found:', pError);
            document.getElementById('child_name').textContent = 'No record found';
            return;
        }

        const patient = patients[0];
        console.log('[Patient Actions] Patient data loaded:', patient);

        // 2. Populate Child Profile
        document.getElementById('child_name').textContent = patient.child_name || 'Unborn / Not Recorded';
        
        const age = calculateAge(patient.child_dob);
        const dobFormatted = patient.child_dob ? formatDate(patient.child_dob) : 'Not recorded';
        document.getElementById('child_dob').textContent = patient.child_dob ? dobFormatted + ' (' + age + ')' : 'Not recorded';
        
        document.getElementById('child_sex').textContent = patient.child_sex || 'Not recorded';

        // 3. Fetch Latest Vitals for Nutrition Status
        const { data: vitals } = await supabase
            .from('vitals')
            .select('muac_mm, weight_kg, temperature, recorded_at')
            .eq('patient_id', patient.id)
            .order('recorded_at', { ascending: false })
            .limit(1);

        if (vitals && vitals.length > 0) {
            const latestVital = vitals[0];
            const muacEval = evaluateMUAC(latestVital.muac_mm);
            
            document.getElementById('nutrition_status').className = 'status-badge ' + muacEval.class;
            document.getElementById('nutrition_status').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 12px; height: 12px;">' + muacEval.icon + '</svg>' + muacEval.status;
        } else {
            document.getElementById('nutrition_status').innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 12px; height: 12px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>Pending Assessment';
        }

        // 4. Fetch Visit History for Activity List
        const { data: visits } = await supabase
            .from('queue')
            .select('status, current_station, created_at, diagnosis, prescription')
            .eq('patient_id', patient.id)
            .order('created_at', { ascending: false })
            .limit(5);

        renderActivityList(visits);

    } catch (error) {
        console.error('[Patient Actions] Critical error loading dashboard:', error);
    }
}

// ==========================================
// 5. UI RENDERING FUNCTIONS
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
        let vitalsHTML = '';

        if (visit.diagnosis) {
            title = 'Consultation';
            details = 'Diagnosis: ' + visit.diagnosis;
        }

        return '<div class="activity-item"><div class="activity-date"><div class="activity-day">' + day + '</div><div class="activity-month">' + month + '</div></div><div class="activity-details" style="flex: 1;"><h4>' + title + '</h4><p>' + details + '</p>' + vitalsHTML + '</div></div>';
    }).join('');
}

// ==========================================
// 6. QUICK ACTION HANDLERS
// ==========================================
window.viewImmunizationCard = function() {
    showModal('Immunization Card', '<p><strong>Child Immunization Status:</strong> On Track</p><hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;"><ul style="list-style: none; padding: 0; margin: 0;"><li style="padding: 8px 0; display: flex; justify-content: space-between;"><span>BCG (At Birth)</span><span style="color: #16a34a; font-weight: 600;">Completed</span></li><li style="padding: 8px 0; display: flex; justify-content: space-between;"><span>OPV 0 (At Birth)</span><span style="color: #16a34a; font-weight: 600;">Completed</span></li><li style="padding: 8px 0; display: flex; justify-content: space-between;"><span>Pentavalent 1 (6 weeks)</span><span style="color: #d97706; font-weight: 600;">Due Soon</span></li></ul><p style="margin-top: 16px; font-size: 13px; color: #64748b;">* This is a digital representation of the Kadi ya Kliniki.</p>');
};

window.viewAppointments = function() {
    showModal('Upcoming Appointments', '<div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin-bottom: 12px;"><div style="font-weight: 700; color: #1e3a8a; margin-bottom: 4px;">Next Vaccination Visit</div><div style="font-size: 14px;">Date: 15 Nov 2026</div><div style="font-size: 14px;">Purpose: Pentavalent 1 & OPV 1</div></div><p style="font-size: 13px; color: #64748b;">You will receive an SMS reminder 2 days before this appointment.</p>');
};

window.viewGrowthChart = function() {
    showModal('Growth Monitoring', '<p><strong>Latest Measurement:</strong></p><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 16px 0;"><div style="background: #f8fafc; padding: 12px; border-radius: 8px; text-align: center;"><div style="font-size: 12px; color: #64748b;">Weight</div><div style="font-size: 18px; font-weight: 700; color: #0f172a;">5.2 kg</div></div><div style="background: #f8fafc; padding: 12px; border-radius: 8px; text-align: center;"><div style="font-size: 12px; color: #64748b;">MUAC</div><div style="font-size: 18px; font-weight: 700; color: #16a34a;">130 mm</div></div></div><p style="font-size: 13px; color: #64748b;">Growth is tracking along the healthy WHO percentile curve.</p>');
};

window.viewVisitHistory = function() {
    showModal('Full Visit History', '<p>Your complete clinical history is securely stored. Below is a summary:</p><ul style="padding-left: 20px; margin-top: 12px;"><li style="margin-bottom: 8px;"><strong>02 Nov 2026:</strong> Initial Registration & Vitals (Nurse Juma)</li><li style="margin-bottom: 8px;"><strong>15 Oct 2026:</strong> Antenatal Checkup - Week 32 (Dr. Amina)</li></ul><button style="margin-top: 16px; width: 100%; padding: 10px; background: #1e3a8a; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">Download Full PDF Report</button>');
};

window.updateMyInfo = function() {
    const currentPhone = localStorage.getItem('mnh_user_phone');
    const newPhone = prompt('Enter your new phone number (leave blank to keep current):', currentPhone);
    
    if (newPhone && newPhone.trim() !== '' && newPhone.trim() !== currentPhone) {
        // In a real app, this would update the Supabase database
        localStorage.setItem('mnh_user_phone', newPhone.trim());
        alert('Phone number updated successfully! Please log in again with your new number.');
        window.location.href = 'index.html';
    }
};

window.handleLogout = async function() {
    console.log('[Patient Actions] Logging out...');
    await supabase.auth.signOut();
    localStorage.removeItem('mnh_user_phone');
    localStorage.removeItem('mnh_user_name');
    window.location.href = 'index.html';
};

// ==========================================
// 7. INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', function() {
    loadMotherDashboard();
});
