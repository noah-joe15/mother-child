// ==========================================
// 1. SETUP SUPABASE & DEXIE (OFFLINE DB)
// ==========================================
const SUPABASE_URL = 'https://fmaaudmdgmgklvqcmvad.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Initialize Dexie (Local IndexedDB)
// Note: This is isolated to this specific web app's domain. It will not affect your other projects.
const db = new Dexie("MNHRCHDatabase");
db.version(1).stores({
    patients: '++id, mother_name, phone_number',
    vitals: '++id, patient_id, synced', 
    queue: '++id, patient_id, status'
});

// ==========================================
// 2. THE SYNC ENGINE
// ==========================================
async function syncVitalsToCloud() {
    if (!navigator.onLine) return; 

    const unsyncedVitals = await db.vitals.where('synced').equals(0).toArray();
    if (unsyncedVitals.length === 0) return;

    console.log(`Syncing ${unsyncedVitals.length} records to cloud...`);

    for (let vital of unsyncedVitals) {
        const { error } = await supabase.from('vitals').insert({
            patient_id: vital.patient_id,
            weight_kg: vital.weight_kg,
            muac_mm: vital.muac_mm,
            temperature: vital.temperature
        });

        if (!error) {
            await db.vitals.update(vital.id, { synced: 1 });
            console.log("Synced vital record to cloud!");
        } else {
            console.error("Sync error:", error);
        }
    }
}

window.addEventListener('online', syncVitalsToCloud);
setInterval(syncVitalsToCloud, 30000); 

// ==========================================
// 3. SMART TRIAGE UI LOGIC (MUAC Color Coding)
// ==========================================
function calculateNutritionStatus() {
    const muacInput = document.getElementById('muac_mm');
    const statusBox = document.getElementById('nutrition_status');
    const muacValue = parseInt(muacInput.value);

    // Reset classes
    statusBox.className = 'status-box';

    if (isNaN(muacValue)) {
        statusBox.classList.add('neutral');
        statusBox.innerHTML = `
            <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span id="status_text">Enter MUAC to check nutritional status</span>
        `;
        return;
    }

    // Tanzanian Ministry of Health MUAC Guidelines for Under-5
    if (muacValue < 115) {
        statusBox.classList.add('danger');
        statusBox.innerHTML = `
            <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span id="status_text">SEVERE MALNUTRITION (RED) - Immediate Doctor Attention!</span>
        `;
    } else if (muacValue >= 115 && muacValue < 125) {
        statusBox.classList.add('warning');
        statusBox.innerHTML = `
            <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span id="status_text">MODERATE MALNUTRITION (YELLOW) - Monitor Closely</span>
        `;
    } else {
        statusBox.classList.add('success');
        statusBox.innerHTML = `
            <svg class="status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <span id="status_text">HEALTHY (GREEN) - Proceed to Vaccination</span>
        `;
    }
}

// ==========================================
// 4. SAVE TO OFFLINE DB
// ==========================================
async function saveVitalsOffline() {
    const patientId = 1; // In real app, this would be from patient selection
    const weight = document.getElementById('weight_kg').value;
    const muac = document.getElementById('muac_mm').value;
    const temp = document.getElementById('temperature').value;

    if (!weight || !muac || !temp) {
        alert("Please fill in all fields.");
        return;
    }

    // Save to local DB
    await db.vitals.add({
        patient_id: patientId,
        weight_kg: parseFloat(weight),
        muac_mm: parseInt(muac),
        temperature: parseFloat(temp),
        synced: 0 
    });

    // Add to queue for Doctor
    const { error: queueError } = await supabase.from('queue').insert({
        patient_id: patientId,
        current_station: 'Doctor',
        status: 'Waiting'
    });

    if (queueError) {
        console.error('Queue error:', queueError);
    }

    alert("Vitals saved! Patient added to Doctor's queue.");
    syncVitalsToCloud(); 
    
    document.getElementById('vitals_form').reset();
    calculateNutritionStatus();
}
// ==========================================
// 5. NETWORK STATUS INDICATOR
// ==========================================
function updateNetworkStatus() {
    const badge = document.getElementById('network_status');
    
    if (navigator.onLine) {
        badge.className = "network-badge online";
        badge.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
                <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
            <span id="network_text">ONLINE</span>
        `;
    } else {
        badge.className = "network-badge offline";
        badge.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="1" y1="1" x2="23" y2="23"></line>
                <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
                <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
                <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
                <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
                <line x1="12" y1="20" x2="12.01" y2="20"></line>
            </svg>
            <span id="network_text">OFFLINE</span>
        `;
    }
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
updateNetworkStatus();
