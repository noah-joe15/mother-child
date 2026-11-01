/**
 * MNH RCH E-Clinic - Provider Dashboard Engine
 * Handles real-time queue management for Doctors, Pharmacists, and Admins.
 */

// ==========================================
// 1. CONFIGURATION & INITIALIZATION
// ==========================================
const CONFIG = {
    SUPABASE_URL: 'https://fmaaudmdgmgklvqcmvad.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E'
};

const supabase = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// Application State
let state = {
    currentUser: null,
    userRole: null,
    userName: null,
    currentStation: null,
    queueChannel: null
};

// ==========================================
// 2. AUTHENTICATION & INITIALIZATION
// ==========================================
async function initProviderDashboard() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            window.location.href = '/login';
            return;
        }
        
        state.currentUser = session.user;
        
        // Fetch user profile securely
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role, full_name')
            .eq('id', state.currentUser.id)
            .single();

        if (profileError || !profile) {
            console.error('[Auth] Profile fetch error:', profileError);
            window.location.href = '/login';
            return;
        }

        state.userRole = profile.role;
        state.userName = profile.full_name;
        
        // Determine station based on role
        if (state.userRole === 'doctor') {
            state.currentStation = 'Doctor';
        } else if (state.userRole === 'pharmacist') {
            state.currentStation = 'Pharmacy';
        } else if (state.userRole === 'admin') {
            state.currentStation = 'All'; 
        } else {
            // Redirect non-providers to their respective dashboards
            if (state.userRole === 'nurse') {
                window.location.href = '/nurse-dashboard';
                return;
            }
            window.location.href = '/login';
            return;
        }

        // Update UI with user info
        const userInfoEl = document.getElementById('user_info');
        if (userInfoEl) userInfoEl.textContent = `${state.userName} (${capitalize(state.userRole)})`;

        const stationTitleEl = document.getElementById('station_title');
        if (stationTitleEl) stationTitleEl.textContent = `${state.currentStation === 'All' ? 'System' : state.currentStation} Queue`;

        // Load initial data
        await loadQueue();
        
        // Subscribe to real-time updates
        subscribeToQueue();

        console.log(`[Dashboard] Initialized for ${state.userName} (${state.userRole})`);

    } catch (error) {
        console.error('[Dashboard] Initialization error:', error);
    }
}

// ==========================================
// 3. QUEUE MANAGEMENT
// ==========================================
async function loadQueue() {
    const queueList = document.getElementById('queue_list');
    if (!queueList) return;

    // Show loading state
    queueList.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-light);">
            <p>Loading queue...</p>
        </div>
    `;

    let query = supabase
        .from('queue')
        .select(`
            id,
            patient_id,
            current_station,
            status,
            created_at,
            patients (
                mother_name,
                child_name,
                child_dob
            )
        `)
        .order('created_at', { ascending: true });

    // Filter by station unless admin
    if (state.userRole !== 'admin') {
        query = query.eq('current_station', state.currentStation);
    }

    const { data, error } = await query;

    if (error) {
        console.error('[Queue] Error loading:', error);
        queueList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #ef4444;">
                <p>Failed to load queue. Please check your connection.</p>
            </div>
        `;
        return;
    }

    renderQueue(data);
    updateStats(data);
}

