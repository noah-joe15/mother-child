// ==========================================
// SUPABASE SETUP
// ==========================================
const SUPABASE_URL = 'https://fmaaudmdgmgklvqcmvad.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// AUTH CHECK
// ==========================================
let currentUser = null;
let userRole = localStorage.getItem('user_role');
let userName = localStorage.getItem('user_name');
let userStation = new URLSearchParams(window.location.search).get('station') || userRole;

async function initDashboard() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        window.location.href = 'login.html';
        return;
    }
    
    currentUser = session.user;
    
    // Update header
    document.getElementById('user_info').textContent = `${userName} (${userRole})`;
    document.getElementById('station_title').textContent = `${userStation} Queue`;
    
    // Load initial queue
    await loadQueue();
    
    // Subscribe to real-time updates
    subscribeToQueue();
}

// ==========================================
// LOAD QUEUE
// ==========================================
async function loadQueue() {
    const queueList = document.getElementById('queue_list');
    
    let query = supabase
        .from('queue')
        .select(`
            *,
            patients (
                mother_name,
                child_name,
                child_dob
            )
        `)
        .eq('status', 'Waiting')
        .order('created_at', { ascending: true });
    
    // Filter by station if user is not admin
    if (userRole !== 'admin') {
        query = query.eq('current_station', userStation);
    }
    
    const { data, error } = await query;
    
    if (error) {
        console.error('Error loading queue:', error);
        queueList.innerHTML = '<p class="error-message">Failed to load queue</p>';
        return;
    }
    
    renderQueue(data);
    updateStats(data);
}

// ==========================================
// RENDER QUEUE
// ==========================================
function renderQueue(queueItems) {
    const queueList = document.getElementById('queue_list');
    
    if (queueItems.length === 0) {
        queueList.innerHTML = `
            <div class="empty-state">
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <p>No patients waiting</p>
            </div>
        `;
        return;
    }
    
    queueList.innerHTML = queueItems.map(item => `
        <div class="queue-item" data-id="${item.id}">
            <div class="queue-item-header">
                <div class="patient-name">
                    <strong>${item.patients.child_name || 'Baby'}</strong>
                    <span class="patient-mother">Mother: ${item.patients.mother_name}</span>
                </div>
                <span class="queue-time">${new Date(item.created_at).toLocaleTimeString()}</span>
            </div>
            <div class="queue-item-actions">
                <button onclick="startService('${item.id}')" class="btn-action btn-start">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    Start Service
                </button>
            </div>
        </div>
    `).join('');
}

// ==========================================
// START SERVICE (Doctor/Pharmacist takes patient)
// ==========================================
async function startService(queueId) {
    const { error } = await supabase
        .from('queue')
        .update({ 
            status: 'In-Progress',
            updated_at: new Date().toISOString()
        })
        .eq('id', queueId);
    
    if (error) {
        alert('Failed to start service: ' + error.message);
    }
}

// ==========================================
// SUBSCRIBE TO REAL-TIME UPDATES
// ==========================================
function subscribeToQueue() {
    supabase
        .channel('queue_changes')
        .on('postgres_changes', 
            { 
                event: '*', 
                schema: 'public', 
                table: 'queue' 
            }, 
            (payload) => {
                console.log('Queue update:', payload);
                loadQueue(); // Reload queue on any change
            }
        )
        .subscribe();
}

// ==========================================
// UPDATE STATS
// ==========================================
function updateStats(queueItems) {
    const waiting = queueItems.filter(item => item.status === 'Waiting').length;
    const inProgress = queueItems.filter(item => item.status === 'In-Progress').length;
    
    document.getElementById('waiting_count').textContent = waiting;
    document.getElementById('progress_count').textContent = inProgress;
}

// ==========================================
// LOGOUT
// ==========================================
async function logout() {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.href = 'login.html';
}

// Initialize on load
initDashboard();
