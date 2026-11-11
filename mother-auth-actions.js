/**
 * Secure Mother Authentication
 * Uses OTP (SMS or email) instead of phone-only login
 */
(function () {
    'use strict';

    const SUPABASE_URL = 'https://fmaaudmdgmgklvqcmvad.supabase.co';
    const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E';
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    let rateLimitAttempts = {};

    // Rate limiting: max 3 OTP requests per phone per 15 minutes
    function checkRateLimit(phone) {
        const now = Date.now();
        const windowMs = 15 * 60 * 1000; // 15 minutes
        const maxAttempts = 3;

        if (!rateLimitAttempts[phone]) {
            rateLimitAttempts[phone] = [];
        }

        // Clean old attempts
        rateLimitAttempts[phone] = rateLimitAttempts[phone].filter(
            timestamp => now - timestamp < windowMs
        );

        if (rateLimitAttempts[phone].length >= maxAttempts) {
            return false;
        }

        rateLimitAttempts[phone].push(now);
        return true;
    }

    window.requestOTP = async function () {
        const phone = document.getElementById('login_phone').value.trim();
        const statusEl = document.getElementById('otp_status');

        if (!phone || phone.replace(/\D/g, '').length < 9) {
            statusEl.textContent = 'Please enter a valid phone number.';
            statusEl.className = 'otp-status error';
            return;
        }

        // Check if this phone exists (don't reveal if it doesn't)
        const { data: patients } = await supabase
            .from('patients')
            .select('id')
            .or(`phone_number.eq.${phone},phone_number.eq.+255${phone.slice(1)}`)
            .limit(1);

        if (!patients || patients.length === 0) {
            // Generic message - don't reveal if phone is registered
            statusEl.textContent = 'If this number is registered, you will receive an OTP via SMS.';
            statusEl.className = 'otp-status info';
            return;
        }

        if (!checkRateLimit(phone)) {
            statusEl.textContent = 'Too many attempts. Please try again in 15 minutes.';
            statusEl.className = 'otp-status error';
            return;
        }

        try {
            // Send OTP via Supabase Auth (SMS or email magic link)
            const { error } = await supabase.auth.signInWithOtp({
                phone: phone.startsWith('+') ? phone : `+255${phone.slice(1)}`,
                options: {
                    shouldCreateUser: false // Don't create new users
                }
            });

            if (error) {
                // Still show generic message
                statusEl.textContent = 'If this number is registered, you will receive an OTP via SMS.';
                statusEl.className = 'otp-status info';
                return;
            }

            statusEl.textContent = 'OTP sent! Check your phone and enter the code below.';
            statusEl.className = 'otp-status success';
            document.getElementById('otp_input_section').style.display = 'block';
        } catch (err) {
            statusEl.textContent = 'Error sending OTP. Please try again.';
            statusEl.className = 'otp-status error';
        }
    };

    window.verifyOTP = async function () {
        const phone = document.getElementById('login_phone').value.trim();
        const otp = document.getElementById('otp_code').value.trim();
        const statusEl = document.getElementById('otp_status');

        if (!otp || otp.length !== 6) {
            statusEl.textContent = 'Please enter the 6-digit OTP.';
            statusEl.className = 'otp-status error';
            return;
        }

        try {
            const { data, error } = await supabase.auth.verifyOtp({
                phone: phone.startsWith('+') ? phone : `+255${phone.slice(1)}`,
                token: otp,
                type: 'sms'
            });

            if (error) {
                statusEl.textContent = 'Invalid OTP. Please try again.';
                statusEl.className = 'otp-status error';
                return;
            }

            // Success - redirect to dashboard
            window.location.href = 'mother-dashboard.html';
        } catch (err) {
            statusEl.textContent = 'Verification failed. Please try again.';
            statusEl.className = 'otp-status error';
        }
    };

    // Check if already authenticated
    async function checkAuth() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            window.location.href = 'mother-dashboard.html';
        }
    }

    checkAuth();
})();
