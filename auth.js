/**
 * MNH RCH E-Clinic - Authentication Engine
 * Version 6 - Fixed duplicate declaration issue
 */

console.log('[Auth] Script loaded');

// Configuration
const AUTH_CONFIG = {
    SUPABASE_URL: 'https://fmaaudmdgmgklvqcmvad.supabase.co',
    SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E'
};

// Create Supabase client ONLY if window.supabase exists and we haven't created one yet
let supabaseClient;

if (typeof window.supabase !== 'undefined') {
    supabaseClient = window.supabase.createClient(AUTH_CONFIG.SUPABASE_URL, AUTH_CONFIG.SUPABASE_KEY);
    console.log('[Auth] Supabase client created successfully');
} else {
    console.error('[Auth] ERROR: Supabase library not loaded!');
}

// Login Form Handler
document.addEventListener('DOMContentLoaded', () => {
    console.log('[Auth] DOM loaded');
    
    const loginForm = document.getElementById('login_form');
    
    if (!loginForm) {
        console.log('[Auth] No login form found on this page');
        return;
    }
    
    console.log('[Auth] Login form found, attaching submit handler');
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('[Auth] Form submitted');
        
        if (!supabaseClient) {
            alert('System error: Supabase not initialized. Please refresh the page.');
            return;
        }
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('login_error');
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        
        console.log('[Auth] Attempting login for:', email);
        
        // Show loading state
        if (submitBtn) {
            submitBtn.textContent = 'Authenticating...';
            submitBtn.disabled = true;
        }
        if (errorDiv) {
            errorDiv.style.display = 'none';
            errorDiv.textContent = '';
        }

        try {
            // Authenticate
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) {
                console.error('[Auth] Login error:', error);
                throw error;
            }

            console.log('[Auth] Authentication successful, user ID:', data.user.id);

            // Fetch user profile
            const { data: profile, error: profileError } = await supabaseClient
                .from('profiles')
                .select('role, full_name')
                .eq('id', data.user.id)
                .single();

            if (profileError || !profile) {
                console.error('[Auth] Profile fetch error:', profileError);
                throw new Error('User profile not found. Please contact administrator.');
            }

            console.log('[Auth] Profile loaded:', profile);

            // Store in localStorage
            localStorage.setItem('mnh_user_role', profile.role);
            localStorage.setItem('mnh_user_name', profile.full_name);

            // Redirect based on role
            let redirectUrl;
            switch (profile.role) {
                case 'nurse':
                    redirectUrl = 'nurse.html';
                    break;
                case 'doctor':
                case 'pharmacist':
                case 'admin':
                    redirectUrl = 'doctor.html';
                    break;
                default:
                    redirectUrl = 'login.html';
            }

            console.log('[Auth] Redirecting to:', redirectUrl);
            window.location.href = redirectUrl;

        } catch (error) {
            console.error('[Auth] Login failed:', error);
            
            if (errorDiv) {
                errorDiv.textContent = error.message || 'Invalid email or password.';
                errorDiv.style.display = 'block';
            } else {
                alert('Login failed: ' + error.message);
            }
            
            // Reset button
            if (submitBtn) {
                submitBtn.textContent = 'Sign In to Dashboard';
                submitBtn.disabled = false;
            }
        }
    });
});

// Global logout function
window.handleLogout = async function() {
    console.log('[Auth] Logout initiated');
    
    if (supabaseClient) {
        await supabaseClient.auth.signOut();
    }
    
    localStorage.removeItem('mnh_user_role');
    localStorage.removeItem('mnh_user_name');
    window.location.href = 'login.html';
};

// Backward compatibility
window.logout = window.handleLogout;
