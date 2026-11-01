/**
 * MNH RCH E-Clinic - Authentication Engine
 * Handles login, role-based routing, and session management.
 */

// ==========================================
// 1. CONFIGURATION
// ==========================================
const AUTH_CONFIG = {
    SUPABASE_URL: 'https://fmaaudmdgmgklvqcmvad.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E'
};

// Initialize Supabase Client
const supabase = window.supabase.createClient(AUTH_CONFIG.SUPABASE_URL, AUTH_CONFIG.SUPABASE_KEY);

// ==========================================
// 2. LOGIN HANDLER
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login_form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('login_error');
            const submitBtn = loginForm.querySelector('button[type="submit"]');
            
            // UI Loading State
            if (submitBtn) {
                submitBtn.textContent = 'Authenticating...';
                submitBtn.disabled = true;
            }
            if (errorDiv) errorDiv.style.display = 'none';

            try {
                // 1. Authenticate with Supabase
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });

                if (error) throw error;

                // 2. Fetch User Profile to get Role
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('role, full_name')
                    .eq('id', data.user.id)
                    .single();

                if (profileError || !profile) {
                    throw new Error('User profile not found. Please contact an administrator.');
                }

                // 3. Store minimal session data locally (Supabase session is the source of truth)
                localStorage.setItem('mnh_user_role', profile.role);
                localStorage.setItem('mnh_user_name', profile.full_name);

                // 4. Role-Based Routing to the new premium pages
                switch (profile.role) {
                    case 'nurse':
                        window.location.href = '/nurse-dashboard';
                        break;
                    case 'doctor':
                    case 'pharmacist':
                    case 'admin':
                        window.location.href = '/provider-dashboard';
                        break;
                    default:
                        // Fallback for unrecognized roles
                        window.location.href = '/login';
                        break;
                }

            } catch (error) {
                console.error('[Auth] Login failed:', error);
                if (errorDiv) {
                    errorDiv.textContent = error.message || 'Invalid email or password.';
                    errorDiv.style.display = 'block';
                } else {
                    alert('Login failed: ' + error.message);
                }
                
                // Reset button state
                if (submitBtn) {
                    submitBtn.textContent = 'Sign In';
                    submitBtn.disabled = false;
                }
            }
        });
    }
});

// ==========================================
// 3. AUTH CHECK HELPER (For protected pages)
// ==========================================
async function checkAuth() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            // No active session, redirect to login
            window.location.href = '/login';
            return null;
        }
        
        return session.user;
    } catch (error) {
        console.error('[Auth] Session check failed:', error);
        window.location.href = '/login';
        return null;
    }
}

// ==========================================
// 4. LOGOUT FUNCTION (Exposed globally for HTML onclick)
// ==========================================
window.handleLogout = async function() {
    try {
        await supabase.auth.signOut();
        localStorage.removeItem('mnh_user_role');
        localStorage.removeItem('mnh_user_name');
        window.location.href = '/login';
    } catch (error) {
        console.error('[Auth] Logout failed:', error);
        // Force redirect anyway
        window.location.href = '/login';
    }
};

// Also keep the old name for backward compatibility if any HTML still uses it
window.logout = window.handleLogout;
