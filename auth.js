// ==========================================
// SUPABASE AUTH SETUP
// ==========================================
const SUPABASE_URL = 'https://fmaaudmdgmgklvqcmvad.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// LOGIN HANDLER
// ==========================================
document.getElementById('login_form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login_error');
    
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        // Get user role from profiles table
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role, full_name')
            .eq('id', data.user.id)
            .single();

        if (profileError) throw profileError;

        // Store auth data in localStorage
        localStorage.setItem('user_role', profile.role);
        localStorage.setItem('user_name', profile.full_name);
        localStorage.setItem('user_id', data.user.id);

        // Redirect based on role
        if (profile.role === 'nurse') {
            window.location.href = 'triage.html';
        } else if (profile.role === 'doctor') {
            window.location.href = 'dashboard.html?station=Doctor';
        } else if (profile.role === 'pharmacist') {
            window.location.href = 'dashboard.html?station=Pharmacy';
        } else {
            window.location.href = 'dashboard.html';
        }

    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.style.display = 'block';
    }
});

// ==========================================
// CHECK IF USER IS LOGGED IN
// ==========================================
async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
        window.location.href = 'login.html';
        return null;
    }
    
    return session.user;
}

// ==========================================
// LOGOUT FUNCTION
// ==========================================
async function logout() {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.href = 'login.html';
}
