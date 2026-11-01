/**
 * MNH RCH E-Clinic - Clinical Workflow Engine
 * Handles offline-first data capture, MUAC triage logic, and queue management.
 */

// ==========================================
// 1. CONFIGURATION & INITIALIZATION
// ==========================================
const CONFIG = {
    SUPABASE_URL: 'https://fmaaudmdgmgklvqcmvad.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E',
    DB_NAME: 'MNHRCHDatabase',
    DB_VERSION: 1
};

// Initialize Supabase
const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Initialize Dexie (Offline-First Local Database)
const db = new Dexie(CONFIG.DB_NAME);
db.version(CONFIG.DB_VERSION).stores({
    patients: '++id, mother_name, child_name, phone_number, sha_number',
    vitals: '++id, patient_id, weight_kg, muac_mm, temperature, synced, recorded_at',
    queue: '++id, patient_id, current_station, status, created_at'
});

// Application State
let state = {
    currentPatientId: null,
    isOnline: navigator.onLine
};

// ==========================================
// 2. NETWORK & SYNC ENGINE
// ==========================================
async function syncDataToCloud() {
    if (!state.isOnline) return;

    try {
        const unsyncedVitals = await db.vitals.where('synced').equals(0).toArray();
        if (unsyncedVitals.length === 0) return;

        console.log(`[Sync] Pushing ${unsyncedVitals.length} records to cloud...`);

        for (const vital of unsyncedVitals) {
            const { error } = await supabase.from('vitals').insert({
                patient_id: vital.patient_id,
                weight_kg: vital.weight_kg,
                muac_mm: vital.muac_mm,
                temperature: vital.temperature,
                recorded_at: vital.recorded_at
            });

            if (!error) {
                await db.vitals.update(vital.id, { synced: 1 });
                console.log(`[Sync] Successfully synced vital record ID: ${vital.id}`);
            } else {
                console.error(`[Sync] Failed to sync record ID: ${vital.id}`, error);
            }
        }
    } catch (error) {
        console.error('[Sync] Critical sync error:', error);
    }
}

function updateNetworkIndicator() {
    state.isOnline = navigator.onLine;
    const badge = document.getElementById('network_status');
    const text = document.getElementById('network_text');
    
    if (!badge || !text) return;

    if (state.isOnline) {
        badge.className = 'network-badge online';
        text.textContent = 'ONLINE';
        syncDataToCloud(); // Trigger sync immediately when coming back online
    } else {
        badge.className = 'network-badge offline';
        text.textContent = 'OFFLINE';
    }
}

// Listen for network changes
window.addEventListener('online', updateNetworkIndicator);
window.addEventListener('offline', updateNetworkIndicator);
setInterval(syncDataToCloud, 30000); // Background sync every 30 seconds

// ==========================================
// 3. SMART TRIAGE UI LOGIC (MUAC Color Coding)
// ==========================================
function evaluateNutritionStatus(muacValue) {
    const statusBox = document.getElementById('nutrition_status');
    if (!statusBox) return;

    // Reset base classes
    statusBox.className = 'status-box';

    if (isNaN(muacValue) || muacValue <= 0) {
        statusBox.classList.add('neutral');
        statusBox.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>Enter MUAC to check nutritional status</span>
        `;
        return;
    }

    // Tanzanian Ministry of Health MUAC Guidelines for Under-5
    if (muacValue < 115) {
        statusBox.classList.add('danger');
        statusBox.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>SEVERE MALNUTRITION (RED) - Immediate Doctor Attention!</span>
        `;
    } else if (muacValue >= 115 && muacValue < 125) {
        statusBox.classList.add('warning');
        statusBox.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>MODERATE MALNUTRITION (YELLOW) - Monitor Closely</span>
        `;
    } else {
        statusBox.classList.add('success');
        statusBox.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span>HEALTHY (GREEN) - Proceed to Vaccination</span>
        `;
    }
}

// ==========================================
// 4. FORM HANDLERS & WORKFLOW
// ==========================================
async function handlePatientRegistration(event) {
    event.preventDefault();
    
    const formData = {
        mother_name: document.getElementById('mother_name').value.trim(),
        child_name: document.getElementById('child_name').value.trim() || 'Baby',
        child_dob: document.getElementById('child_dob').value,
        phone_number: document.getElementById('phone_number').value.trim(),
        sha_number: document.getElementById('sha_number').value.trim()
    };

    try {
        // Save to Cloud (and local DB via Supabase trigger if needed, or we can save locally first)
        const { data, error } = await supabase.from('patients').insert(formData).select().single();

        if (error) throw error;

        state.currentPatientId = data.id;
        
        // Update UI
        const summaryEl = document.getElementById('patient_summary');
        if (summaryEl) {
            summaryEl.innerHTML = `<strong>${data.child_name}</strong> (Mother: ${data.mother_name})`;
        }
        
        const vitalsSection = document.getElementById('vitals_section');
        if (vitalsSection) {
            vitalsSection.style.display = 'block';
            vitalsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

    } catch (error) {
        console.error('[Registration] Error:', error);
        alert('Failed to register patient. Please check your connection and try again.');
    }
}

async function handleSaveVitals(event) {
    event.preventDefault(); // Prevent any default form submission

    const weight = parseFloat(document.getElementById('weight_kg').value);
    const muac = parseInt(document.getElementById('muac_mm').value, 10);
    const temp = parseFloat(document.getElementById('temperature').value);

    if (!weight || !muac || !temp || !state.currentPatientId) {
        alert('Please ensure all vital fields are filled correctly.');
        return;
    }

    try {
        const timestamp = new Date().toISOString();

        // 1. Save to Local Offline DB immediately (Zero latency)
        await db.vitals.add({
            patient_id: state.currentPatientId,
            weight_kg: weight,
            muac_mm: muac,
            temperature: temp,
            recorded_at: timestamp,
            synced: 0
        });

        // 2. Add to Digital Queue for the Doctor
        await supabase.from('queue').insert({
            patient_id: state.currentPatientId,
            current_station: 'Doctor',
            status: 'Waiting',
            created_at: timestamp
        });

        // 3. Success Feedback
        alert('✓ Vitals saved successfully! Patient has been added to the Doctor\'s queue.');
        
        // 4. Reset UI for next patient
        document.getElementById('patient_form').reset();
        document.getElementById('vitals_section').style.display = 'none';
        evaluateNutritionStatus(NaN); // Reset status box
        state.currentPatientId = null;

        // 5. Trigger background sync
        syncDataToCloud();

    } catch (error) {
        console.error('[Vitals] Error saving:', error);
        alert('An error occurred while saving. Data is saved locally and will sync when online.');
    }
}

// ==========================================
// 5. INITIALIZATION & EVENT BINDING
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Network Status
    updateNetworkIndicator();

    // 2. Bind MUAC Input Listener
    const muacInput = document.getElementById('muac_mm');
    if (muacInput) {
        muacInput.addEventListener('input', (e) => {
            evaluateNutritionStatus(parseInt(e.target.value, 10));
        });
    }

    // 3. Bind Patient Registration Form
    const patientForm = document.getElementById('patient_form');
    if (patientForm) {
        patientForm.addEventListener('submit', handlePatientRegistration);
    }

    // 4. Bind Save Vitals Button (assuming it's a button inside or outside a form)
    const saveVitalsBtn = document.getElementById('save_vitals_btn');
    if (saveVitalsBtn) {
        saveVitalsBtn.addEventListener('click', handleSaveVitals);
    }

    console.log('[MNH RCH] Clinical engine initialized successfully.');
});
