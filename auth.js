/**
 * MNH RCH E-Clinic - Authentication Engine
 */

const AUTH_CONFIG = {
    SUPABASE_URL: 'https://fmaaudmdgmgklvqcmvad.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E'
};

// Safe Supabase initialization
let supabase;
if (typeof window.supabase !== 'undefined') {
    supabase = window.supabase.createClient(AUTH_CONFIG.SUPABASE_URL, AUTH_CONFIG.SUPABASE_KEY);
    console.log('[Auth] Supabase initialized');
} else {
    console.error('[Auth] Supabase library not loaded!');
}

// Login Handler
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login_form');
    
    if (!loginForm) {
        console.log('[Auth] No login form found on this page');
        return;
    }
    
    console.log('[Auth] Login form found, attaching handler');
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('[Auth] Login form submitted');
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login_error');
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        
        if (!supabase) {
            alert('System error: Supabase not loaded. Please refresh the page.');
            return;
        }
        
        if (submitBtn) {
            submitBtn.textContent = 'Authenticating...';
            submitBtn.disabled = true;
        }
        if (errorDiv) errorDiv.style.display = 'none';

        try {
            console.log('[Auth] Attempting login for:', email);
            
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                console.error('[Auth] Login error:', error);
                throw error;
            }

            console.log('[Auth] Authentication successful, fetching profile...');

            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role, full_name')
                .eq('id', data.user.id)
                .single();

            if (profileError || !profile) {
                console.error('[Auth] Profile error:', profileError);
                throw new Error('User profile not found. Please contact an administrator.');
            }

            console.log('[Auth] Profile found:', profile);

            localStorage.setItem('mnh_user_role', profile.role);
            localStorage.setItem('mnh_user_name', profile.full_name);

            // Redirect based on role
            switch (profile.role) {
                case 'nurse':
                    console.log('[Auth] Redirecting to nurse.html');
                    window.location.href = 'nurse.html';
                    break;
                case 'doctor':
                case 'pharmacist':
                case 'admin':
                    console.log('[Auth] Redirecting to doctor.html');
                    window.location.href = 'doctor.html';
                    break;
                default:
                    console.log('[Auth] Unknown role, redirecting to login');
                    window.location.href = 'login.html';
            }

        } catch (error) {
            console.error('[Auth] Login failed:', error);
            if (errorDiv) {
                errorDiv.textContent = error.message || 'Invalid email or password.';
                errorDiv.style.display = 'block';
            } else {
                alert('Login failed: ' + error.message);
            }
            
            if (submitBtn) {
                submitBtn.textContent = 'Sign In';
                submitBtn.disabled = false;
            }
        }
    });
});

// Logout Function
window.handleLogout = async function() {
    console.log('[Auth] Logout initiated');
    if (supabase) {
        await supabase.auth.signOut();
    }
    localStorage.removeItem('mnh_user_role');
    localStorage.removeItem('mnh_user_name');
    window.location.href = 'login.html';
};

window.logout = window.handleLogout;
