/**
 * MNH RCH - Nurse Actions & Station Logic
 * Handles stats, registration, search, and full patient records.
 * Wrapped in IIFE to prevent duplicate-declaration crashes.
 */
(function () {
    'use strict';

    if (window.__MNH_NURSE_ACTIONS_LOADED__) {
        console.warn('[Nurse Actions] Already loaded, skipping duplicate.');
        return;
    }
    window.__MNH_NURSE_ACTIONS_LOADED__ = true;

    console.log('[Nurse Actions] Script loaded');

    // ==========================================
    // 1. CONFIGURATION
    // ==========================================
    var SUPABASE_URL = 'https://fmaaudmdgmgklvqcmvad.supabase.co';
    var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E';
    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // Offline cache (Dexie) for future offline sync
    var db = new Dexie("MNHRCHDatabase");
    db.version(1).stores({ vitals: '++id, patient_id, synced' });

    // ==========================================
    // 2. HELPERS
    // ==========================================
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function formatDate(d) {
        if (!d) return 'N/A';
        return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function formatDateTime(d) {
        if (!d) return 'N/A';
        return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
               new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }

    function calculateAge(dobString) {
        if (!dobString) return '';
        var dob = new Date(dobString);
        var today = new Date();
        var months = (today.getFullYear() - dob.getFullYear()) * 12;
        months -= dob.getMonth();
        months += today.getMonth();
        if (months < 0) return 'Unborn';
        if (months < 1) return 'Newborn';
        if (months < 12) return months + ' month' + (months > 1 ? 's' : '');
        var years = Math.floor(months / 12);
        var rem = months % 12;
        return rem > 0 ? years + 'y ' + rem + 'm' : years + ' year' + (years > 1 ? 's' : '');
    }

    function muacInfo(muac) {
        var val = parseFloat(muac);
        if (isNaN(val)) return { text: 'No MUAC', color: '#64748b' };
        if (val < 115) return { text: 'Severe', color: '#ef4444' };
        if (val < 125) return { text: 'Moderate', color: '#d97706' };
        return { text: 'Healthy', color: '#16a34a' };
    }

    // ==========================================
    // 3. MODAL SYSTEM (Full Patient Record)
    // ==========================================
    function showNurseModal(title, html) {
        var old = document.getElementById('nurse_modal');
        if (old) old.remove();

        if (!document.getElementById('nurse-modal-anim')) {
            var st = document.createElement('style');
            st.id = 'nurse-modal-anim';
            st.textContent = '@keyframes nurseSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }';
            document.head.appendChild(st);
        }

        var wrap = document.createElement('div');
        wrap.id = 'nurse_modal';
        wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.6);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
        wrap.innerHTML =
            '<div style="background:white;border-radius:16px;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,.25);animation:nurseSlideUp .3s ease-out;">' +
                '<div style="padding:20px 24px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:white;border-radius:16px 16px 0 0;">' +
                    '<h3 style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">' + title + '</h3>' +
                    '<button onclick="closeNurseModal()" style="background:none;border:none;cursor:pointer;color:#64748b;padding:4px;">' +
                        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
                    '</button>' +
                '</div>' +
                '<div style="padding:24px;">' + html + '</div>' +
                '<div style="padding:16px 24px;border-top:1px solid #e2e8f0;text-align:right;">' +
                    '<button onclick="closeNurseModal()" style="background:#1e3a8a;color:white;border:none;padding:10px 24px;border-radius:8px;font-weight:600;cursor:pointer;">Close Record</button>' +
                '</div>' +
            '</div>';
        wrap.addEventListener('click', function (e) { if (e.target === wrap) closeNurseModal(); });
        document.body.appendChild(wrap);
    }

    function closeNurseModal() {
        var m = document.getElementById('nurse_modal');
        if (m) m.remove();
    }
    window.closeNurseModal = closeNurseModal;

    function sectionTitle(t) {
        return '<div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin:18px 0 8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">' + t + '</div>';
    }

    function row(label, value) {
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;font-size:14px;"><span style="color:#64748b;">' + label + '</span><span style="font-weight:600;color:#0f172a;text-align:right;">' + value + '</span></div>';
    }

    // ==========================================
    // 4. FULL PATIENT RECORD (tap from search/recent)
    // ==========================================
    window.openPatientRecord = async function (id) {
        try {
            var pRes = await sb.from('patients').select('*').eq('id', id).single();
            if (pRes.error || !pRes.data) throw pRes.error;
            var p = pRes.data;

            var vRes = await sb.from('vitals').select('*').eq('patient_id', id).order('recorded_at', { ascending: false }).limit(10);
            var vitals = vRes.data || [];

            var qRes = await sb.from('queue').select('*').eq('patient_id', id).order('created_at', { ascending: false }).limit(10);
            var visits = qRes.data || [];

            var html = '';

            // Mother section
            html += sectionTitle('Mother Information');
            html += row('Full Name', esc(p.mother_name));
            html += row('Phone Number', esc(p.phone_number));
            if (p.mother_age) html += row('Age', esc(p.mother_age) + ' years');
            if (p.residence) html += row('Residence', esc(p.residence));
            if (p.sha_number) html += row('SHA Number', esc(p.sha_number));
            html += row('Registered', formatDate(p.created_at));

            // Child section
            html += sectionTitle('Child Information');
            if (p.child_name) {
                html += row('Full Name', esc(p.child_name));
                html += row('Date of Birth', formatDate(p.child_dob) + (p.child_dob ? ' (' + calculateAge(p.child_dob) + ')' : ''));
                html += row('Sex', esc(p.child_sex || 'Not recorded'));
            } else {
                html += '<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:12px;border-radius:8px;font-size:13px;font-weight:600;">Antenatal registration - child not yet born or not yet recorded.</div>';
            }

            // Vitals history
            html += sectionTitle('Vitals History');
            if (vitals.length === 0) {
                html += '<p style="color:#64748b;font-size:13px;font-style:italic;margin:4px 0;">No vitals recorded yet.</p>';
            } else {
                vitals.forEach(function (v) {
                    var mi = muacInfo(v.muac_mm);
                    html += '<div style="background:#f8fafc;border-radius:10px;padding:12px;margin-bottom:8px;">' +
                        '<div style="display:flex;justify-content:space-between;font-size:12px;color:#64748b;margin-bottom:6px;">' +
                            '<span>' + formatDateTime(v.recorded_at) + '</span>' +
                            '<span style="color:' + mi.color + ';font-weight:700;">' + mi.text + '</span>' +
                        '</div>' +
                        '<div style="display:flex;gap:12px;font-size:13px;font-weight:600;color:#0f172a;">' +
                            '<span>W: ' + esc(v.weight_kg != null ? v.weight_kg : '-') + ' kg</span>' +
                            '<span>MUAC: ' + esc(v.muac_mm != null ? v.muac_mm : '-') + ' mm</span>' +
                            '<span>Temp: ' + esc(v.temperature != null ? v.temperature : '-') + ' C</span>' +
                        '</div>' +
                    '</div>';
                });
            }

            // Visit history
            html += sectionTitle('Clinic Visit History');
            if (visits.length === 0) {
                html += '<p style="color:#64748b;font-size:13px;font-style:italic;margin:4px 0;">No clinic visits recorded yet.</p>';
            } else {
                visits.forEach(function (v) {
                    html += '<div style="background:#f8fafc;border-left:3px solid #1e3a8a;border-radius:8px;padding:12px;margin-bottom:8px;">' +
                        '<div style="font-size:12px;color:#64748b;margin-bottom:4px;">' + formatDateTime(v.created_at) + '</div>' +
                        '<div style="font-size:13px;font-weight:600;color:#0f172a;">Station: ' + esc(v.current_station) + ' | Status: ' + esc(v.status) + '</div>' +
                        (v.diagnosis ? '<div style="font-size:13px;margin-top:4px;color:#0f172a;"><strong>Diagnosis:</strong> ' + esc(v.diagnosis) + '</div>' : '') +
                        (v.prescription ? '<div style="font-size:13px;margin-top:4px;color:#0f172a;"><strong>Prescription:</strong> ' + esc(v.prescription) + '</div>' : '') +
                    '</div>';
                });
            }

            showNurseModal('Patient Record - ' + esc(p.mother_name), html);
        } catch (err) {
            console.error('[Nurse Actions] Record error:', err);
            alert('Failed to open record: ' + err.message);
        }
    };

    // ==========================================
    // 5. SEARCH
    // ==========================================
    function setupSearch() {
        var input = document.getElementById('search_input');
        var timer = null;
        input.addEventListener('input', function () {
            clearTimeout(timer);
            var q = input.value.trim();
            timer = setTimeout(function () { runSearch(q); }, 300);
        });
    }

    async function runSearch(q) {
        var box = document.getElementById('search_results');
        if (q.length < 2) {
            box.innerHTML = '<p class="search-hint">Type at least 2 characters to search all registered mothers and children.</p>';
            return;
        }

        var safe = q.replace(/[,()]/g, '');
        var res = await sb.from('patients')
            .select('id, mother_name, child_name, phone_number, created_at')
            .or('mother_name.ilike.%' + safe + '%,child_name.ilike.%' + safe + '%,phone_number.ilike.%' + safe + '%')
            .order('created_at', { ascending: false })
            .limit(8);

        if (res.error) {
            box.innerHTML = '<p class="search-hint">Search failed: ' + esc(res.error.message) + '</p>';
            return;
        }
        if (!res.data || res.data.length === 0) {
            box.innerHTML = '<p class="search-hint">No matches found for "' + esc(q) + '".</p>';
            return;
        }

        box.innerHTML = res.data.map(function (p) {
            var child = p.child_name ? esc(p.child_name) : '<span style="color:#d97706;font-weight:600;">Antenatal (unborn)</span>';
            return '<div class="search-item" onclick="openPatientRecord(\'' + p.id + '\')">' +
                '<div><h4>' + esc(p.mother_name) + '</h4><p>Child: ' + child + ' &middot; ' + esc(p.phone_number) + '</p></div>' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;color:#64748b;flex-shrink:0;"><polyline points="9 18 15 12 9 6"/></svg>' +
            '</div>';
        }).join('');
    }

    // ==========================================
    // 6. STATS (system-wide mothers & babies)
    // ==========================================
    async function loadStats() {
        var today = new Date().toISOString().split('T')[0];

        var results = await Promise.all([
            sb.from('patients').select('*', { count: 'exact', head: true }),
            sb.from('patients').select('*', { count: 'exact', head: true }).not('child_name', 'is', null),
            sb.from('patients').select('*', { count: 'exact', head: true }).gte('created_at', today + 'T00:00:00'),
            sb.from('queue').select('*', { count: 'exact', head: true }).eq('current_station', 'Doctor').eq('status', 'Waiting'),
            sb.from('queue').select('*', { count: 'exact', head: true }).eq('status', 'Completed').gte('created_at', today + 'T00:00:00')
        ]);

        document.getElementById('stat_mothers').textContent = results[0].count || 0;
        document.getElementById('stat_babies').textContent = results[1].count || 0;
        document.getElementById('stat_registered').textContent = results[2].count || 0;
        document.getElementById('stat_awaiting').textContent = results[3].count || 0;
        document.getElementById('stat_completed').textContent = results[4].count || 0;
    }

    // ==========================================
    // 7. RECENT PATIENTS (tappable)
    // ==========================================
    async function loadRecent() {
        var res = await sb.from('patients')
            .select('id, mother_name, child_name, phone_number, created_at')
            .order('created_at', { ascending: false })
            .limit(6);

        var list = document.getElementById('recent_list');
        if (res.error || !res.data || res.data.length === 0) {
            list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 40px; font-style: italic;">No patients registered yet</p>';
            return;
        }

        list.innerHTML = res.data.map(function (p) {
            var child = p.child_name ? esc(p.child_name) : '<span style="color:#d97706;font-weight:600;">Antenatal (unborn)</span>';
            return '<div class="patient-item" style="cursor:pointer;" onclick="openPatientRecord(\'' + p.id + '\')">' +
                '<div class="patient-info">' +
                    '<h4>' + esc(p.mother_name) + '</h4>' +
                    '<p>Child: ' + child + ' &middot; ' + esc(p.phone_number) + '</p>' +
                '</div>' +
                '<div class="patient-meta">' +
                    '<div>' + formatDate(p.created_at) + '</div>' +
                    '<small>Tap to view full record</small>' +
                '</div>' +
            '</div>';
        }).join('');
    }

    // ==========================================
    // 8. REGISTRATION FORM
    // ==========================================
    function setupForm() {
        document.getElementById('nurse_form').addEventListener('submit', async function (e) {
            e.preventDefault();
            console.log('[Nurse] Form submitted');

            var btn = document.getElementById('submit_btn');
            var originalContent = btn.innerHTML;
            btn.innerHTML = '<span style="display: flex; align-items: center; justify-content: center; gap: 10px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px; animation: spin 1s linear infinite;"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"/></svg> Processing...</span>';
            btn.disabled = true;

            try {
                var childName = document.getElementById('child_name').value.trim();
                var childDob = document.getElementById('child_dob').value;
                var weight = document.getElementById('weight_kg').value;
                var muac = document.getElementById('muac_mm').value;
                var temp = document.getElementById('temperature').value;

                var pRes = await sb.from('patients').insert({
                    mother_name: document.getElementById('mother_name').value,
                    phone_number: document.getElementById('phone_number').value,
                    child_name: childName === '' ? null : childName,
                    child_dob: childDob === '' ? null : childDob,
                    created_at: new Date().toISOString()
                }).select().single();

                if (pRes.error) throw pRes.error;

                // Vitals only when weight is provided (antenatal visits skip vitals)
                if (weight !== '') {
                    await sb.from('vitals').insert({
                        patient_id: pRes.data.id,
                        weight_kg: parseFloat(weight),
                        muac_mm: muac === '' ? null : parseInt(muac, 10),
                        temperature: temp === '' ? null : parseFloat(temp),
                        recorded_at: new Date().toISOString()
                    });
                }

                await sb.from('queue').insert({
                    patient_id: pRes.data.id,
                    current_station: 'Doctor',
                    status: 'Waiting',
                    created_at: new Date().toISOString()
                });

                btn.innerHTML = '<span style="display: flex; align-items: center; justify-content: center; gap: 10px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 20px; height: 20px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg> Success!</span>';
                btn.style.background = 'linear-gradient(135deg, #16a34a, #22c55e)';

                setTimeout(function () {
                    alert('Patient registered successfully and sent to doctor\'s queue!');
                    document.getElementById('nurse_form').reset();
                    resetNutritionBox();
                    btn.innerHTML = originalContent;
                    btn.style.background = '';
                    btn.disabled = false;
                    loadStats();
                    loadRecent();
                }, 500);

            } catch (error) {
                console.error('[Nurse] Save error:', error);
                alert('Error: ' + error.message);
                btn.innerHTML = originalContent;
                btn.disabled = false;
            }
        });
    }

    // ==========================================
    // 9. MUAC CHECKER
    // ==========================================
    function resetNutritionBox() {
        var box = document.getElementById('nutrition_status');
        box.className = 'status-box neutral';
        box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg><span>Enter MUAC to check nutritional status</span>';
    }

    window.checkNutrition = function (muac) {
        var box = document.getElementById('nutrition_status');
        var val = parseInt(muac, 10);

        if (isNaN(val)) {
            resetNutritionBox();
        } else if (val < 115) {
            box.className = 'status-box danger';
            box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>SEVERE MALNUTRITION (RED) - Immediate Attention Required!</span>';
        } else if (val < 125) {
            box.className = 'status-box warning';
            box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><span>MODERATE MALNUTRITION (YELLOW) - Monitor Closely</span>';
        } else {
            box.className = 'status-box success';
            box.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg><span>HEALTHY (GREEN) - Normal Nutrition Status</span>';
        }
    };

    // ==========================================
    // 10. NETWORK + LOGOUT
    // ==========================================
    function updateNetwork() {
        var badge = document.getElementById('network_status');
        var text = document.getElementById('network_text');
        if (navigator.onLine) {
            text.textContent = 'ONLINE';
            badge.className = 'network-badge online';
        } else {
            text.textContent = 'OFFLINE';
            badge.className = 'network-badge offline';
        }
    }

    window.handleLogout = async function () {
        console.log('[Nurse] Logout initiated');
        await sb.auth.signOut();
        window.location.href = 'login.html';
    };

    // ==========================================
    // 11. INIT
    // ==========================================
    async function initNurse() {
        try {
            var sess = await sb.auth.getSession();
            if (!sess.data.session) {
                console.log('[Nurse] No session, redirecting to login');
                window.location.href = 'login.html';
                return;
            }

            var prof = await sb.from('profiles').select('full_name, role').eq('id', sess.data.session.user.id).single();
            if (!prof.data || (prof.data.role !== 'nurse' && prof.data.role !== 'admin')) {
                console.log('[Nurse] Unauthorized, redirecting');
                window.location.href = 'login.html';
                return;
            }

            console.log('[Nurse] Authorized user:', prof.data.full_name);
            document.getElementById('user_info').textContent = 'Nurse: ' + prof.data.full_name;
            document.getElementById('loading_message').style.display = 'none';
            document.getElementById('nurse_content').style.display = 'block';

            loadStats();
            loadRecent();
            setupForm();
            setupSearch();
            updateNetwork();

        } catch (error) {
            console.error('[Nurse] Init error:', error);
            document.getElementById('loading_message').innerHTML = '<p style="color: var(--danger); font-size: 16px; font-weight: 600;">Error loading portal. Please refresh the page.</p>';
        }
    }

    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);

    // Spin animation for loading button
    var spinStyle = document.createElement('style');
    spinStyle.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(spinStyle);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNurse);
    } else {
        initNurse();
    }
})();