function renderQueue(queueItems) {
    const queueList = document.getElementById('queue_list');
    if (!queueList) return;

    if (!queueItems || queueItems.length === 0) {
        queueList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-light);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; margin: 0 auto 16px; opacity: 0.5;">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <p>No patients currently waiting in this station.</p>
            </div>
        `;
        return;
    }

    queueList.innerHTML = queueItems.map(item => {
        const patient = item.patients || {};
        const childName = patient.child_name || 'Unknown Child';
        const motherName = patient.mother_name || 'Unknown Mother';
        const time = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Determine action buttons based on role and status
        let actionButtons = '';
        
        if (item.status === 'Waiting') {
            actionButtons = `
                <button onclick="updateQueueStatus('${item.id}', 'In-Progress')" class="btn-primary" style="width: auto; padding: 8px 16px; font-size: 13px;">
                    Start Service
                </button>
            `;
        } else if (item.status === 'In-Progress') {
            if (state.userRole === 'doctor') {
                actionButtons = `
                    <button onclick="updateQueueStatus('${item.id}', 'Completed', 'Pharmacy')" class="btn-primary" style="width: auto; padding: 8px 16px; font-size: 13px; background: var(--blue-accent);">
                        Send to Pharmacy
                    </button>
                `;
            } else if (state.userRole === 'pharmacist') {
                actionButtons = `
                    <button onclick="updateQueueStatus('${item.id}', 'Completed')" class="btn-primary" style="width: auto; padding: 8px 16px; font-size: 13px; background: #16a34a;">
                        Dispense & Complete
                    </button>
                `;
            } else if (state.userRole === 'admin') {
                actionButtons = `<span style="font-size: 12px; color: var(--text-light);">Managed by staff</span>`;
            }
        }

        // Status badge styling
        let statusBadge = '';
        if (item.status === 'Waiting') {
            statusBadge = '<span style="display: inline-block; padding: 4px 10px; border-radius: 100px; font-size: 11px; font-weight: 700; background: #fef3c7; color: #d97706;">Waiting</span>';
        } else if (item.status === 'In-Progress') {
            statusBadge = '<span style="display: inline-block; padding: 4px 10px; border-radius: 100px; font-size: 11px; font-weight: 700; background: #dbeafe; color: #2563eb;">In Progress</span>';
        } else if (item.status === 'Completed') {
            statusBadge = '<span style="display: inline-block; padding: 4px 10px; border-radius: 100px; font-size: 11px; font-weight: 700; background: #dcfce7; color: #16a34a;">Completed</span>';
        }

        return `
            <div class="queue-item" data-id="${item.id}" style="margin-bottom: 12px; transition: all 0.2s;">
                <div class="queue-info" style="flex: 1;">
                    <h4 style="font-size: 15px; font-weight: 700; color: var(--text-dark); margin-bottom: 4px;">${childName}</h4>
                    <p style="font-size: 13px; color: var(--text-muted);">Mother: ${motherName}</p>
                </div>
                <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 8px;">
                    ${statusBadge}
                    <div style="font-size: 12px; color: var(--text-light);">${time}</div>
                    ${actionButtons}
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// 4. QUEUE ACTIONS
// ==========================================
async function updateQueueStatus(queueId, newStatus, nextStation = null) {
    try {
        const updateData = {
            status: newStatus,
            updated_at: new Date().toISOString()
        };

        if (nextStation) {
            updateData.current_station = nextStation;
        }

        const { error } = await supabase
            .from('queue')
            .update(updateData)
            .eq('id', queueId);

        if (error) {
            throw error;
        }

        console.log(`[Queue] Updated ID ${queueId} to ${newStatus}`);

    } catch (error) {
        console.error('[Queue] Error updating status:', error);
        alert('Failed to update patient status. Please try again.');
    }
}

// ==========================================
// 5. REAL-TIME SUBSCRIPTIONS
// ==========================================
function subscribeToQueue() {
    // Unsubscribe from existing channel if any to prevent duplicates
    if (state.queueChannel) {
        supabase.removeChannel(state.queueChannel);
    }

    state.queueChannel = supabase
        .channel('dashboard_queue_changes')
        .on('postgres_changes', 
            { 
                event: '*', 
                schema: 'public', 
                table: 'queue' 
            }, 
            (payload) => {
                console.log('[Realtime] Queue update received:', payload.eventType);
                loadQueue(); // Reload the queue to ensure UI consistency
            }
        )
        .subscribe((status) => {
            console.log('[Realtime] Subscription status:', status);
        });
}

// ==========================================
// 6. UTILITIES
// ==========================================
function updateStats(queueItems) {
    const waitingEl = document.getElementById('waiting_count');
    const progressEl = document.getElementById('progress_count');

    if (waitingEl) {
        const waiting = queueItems.filter(item => item.status === 'Waiting').length;
        waitingEl.textContent = waiting;
    }

    if (progressEl) {
        const inProgress = queueItems.filter(item => item.status === 'In-Progress').length;
        progressEl.textContent = inProgress;
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

async function handleLogout() {
    if (state.queueChannel) {
        supabase.removeChannel(state.queueChannel);
    }
    await supabase.auth.signOut();
    window.location.href = '/login';
}

// ==========================================
// 7. INITIALIZATION TRIGGER
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initProviderDashboard();
});
