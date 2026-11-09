/**
 * MNH RCH - Patient Actions & Dashboard Logic (v12)
 * Mother portal: identity, child profile, full growth history (with visual charts),
 * visits, immunization schedule, appointments, and the mother's
 * own ANC contacts per Tanzania National ANC Guidelines 2018.
 * Includes clinical safety guards for GA calculation and impossible dates.
 * Wrapped in IIFE to prevent duplicate-declaration crashes.
 */
(function () {
    'use strict';

    if (window.__MNH_PATIENT_ACTIONS_LOADED__) {
        console.warn('[Patient Actions] Already loaded, skipping duplicate.');
        return;
    }
    window.__MNH_PATIENT_ACTIONS_LOADED__ = true;

    console.log('[Patient Actions] Script loaded');

    // ==========================================
    // 1. CONFIGURATION
    // ==========================================
    var SUPABASE_URL = 'https://fmaaudmdgmgklvqcmvad.supabase.co';
    var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E';
    var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    var currentPatient = null;
    var currentVitals = null;
    var currentVitalsAll = [];
    var currentVisits = [];
    var currentANC = null;
    var currentANCContacts = [];

    var CHIP = 'display:inline-block;padding:4px 10px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:100px;font-size:11px;font-weight:700;margin:0 6px 6px 0;';

    // 8 contacts + 41-week return (Table 2 of the guideline)
    var ANC_CONTACTS = [
        { n: 1, w: 12, label: '1st contact (booking)' },
        { n: 2, w: 20, label: '2nd contact' },
        { n: 3, w: 26, label: '3rd contact' },
        { n: 4, w: 30, label: '4th contact' },
        { n: 5, w: 34, label: '5th contact' },
        { n: 6, w: 36, label: '6th contact' },
        { n: 7, w: 38, label: '7th contact' },
        { n: 8, w: 40, label: '8th contact' },
        { n: 9, w: 41, label: 'Return for delivery' }
    ];

    // ==========================================
    // 2. HELPERS
    // ==========================================
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function startToday() {
        var d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function addDays(dateLike, days) {
        var d = new Date(dateLike);
        d.setDate(d.getDate() + days);
        return d;
    }

    function gaWeeks(lmp, onDate) {
        return Math.floor((new Date(onDate) - new Date(lmp)) / (7 * 86400000));
    }

    // NEW: Clinical precision helpers
    function gaParts(lmp, onDate) {
        var total = Math.floor((new Date(onDate) - new Date(lmp)) / 86400000);
        if (total < 0) return { negative: true, weeks: 0, days: 0, total: total };
        return { negative: false, weeks: Math.floor(total / 7), days: total % 7, total: total };
    }

    function gaLabel(lmp, onDate) {
        var g = gaParts(lmp, onDate);
        if (g.negative) return 'Invalid (date before LMP)';
        return g.weeks + ' weeks, ' + g.days + ' day' + (g.days !== 1 ? 's' : '');
    }

    function calculateAge(dobString) {
        if (!dobString) return 'Not recorded';
        var dob = new Date(dobString);
        var today = new Date();
        var months = (today.getFullYear() - dob.getFullYear()) * 12;
        months -= dob.getMonth();
        months += today.getMonth();
        if (months < 1) {
            var days = Math.floor((today - dob) / 86400000);
            return days + ' day' + (days !== 1 ? 's' : '');
        }
        if (months < 12) return months + ' month' + (months > 1 ? 's' : '');
        var years = Math.floor(months / 12);
        var rem = months % 12;
        return rem > 0 ? years + ' year' + (years > 1 ? 's' : '') + ', ' + rem + ' mo' : years + ' year' + (years > 1 ? 's' : '');
    }

    function calculateAgeAtDate(dobString, targetDateString) {
        if (!dobString) return '-';
        var dob = new Date(dobString);
        var target = new Date(targetDateString);
        var months = (target.getFullYear() - dob.getFullYear()) * 12;
        months -= dob.getMonth();
        months += target.getMonth();
        if (months < 0) return 'Unborn';
        if (months < 1) {
            var days = Math.floor((target - dob) / 86400000);
            return days + ' day' + (days !== 1 ? 's' : '');
        }
        if (months < 12) return months + ' mo';
        var years = Math.floor(months / 12);
        var rem = months % 12;
        return rem > 0 ? years + 'y ' + rem + 'm' : years + 'y';
    }

    function evaluateMUAC(muac) {
        if (!muac) return { status: 'Pending Assessment', cls: 'warning', color: '#d97706', icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>' };
        var val = parseFloat(muac);
        if (val < 115) return { status: 'Severe Risk', cls: 'warning', color: '#ef4444', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' };
        if (val < 125) return { status: 'Moderate Risk', cls: 'warning', color: '#d97706', icon: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>' };
        return { status: 'Normal', cls: 'success', color: '#16a34a', icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' };
    }

    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function formatShortDate(dateString) {
        if (!dateString) return '';
        var d = new Date(dateString);
        return d.getDate() + '/' + (d.getMonth() + 1);
    }

    function statCard(label, value, color) {
        return '<div style="background:#f8fafc;padding:12px;border-radius:8px;text-align:center;flex:1;min-width:90px;">' +
            '<div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">' + label + '</div>' +
            '<div style="font-size:17px;font-weight:700;color:' + (color || '#0f172a') + ';margin-top:4px;">' + value + '</div></div>';
    }
    
    function sectionTitle(t) {
        return '<div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:16px 0 8px;padding-bottom:6px;border-bottom:1px solid #e2e8f0;">' + t + '</div>';
    }

    // ==========================================
    // 3. MODAL SYSTEM
    // ==========================================
    function showModal(title, contentHTML) {
        var existingModal = document.getElementById('dynamic_modal');
        if (existingModal) existingModal.remove();

        if (!document.getElementById('modal-anim-style')) {
            var style = document.createElement('style');
            style.id = 'modal-anim-style';
            style.textContent = '@keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }';
            document.head.appendChild(style);
        }

        var modalHTML = '<div id="dynamic_modal" onclick="if(event.target===this)closeModal()" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; overflow-y: auto;">' +
            '<div style="background: white; border-radius: 16px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.2); animation: slideUp 0.3s ease-out;">' +
            '<div style="padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background: white; border-radius: 16px 16px 0 0; z-index: 10;">' +
            '<h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #0f172a;">' + title + '</h3>' +
            '<button onclick="closeModal()" style="background: none; border: none; cursor: pointer; color: #64748b; padding: 4px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
            '</div>' +
            '<div style="padding: 24px; color: #334155; line-height: 1.6;">' + contentHTML + '</div>' +
            '<div style="padding: 16px 24px; border-top: 1px solid #e2e8f0; text-align: right;"><button onclick="closeModal()" style="background: #1e3a8a; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer;">Close</button></div>' +
            '</div></div>';

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    function closeModal() {
        var modal = document.getElementById('dynamic_modal');
        if (modal) modal.remove();
    }
    window.closeModal = closeModal;

    // ==========================================
    // 4. ANC SCHEDULE ENGINE
    // ==========================================
    function buildAncSchedule(enr, contacts) {
        var t = startToday();
        return ANC_CONTACTS.map(function (c) {
            var due = addDays(enr.lmp_date, c.w * 7);
            var row = (contacts || []).filter(function (k) { return k.contact_number === c.n; })[0];
            var status = row ? 'done' : (t > addDays(due, 7) ? 'overdue' : (t >= due ? 'due' : 'upcoming'));
            return { n: c.n, w: c.w, label: c.label, due: due, status: status, row: row };
        });
    }

    function renderAncDetail(v) {
        function r(l, val) {
            return '<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:12px;"><span style="color:#64748b;">' + l + '</span><span style="font-weight:600;color:#0f172a;text-align:right;">' + esc(val) + '</span></div>';
        }
        var h = '<div style="margin-top:8px;background:white;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">';
        h += r('Visit date', formatDate(v.visit_date));
        
        // PATCH 8: Recompute GA from LMP and visit date to override bad stored data
        if (currentANC) h += r('Gestational age at this visit', gaLabel(currentANC.lmp_date, v.visit_date));
        
        if (v.bp_systolic && v.bp_diastolic) h += r('Blood pressure', v.bp_systolic + '/' + v.bp_diastolic + ' mmHg');
        if (v.weight_kg != null) h += r('Weight', v.weight_kg + ' kg');
        if (v.sfh_cm != null) h += r('Fundal height (SFH)', v.sfh_cm + ' cm');
        if (v.foetal_heart_rate != null) h += r('Foetal heart rate', v.foetal_heart_rate + ' bpm');
        if (v.lie) h += r('Lie', v.lie);
        if (v.presentation) h += r('Presentation', v.presentation);
        if (v.hb != null) h += r('Haemoglobin', v.hb + ' g/dL');
        if (v.urine_glucose) h += r('Urine glucose', v.urine_glucose);
        if (v.urine_albumin) h += r('Urine albumin', v.urine_albumin);
        var tests = [];
        if (v.msu_sent) tests.push('MSU / gram stain');
        if (v.hiv_test_done) tests.push('HIV test' + (v.hiv_result ? ' (' + v.hiv_result + ')' : ''));
        if (v.mrdt_done) tests.push('mRDT' + (v.mrdt_result ? ' (' + v.mrdt_result + ')' : ''));
        if (v.tb_screened) tests.push('TB screen');
        if (v.ultrasound_done) tests.push('Ultrasound');
        if (tests.length) h += r('Tests done', tests.join(', '));
        var meds = [];
        if (v.tt_dose) meds.push(v.tt_dose);
        if (v.iptp_sp_dose > 0) meds.push('IPTp-SP dose ' + v.iptp_sp_dose);
        if (v.mebendazole_given) meds.push('Mebendazole');
        if (v.ifa_months > 0) meds.push('Iron-folic acid (' + v.ifa_months + ' month supply)');
        if (v.llin_given) meds.push('LLIN');
        if (meds.length) h += r('Preventive treatments', meds.join(', '));
        if (v.counselling) h += r('Counselling received', v.counselling);
        if (v.danger_signs) h += r('Danger signs', v.danger_signs_note || 'Yes - managed / referred');
        if (v.next_appointment) h += r('Next appointment', formatDate(v.next_appointment));
        if (v.recorded_by) h += r('Recorded by', v.recorded_by);
        if (v.notes) h += r('Summary from clinic', v.notes);
        h += '</div>';
        return h;
    }

    window.toggleAncDetail = function (n) {
        var d = document.getElementById('anc_detail_' + n);
        if (d) d.style.display = (d.style.display === 'none') ? 'block' : 'none';
    };

    // ==========================================
    // 5. DASHBOARD LOADER
    // ==========================================
    async function loadMotherDashboard() {
        var phone = localStorage.getItem('mnh_user_phone');
        var name = localStorage.getItem('mnh_user_name');

        if (!phone) {
            console.warn('[Patient Actions] No user phone found. Redirecting.');
            window.location.href = 'register.html';
            return;
        }

        if (name) document.getElementById('user_name').textContent = name;
        document.getElementById('user_phone').textContent = phone;

        try {
            var res = await supabase.from('patients').select('*').eq('phone_number', phone).order('created_at', { ascending: false }).limit(1);
            if (res.error || !res.data || res.data.length === 0) {
                document.getElementById('child_name').textContent = 'No record found';
                return;
            }
            currentPatient = res.data[0];

            // Identity source of truth is the database row, never localStorage
            var trueName = currentPatient.mother_name || name || 'Mother';
            var truePhone = currentPatient.phone_number || phone;
            document.getElementById('user_name').textContent = trueName;
            document.getElementById('user_phone').textContent = truePhone;
            try {
                localStorage.setItem('mnh_user_name', trueName);
                localStorage.setItem('mnh_user_phone', truePhone);
            } catch (e) {}
            var sideName = document.querySelector('.sidebar-user-name');
            var sidePhone = document.querySelector('.sidebar-user-phone');
            if (sideName) sideName.textContent = trueName;
            if (sidePhone) sidePhone.textContent = truePhone;

            // Child profile
            document.getElementById('child_name').textContent = currentPatient.child_name || 'Unborn / Not Recorded';
            var age = calculateAge(currentPatient.child_dob);
            var dobF = currentPatient.child_dob ? formatDate(currentPatient.child_dob) : 'Not recorded';
            document.getElementById('child_dob').textContent = currentPatient.child_dob ? dobF + ' (' + age + ')' : 'Not recorded';
            document.getElementById('child_sex').textContent = currentPatient.child_sex || 'Not recorded';

            // Full vitals history (newest first, up to 100 records for full growth chart)
            var vRes = await supabase.from('vitals')
                .select('muac_mm, weight_kg, temperature, recorded_at')
                .eq('patient_id', currentPatient.id)
                .order('recorded_at', { ascending: false })
                .limit(100);
            currentVitalsAll = vRes.data || [];
            currentVitals = currentVitalsAll[0] || null;

            var badge = document.getElementById('nutrition_status');
            if (currentVitals) {
                var ev = evaluateMUAC(currentVitals.muac_mm);
                badge.className = 'status-badge ' + ev.cls;
                badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 12px; height: 12px;">' + ev.icon + '</svg>' + ev.status;
            } else {
                badge.className = 'status-badge warning';
                badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 12px; height: 12px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>Pending Assessment';
            }

            // Visit history
            var qRes = await supabase.from('queue')
                .select('id, status, current_station, created_at, diagnosis, prescription')
                .eq('patient_id', currentPatient.id)
                .order('created_at', { ascending: false })
                .limit(10); // Increased limit to ensure we catch recent prescriptions
            currentVisits = qRes.data || [];
            renderActivityList(currentVisits);

            // ANC enrollment + contacts (read-only for the mother)
            try {
                var aRes = await supabase.from('anc_enrollments').select('*').eq('patient_id', currentPatient.id).eq('status', 'active').order('enrolled_at', { ascending: false }).limit(1);
                currentANC = (aRes.data && aRes.data[0]) || null;
                currentANCContacts = [];
                if (currentANC) {
                    var cRes = await supabase.from('anc_contacts').select('*').eq('anc_id', currentANC.id).order('visit_date', { ascending: true });
                    currentANCContacts = cRes.data || [];
                }
            } catch (e) {
                console.warn('[Patient Actions] ANC fetch skipped:', e);
                currentANC = null;
            }

            updateAlertBanner();

        } catch (error) {
            console.error('[Patient Actions] Load error:', error);
        }
    }

    function updateAlertBanner() {
        var titleEl = document.getElementById('alert_title_text');
        var el = document.getElementById('next_vaccine_text');

        if (currentANC) {
            // PATCH 6: Guard against impossible dates
            var gNow = gaParts(currentANC.lmp_date, new Date());
            if (gNow.negative || gNow.weeks > 44) {
                if (titleEl) titleEl.textContent = 'Record Check Needed';
                el.textContent = 'Your pregnancy dates need verification. Please visit the ANC desk so the nurse can correct your record.';
                return;
            }

            var sched = buildAncSchedule(currentANC, currentANCContacts);
            var next = sched.filter(function (s) { return s.status !== 'done' && s.n <= 8; })[0];
            if (!next) {
                if (titleEl) titleEl.textContent = 'ANC Complete';
                el.textContent = 'All eight antenatal contacts completed. Watch for labour signs and go to the facility when they start.';
                return;
            }
            if (titleEl) titleEl.textContent = 'Next ANC Contact';
            var days = Math.round((next.due - startToday()) / 86400000);
            if (next.status === 'overdue') {
                el.textContent = 'Contact ' + next.n + ' (week ' + next.w + ') is overdue since ' + formatDate(next.due) + '. Please visit the ANC clinic as soon as possible.';
            } else if (days === 0) {
                el.textContent = 'Contact ' + next.n + ' (week ' + next.w + ') is due today. Visit the ANC clinic.';
            } else {
                el.textContent = 'Contact ' + next.n + ' (week ' + next.w + ') on ' + formatDate(next.due) + ' - in ' + days + ' day' + (days !== 1 ? 's' : '') + '.';
            }
            return;
        }

        if (titleEl) titleEl.textContent = 'Next Vaccination Due';
        if (!currentPatient || !currentPatient.child_dob) {
            el.textContent = 'Register your newborn to see the vaccination schedule';
            return;
        }
        var dob = new Date(currentPatient.child_dob);
        var ageDays = Math.floor((new Date() - dob) / 86400000);
        if (ageDays < 0) { el.textContent = 'BCG & OPV0 - At birth'; return; }
        if (ageDays < 42) el.textContent = 'Pentavalent 1 due in ' + (42 - ageDays) + ' days (at 6 weeks)';
        else if (ageDays < 70) el.textContent = 'Pentavalent 2 due in ' + (70 - ageDays) + ' days (at 10 weeks)';
        else if (ageDays < 98) el.textContent = 'Pentavalent 3 due in ' + (98 - ageDays) + ' days (at 14 weeks)';
        else el.textContent = 'Measles vaccine due at 9 months';
    }

    // ==========================================
    // 6. UI RENDERING
    // ==========================================
    function renderActivityList(visits) {
        var listContainer = document.getElementById('activity_list');
        if (!visits || visits.length === 0) {
            listContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">No clinical visits recorded yet.</div>';
            return;
        }
        listContainer.innerHTML = visits.map(function (visit) {
            var date = new Date(visit.created_at);
            var day = String(date.getDate()).padStart(2, '0');
            var month = date.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
            var title = visit.diagnosis ? 'Consultation' : 'Clinic Visit';
            var details = visit.diagnosis ? ('Diagnosis: ' + visit.diagnosis) : ('Station: ' + (visit.current_station || 'General') + ' | Status: ' + visit.status);
            return '<div class="activity-item"><div class="activity-date"><div class="activity-day">' + day + '</div><div class="activity-month">' + month + '</div></div><div class="activity-details" style="flex: 1;"><h4>' + title + '</h4><p>' + details + '</p></div></div>';
        }).join('');
    }

    function immunizationRowsHtml() {
        if (!currentPatient || !currentPatient.child_dob) {
            return '<div style="text-align:center;padding:16px;color:#64748b;font-size:13px;">Your child has not been registered yet, so the immunization schedule is not active.</div>';
        }
        var dob = new Date(currentPatient.child_dob);
        var ageDays = Math.floor((new Date() - dob) / 86400000);
        function st(due) {
            if (ageDays >= due) return '<span style="color: #16a34a; font-weight: 600;">Completed</span>';
            var r = due - ageDays;
            return '<span style="color: #d97706; font-weight: 600;">Due in ' + r + ' day' + (r !== 1 ? 's' : '') + '</span>';
        }
        return [['BCG', 0], ['OPV 0', 0], ['Pentavalent 1', 42], ['Pentavalent 2', 70], ['Pentavalent 3', 98], ['Measles', 270]].map(function (r) {
            return '<li style="padding: 10px 0; display: flex; justify-content: space-between; border-bottom: 1px dashed #e2e8f0; list-style: none;"><span>' + r[0] + '</span>' + st(r[1]) + '</li>';
        }).join('');
    }

    // ==========================================
    // 7. QUICK ACTIONS
    // ==========================================
    window.viewImmunizationCard = function () {
        if (!currentPatient) return;
        var content = '<p><strong>Child:</strong> ' + esc(currentPatient.child_name || 'Newborn') + '</p>' +
            '<p><strong>Age:</strong> ' + calculateAge(currentPatient.child_dob) + '</p>' +
            '<hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;">' +
            '<ul style="list-style: none; padding: 0; margin: 0;">' + immunizationRowsHtml() + '</ul>' +
            '<p style="margin-top: 16px; font-size: 13px; color: #64748b;">Digital Kadi ya Kliniki. Bring this to every clinic visit.</p>';
        showModal('Immunization Card', content);
    };

    window.viewAppointments = function () {
        if (!currentPatient) return;
        var html = '';

        if (currentANC) {
            html += sectionTitle('Mother: antenatal appointments');
            var sched = buildAncSchedule(currentANC, currentANCContacts);
            var next = sched.filter(function (s) { return s.status !== 'done' && s.n <= 8; })[0];
            if (next) {
                html += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;margin-bottom:8px;">' +
                    '<div style="font-weight:700;color:#1e3a8a;">ANC contact ' + next.n + ' (week ' + next.w + ')</div>' +
                    '<div style="font-size:13px;margin-top:2px;color:#334155;">Due: ' + formatDate(next.due) +
                    (next.status === 'overdue' ? ' - <strong style="color:#ef4444;">OVERDUE, please visit the clinic</strong>' : '') + '</div></div>';
            } else {
                html += '<div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:14px;margin-bottom:8px;color:#166534;font-weight:600;">All eight ANC contacts completed. Return at 41 weeks if not yet delivered.</div>';
            }
            html += '<div style="font-size:13px;color:#64748b;margin-bottom:6px;">Expected date of delivery: <strong style="color:#0f172a;">' + formatDate(currentANC.edd) + '</strong></div>';
        }

        html += sectionTitle('Child: vaccination appointments');
        if (!currentPatient.child_dob) {
            html += '<div style="text-align:center;padding:14px;color:#64748b;font-size:13px;">Register your newborn to activate the vaccination schedule.</div>';
        } else {
            var dob = new Date(currentPatient.child_dob);
            var ageDays = Math.floor((new Date() - dob) / 86400000);
            var nextV = null;
            if (ageDays < 42) nextV = { name: 'Pentavalent 1 & OPV 1', due: 42 };
            else if (ageDays < 70) nextV = { name: 'Pentavalent 2 & OPV 2', due: 70 };
            else if (ageDays < 98) nextV = { name: 'Pentavalent 3 & OPV 3', due: 98 };
            else if (ageDays < 270) nextV = { name: 'Measles Vaccine', due: 270 };
            if (nextV) {
                var nextDate = new Date(dob.getTime() + nextV.due * 86400000);
                var rem = nextV.due - ageDays;
                html += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:14px;">' +
                    '<div style="font-weight:700;color:#1e3a8a;">' + nextV.name + '</div>' +
                    '<div style="font-size:13px;margin-top:2px;color:#334155;">Date: ' + formatDate(nextDate.toISOString()) + '</div>' +
                    '<div style="font-size:13px;color:#d97706;font-weight:600;margin-top:2px;">Due in ' + rem + ' day' + (rem !== 1 ? 's' : '') + '</div></div>';
            } else {
                html += '<div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:14px;color:#166534;font-weight:600;">All scheduled vaccinations completed.</div>';
            }
        }

        showModal('Appointments', html);
    };

    // COMPREHENSIVE GROWTH CHART: mother pregnancy progress + child growth
    window.viewGrowthChart = function () {
        if (!currentPatient) return;

        var hasChildVitals = currentVitalsAll && currentVitalsAll.length > 0;
        var hasAncContacts = currentANC && currentANCContacts && currentANCContacts.length > 0;

        if (!hasChildVitals && !hasAncContacts) {
            showModal('Growth Chart',
                '<div style="text-align: center; padding: 20px; color: #64748b;">' +
                '<p>No measurements recorded yet.</p>' +
                '<p style="font-size: 13px;">Child weight, MUAC and temperature appear here after clinic visits. For pregnant mothers, weight, blood pressure, fundal height and baby heartbeat appear after each ANC contact.</p>' +
                '</div>');
            return;
        }

        var html = '';

        // ---------- SECTION A: MOTHER PREGNANCY PROGRESS ----------
        if (hasAncContacts) {
            var contacts = currentANCContacts;
            var latestC = contacts[contacts.length - 1];
            var gaText = gaLabel(currentANC.lmp_date, new Date()); // UPDATED to use precise label
            var bpHigh = latestC.bp_systolic != null && latestC.bp_diastolic != null && (latestC.bp_systolic > 140 || latestC.bp_diastolic > 90);

            html += sectionTitle('Mother: pregnancy progress (' + contacts.length + ' contact' + (contacts.length !== 1 ? 's' : '') + ' recorded)');
            html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">' +
                statCard('GA today', gaText) +
                statCard('Latest weight', (latestC.weight_kg != null ? latestC.weight_kg + ' kg' : '-')) +
                statCard('Latest BP', (latestC.bp_systolic && latestC.bp_diastolic ? latestC.bp_systolic + '/' + latestC.bp_diastolic : '-'), bpHigh ? '#ef4444' : '#0f172a') +
                statCard('Baby heartbeat', (latestC.foetal_heart_rate != null ? latestC.foetal_heart_rate + ' bpm' : '-')) +
                '</div>';

            // Maternal weight trend bars
            var cw = contacts.filter(function (c) { return c.weight_kg != null; });
            if (cw.length > 0) {
                var maxCW = 0;
                cw.forEach(function (c) { if (c.weight_kg > maxCW) maxCW = c.weight_kg; });
                html += '<div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:6px;">Maternal weight trend</div>';
                var prevW = null;
                html += cw.map(function (c) {
                    var d = '';
                    if (prevW != null) {
                        var diff = Math.round((c.weight_kg - prevW) * 100) / 100;
                        d = diff >= 0 ? ' (+' + diff + ' kg)' : ' (' + diff + ' kg)';
                    }
                    prevW = c.weight_kg;
                    var pct = maxCW > 0 ? Math.max(6, Math.round((c.weight_kg / maxCW) * 100)) : 6;
                    return '<div style="margin-bottom:8px;">' +
                        '<div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:3px;">' +
                        '<span>Contact ' + c.contact_number + ' &middot; ' + formatDate(c.visit_date) + (c.ga_weeks != null ? ' (' + c.ga_weeks + ' wks)' : '') + '</span>' +
                        '<span style="font-weight:700;color:#0f172a;">' + c.weight_kg + ' kg' + d + '</span></div>' +
                        '<div style="background:#e2e8f0;border-radius:100px;height:8px;overflow:hidden;"><div style="background:linear-gradient(90deg,#16a34a,#22c55e);height:100%;width:' + pct + '%;border-radius:100px;"></div></div></div>';
                }).join('');
            }

            // BP, SFH, foetal heart table
            html += '<div style="overflow-x:auto;margin-top:10px;border:1px solid #e2e8f0;border-radius:8px;">' +
                '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:420px;">' +
                '<thead style="background:#f1f5f9;"><tr style="color:#475569;text-align:left;">' +
                '<th style="padding:8px;border-bottom:2px solid #e2e8f0;">Contact</th>' +
                '<th style="padding:8px;border-bottom:2px solid #e2e8f0;">Date</th>' +
                '<th style="padding:8px;border-bottom:2px solid #e2e8f0;">BP</th>' +
                '<th style="padding:8px;border-bottom:2px solid #e2e8f0;">SFH</th>' +
                '<th style="padding:8px;border-bottom:2px solid #e2e8f0;">Foetal HR</th>' +
                '</tr></thead><tbody>' +
                contacts.slice().reverse().map(function (c) {
                    var high = c.bp_systolic != null && c.bp_diastolic != null && (c.bp_systolic > 140 || c.bp_diastolic > 90);
                    return '<tr style="border-bottom:1px solid #e2e8f0;background:#fff;">' +
                        '<td style="padding:8px;font-weight:600;">' + c.contact_number + '</td>' +
                        '<td style="padding:8px;">' + formatDate(c.visit_date) + '</td>' +
                        '<td style="padding:8px;color:' + (high ? '#ef4444' : '#0f172a') + ';font-weight:' + (high ? '700' : '400') + ';">' + (c.bp_systolic && c.bp_diastolic ? c.bp_systolic + '/' + c.bp_diastolic : '-') + '</td>' +
                        '<td style="padding:8px;">' + (c.sfh_cm != null ? c.sfh_cm + ' cm' : '-') + '</td>' +
                        '<td style="padding:8px;">' + (c.foetal_heart_rate != null ? c.foetal_heart_rate + ' bpm' : '-') + '</td>' +
                        '</tr>';
                }).join('') +
                '</tbody></table></div>' +
                '<p style="margin-top:8px;font-size:11px;color:#64748b;">A red BP reading means above 140/90 - report to the clinic immediately.</p>';
        }

        // ---------- SECTION B: CHILD GROWTH ----------
        if (hasChildVitals) {
            var chrono = currentVitalsAll.slice().reverse();
            var latest = currentVitalsAll[0];
            var muacEval = evaluateMUAC(latest.muac_mm);

            var firstWeight = null, latestWeight = null;
            for (var i = 0; i < chrono.length; i++) { if (chrono[i].weight_kg != null) { firstWeight = chrono[i].weight_kg; break; } }
            for (var j = currentVitalsAll.length - 1; j >= 0; j--) { if (currentVitalsAll[j].weight_kg != null) { latestWeight = currentVitalsAll[j].weight_kg; break; } }
            var weightGain = (firstWeight != null && latestWeight != null) ? (latestWeight - firstWeight).toFixed(2) : null;

            html += sectionTitle('Child: growth monitoring (' + currentVitalsAll.length + ' record' + (currentVitalsAll.length !== 1 ? 's' : '') + ')');
            html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">' +
                statCard('Latest weight', (latest.weight_kg != null ? latest.weight_kg + ' kg' : '-')) +
                statCard('Total gain', (weightGain != null ? (weightGain > 0 ? '+' : '') + weightGain + ' kg' : '-'), weightGain > 0 ? '#16a34a' : '#0f172a') +
                statCard('Latest MUAC', (latest.muac_mm != null ? latest.muac_mm + ' mm' : '-'), muacEval.color) +
                statCard('Latest temp', (latest.temperature != null ? latest.temperature + ' C' : '-')) +
                '</div>';

            var weights = chrono.filter(function (v) { return v.weight_kg != null; });
            if (weights.length > 0) {
                var svgW = 500, svgH = 220, padL = 40, padR = 10, padT = 20, padB = 40;
                var chartW = svgW - padL - padR, chartH = svgH - padT - padB;
                var minW = Math.min.apply(null, weights.map(function (v) { return v.weight_kg; }));
                var maxW = Math.max.apply(null, weights.map(function (v) { return v.weight_kg; }));
                if (minW === maxW) { minW -= 1; maxW += 1; }
                var rangeW = maxW - minW;
                var points = [], labels = [];
                weights.forEach(function (v, idx) {
                    var x = padL + (weights.length === 1 ? chartW / 2 : (idx / (weights.length - 1)) * chartW);
                    var y = padT + chartH - ((v.weight_kg - minW) / rangeW) * chartH;
                    points.push(x + ',' + y);
                    labels.push('<text x="' + x + '" y="' + (svgH - 5) + '" font-size="10" fill="#64748b" text-anchor="middle">' + formatShortDate(v.recorded_at) + '</text>');
                    labels.push('<text x="' + x + '" y="' + (y - 8) + '" font-size="11" font-weight="bold" fill="#1e3a8a" text-anchor="middle">' + v.weight_kg + '</text>');
                });
                var svg = '<svg viewBox="0 0 ' + svgW + ' ' + svgH + '" style="width:100%;height:auto;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:12px;">';
                for (var g = 0; g <= 4; g++) {
                    var gy = padT + (g / 4) * chartH;
                    var gval = (maxW - (g / 4) * rangeW).toFixed(1);
                    svg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (svgW - padR) + '" y2="' + gy + '" stroke="#e2e8f0" stroke-width="1" />';
                    svg += '<text x="' + (padL - 5) + '" y="' + (gy + 4) + '" font-size="10" fill="#64748b" text-anchor="end">' + gval + 'kg</text>';
                }
                if (points.length > 1) svg += '<polyline points="' + points.join(' ') + '" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linejoin="round" />';
                points.forEach(function (p) {
                    var co = p.split(',');
                    svg += '<circle cx="' + co[0] + '" cy="' + co[1] + '" r="4.5" fill="#1e3a8a" stroke="#fff" stroke-width="1.5" />';
                });
                svg += labels.join('') + '</svg>';
                html += svg;
            }

            html += '<div style="overflow-x:auto;max-height:260px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:8px;">' +
                '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:420px;">' +
                '<thead style="position:sticky;top:0;background:#f1f5f9;"><tr style="color:#475569;text-align:left;">' +
                '<th style="padding:8px;border-bottom:2px solid #e2e8f0;">Date</th>' +
                '<th style="padding:8px;border-bottom:2px solid #e2e8f0;">Age</th>' +
                '<th style="padding:8px;border-bottom:2px solid #e2e8f0;">Weight</th>' +
                '<th style="padding:8px;border-bottom:2px solid #e2e8f0;">MUAC</th>' +
                '<th style="padding:8px;border-bottom:2px solid #e2e8f0;">Temp</th>' +
                '</tr></thead><tbody>' +
                currentVitalsAll.map(function (v) {
                    var vEv = evaluateMUAC(v.muac_mm);
                    var ageAt = currentPatient.child_dob ? calculateAgeAtDate(currentPatient.child_dob, v.recorded_at) : '-';
                    var tColor = (v.temperature != null && v.temperature >= 37.5) ? '#ef4444' : '#0f172a';
                    return '<tr style="border-bottom:1px solid #e2e8f0;background:#fff;">' +
                        '<td style="padding:8px;font-weight:600;">' + formatDate(v.recorded_at) + '</td>' +
                        '<td style="padding:8px;color:#64748b;">' + ageAt + '</td>' +
                        '<td style="padding:8px;font-weight:600;">' + (v.weight_kg != null ? v.weight_kg + ' kg' : '-') + '</td>' +
                        '<td style="padding:8px;color:' + vEv.color + ';font-weight:700;">' + (v.muac_mm != null ? v.muac_mm + ' mm' : '-') + '</td>' +
                        '<td style="padding:8px;color:' + tColor + ';">' + (v.temperature != null ? v.temperature + ' C' : '-') + '</td>' +
                        '</tr>';
                }).join('') +
                '</tbody></table></div>';
        }

        showModal('Growth Chart', html);
    };

    window.viewVisitHistory = function () {
        if (!currentVisits || currentVisits.length === 0) {
            showModal('Visit History',
                '<div style="text-align: center; padding: 20px; color: #64748b;">' +
                '<p>No clinic visits recorded yet.</p>' +
                '<p style="font-size: 13px;">Your visit history will appear here after clinic appointments.</p>' +
                '</div>');
            return;
        }
        var content = '<p style="margin-bottom: 12px; color: #64748b;">Your complete clinical history:</p>' +
            '<div style="margin-top: 12px;">' +
            currentVisits.map(function (v) {
                var hasRx = v.prescription && v.prescription.trim() !== '';
                var rxButton = hasRx ? 
                    '<button onclick="printDispensingCard(\'' + v.id + '\', \'' + esc(v.created_at) + '\', \'' + esc(v.prescription) + '\')" style="margin-top: 8px; background: #1e3a8a; color: white; border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>' +
                    'View Dispensing Card</button>' : '';
                
                return '<div style="padding: 12px; background: #f8fafc; border-left: 3px solid #1e3a8a; border-radius: 6px; margin-bottom: 8px;">' +
                    '<div style="font-weight: 700; color: #0f172a; font-size: 14px;">' + formatDate(v.created_at) + '</div>' +
                    '<div style="font-size: 13px; color: #64748b; margin-top: 4px;">Station: ' + esc(v.current_station || 'General') + ' | Status: ' + esc(v.status) + '</div>' +
                    (v.diagnosis ? '<div style="font-size: 13px; margin-top: 4px;"><strong>Diagnosis:</strong> ' + esc(v.diagnosis) + '</div>' : '') +
                    (hasRx ? '<div style="font-size: 13px; margin-top: 4px;"><strong>Prescription:</strong> ' + esc(v.prescription).replace(/\n/g, '<br>') + '</div>' : '') +
                    rxButton +
                    '</div>';
            }).join('') +
            '</div>';
        showModal('Visit History', content);
    };

    // NEW: Dedicated My Prescriptions View
    window.viewMyPrescriptions = function () {
        if (!currentVisits || currentVisits.length === 0) {
            showModal('My Prescriptions',
                '<div style="text-align: center; padding: 20px; color: #64748b;">' +
                '<p>No prescriptions found.</p>' +
                '<p style="font-size: 13px;">Dispensed medications will appear here after your pharmacy visits.</p>' +
                '</div>');
            return;
        }
        
        var rxVisits = currentVisits.filter(function(v) {
            return v.prescription && v.prescription.trim() !== '';
        });

        if (rxVisits.length === 0) {
            showModal('My Prescriptions',
                '<div style="text-align: center; padding: 20px; color: #64748b;">' +
                '<p>No prescriptions recorded yet.</p>' +
                '<p style="font-size: 13px;">Your dispensing cards will appear here after the pharmacist completes your visit.</p>' +
                '</div>');
            return;
        }

        var content = '<p style="margin-bottom: 12px; color: #64748b;">Your dispensed medications and dispensing cards:</p>' +
            '<div style="margin-top: 12px;">' +
            rxVisits.map(function (v) {
                return '<div style="padding: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; border-radius: 8px; margin-bottom: 12px;">' +
                    '<div style="display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 8px;">' +
                        '<div>' +
                            '<div style="font-weight: 700; color: #0f172a; font-size: 15px;">' + formatDate(v.created_at) + '</div>' +
                            '<div style="font-size: 13px; color: #166534; margin-top: 2px;">Pharmacy Dispensed</div>' +
                        '</div>' +
                        '<button onclick="printDispensingCard(\'' + v.id + '\', \'' + esc(v.created_at) + '\', \'' + esc(v.prescription) + '\')" style="background: #16a34a; color: white; border: none; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">' +
                            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>' +
                            'View / Print Card' +
                        '</button>' +
                    '</div>' +
                    '<div style="margin-top: 12px; font-size: 14px; color: #0f172a; line-height: 1.6; background: white; padding: 12px; border-radius: 6px; border: 1px dashed #cbd5e1;">' +
                        esc(v.prescription).replace(/\n/g, '<br>') +
                    '</div>' +
                '</div>';
            }).join('') +
            '</div>';
        showModal('My Prescriptions', content);
    };

    // NEW: Print/View Dispensing Card Helper
    window.printDispensingCard = function(visitId, dateStr, prescriptionText) {
        var patientName = currentPatient ? esc(currentPatient.child_name || 'Child') : 'Patient';
        var motherName = currentPatient ? esc(currentPatient.mother_name || 'Mother') : 'Mother';
        var dateFormatted = formatDate(dateStr);
        
        var printWindow = window.open('', '_blank', 'width=800,height=600');
        printWindow.document.write('<!DOCTYPE html><html><head><title>Dispensing Card</title>');
        printWindow.document.write('<style>');
        printWindow.document.write('body { font-family: Arial, sans-serif; padding: 40px; color: #0f172a; }');
        printWindow.document.write('.header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 20px; margin-bottom: 30px; }');
        printWindow.document.write('.header h1 { margin: 0; color: #1e3a8a; font-size: 24px; }');
        printWindow.document.write('.header p { margin: 5px 0 0; color: #64748b; font-size: 14px; }');
        printWindow.document.write('.patient-info { background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; }');
        printWindow.document.write('.patient-info div { font-size: 14px; }');
        printWindow.document.write('.patient-info strong { color: #1e3a8a; }');
        printWindow.document.write('.rx-box { border: 2px solid #1e3a8a; border-radius: 8px; padding: 20px; min-height: 200px; }');
        printWindow.document.write('.rx-title { font-weight: bold; font-size: 18px; color: #1e3a8a; margin-bottom: 15px; display: flex; align-items: center; gap: 8px; }');
        printWindow.document.write('.rx-content { font-size: 15px; line-height: 1.8; white-space: pre-wrap; }');
        printWindow.document.write('.footer { margin-top: 40px; text-align: right; font-size: 13px; color: #64748b; }');
        printWindow.document.write('.footer .sig-line { border-top: 1px solid #0f172a; width: 200px; display: inline-block; margin-top: 40px; padding-top: 5px; }');
        printWindow.document.write('@media print { body { padding: 20px; } .no-print { display: none; } }');
        printWindow.document.write('</style></head><body>');
        printWindow.document.write('<div class="no-print" style="text-align: right; margin-bottom: 20px;"><button onclick="window.print(); window.close();" style="padding: 10px 20px; background: #1e3a8a; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">Print This Card</button></div>');
        printWindow.document.write('<div class="header"><h1>MNH RCH E-Clinic</h1><p>Official Dispensing Card / Prescription Receipt</p></div>');
        printWindow.document.write('<div class="patient-info">');
        printWindow.document.write('<div><strong>Patient:</strong> ' + patientName + '</div>');
        printWindow.document.write('<div><strong>Mother:</strong> ' + motherName + '</div>');
        printWindow.document.write('<div><strong>Date:</strong> ' + dateFormatted + '</div>');
        printWindow.document.write('</div>');
        printWindow.document.write('<div class="rx-box">');
        printWindow.document.write('<div class="rx-title">℞ Medications Dispensed</div>');
        printWindow.document.write('<div class="rx-content">' + esc(prescriptionText).replace(/\n/g, '<br>') + '</div>');
        printWindow.document.write('</div>');
        printWindow.document.write('<div class="footer">');
        printWindow.document.write('<div class="sig-line">Pharmacist Signature & Stamp</div>');
        printWindow.document.write('<p style="margin-top: 20px;">Keep this card for your records. Bring it to your next visit.</p>');
        printWindow.document.write('</div>');
        printWindow.document.write('</body></html>');
        printWindow.document.close();
    };

    window.viewFullSchedule = function () {
        if (!currentPatient) return;
        var html = '';

        if (currentANC) {
            var gaText = gaLabel(currentANC.lmp_date, new Date()); // UPDATED to use precise label
            html += '<div style="margin-bottom: 10px;">' +
                '<span style="' + CHIP + 'background:#dcfce7;border-color:#86efac;color:#166534;">Pregnancy active</span>' +
                '<span style="' + CHIP + '">GA today: ' + gaText + '</span>' +
                '<span style="' + CHIP + '">EDD: ' + formatDate(currentANC.edd) + '</span>' +
                '<span style="' + CHIP + '">Contacts done: ' + currentANCContacts.length + ' of 8</span>' +
                '</div>' +
                '<div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:10px 0 8px;">Your antenatal contacts (National ANC Guidelines 2018)</div>';

            html += buildAncSchedule(currentANC, currentANCContacts).map(function (s) {
                var chip = s.status === 'done' ? '<span style="color:#16a34a;font-weight:700;">Done ' + formatDate(s.row.visit_date) + '</span>'
                    : s.status === 'overdue' ? '<span style="color:#ef4444;font-weight:700;">Overdue</span>'
                    : s.status === 'due' ? '<span style="color:#d97706;font-weight:700;">Due now</span>'
                    : '<span style="color:#64748b;">Due ' + formatDate(s.due) + '</span>';
                var btn = s.status === 'done'
                    ? '<button onclick="toggleAncDetail(' + s.n + ')" style="background:#1e3a8a;color:white;border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;">Details</button>'
                    : '';
                var details = s.status === 'done'
                    ? '<div id="anc_detail_' + s.n + '" style="display:none;">' + renderAncDetail(s.row) + '</div>'
                    : '';
                var bg = s.status === 'done' ? '#f0fdf4' : s.status === 'overdue' ? '#fef2f2' : s.status === 'due' ? '#eff6ff' : '#f8fafc';
                return '<div style="border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;background:' + bg + ';">' +
                    '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;">' +
                    '<div style="font-size:13px;font-weight:700;color:#0f172a;">' + s.label + ' <span style="color:#64748b;font-weight:500;">(week ' + s.w + ')</span></div>' +
                    '<div style="display:flex;gap:8px;align-items:center;font-size:12px;">' + chip + btn + '</div>' +
                    '</div>' + details + '</div>';
            }).join('');
        } else {
            html += '<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:10px;padding:14px;font-size:13px;color:#475569;margin-bottom:14px;">No active pregnancy enrolment. If you are pregnant, your nurse will enrol you at the ANC clinic and your eight-contact schedule with full visit details will appear here automatically.</div>';
        }

        html += sectionTitle('Child immunization schedule') +
            '<ul style="list-style:none;padding:0;margin:0;">' + immunizationRowsHtml() + '</ul>';

        showModal('Schedule & ANC Contacts', html);
    };

    window.updateMyInfo = function () {
        if (!currentPatient) return;
        var content = '<form id="update_info_form">' +
            '<div class="modal-form-group"><label>Full Name</label><input type="text" id="update_name" value="' + esc(currentPatient.mother_name) + '" required></div>' +
            '<div class="modal-form-group"><label>Phone Number</label><input type="tel" id="update_phone" value="' + esc(currentPatient.phone_number) + '" required></div>' +
            '<div class="modal-form-group"><label>Age</label><input type="number" id="update_age" value="' + (currentPatient.mother_age || '') + '"></div>' +
            '<div class="modal-form-group"><label>Residence</label><input type="text" id="update_residence" value="' + esc(currentPatient.residence) + '"></div>' +
            '<div class="modal-form-group"><label>SHA Number</label><input type="text" id="update_sha" value="' + esc(currentPatient.sha_number) + '"></div>' +
            '<button type="submit" class="modal-submit-btn" id="update_submit_btn">Save Changes</button></form>';
        showModal('Update My Information', content);

        setTimeout(function () {
            document.getElementById('update_info_form').addEventListener('submit', async function (e) {
                e.preventDefault();
                var btn = document.getElementById('update_submit_btn');
                btn.disabled = true;
                btn.textContent = 'Saving...';
                try {
                    var res = await supabase.from('patients').update({
                        mother_name: document.getElementById('update_name').value,
                        phone_number: document.getElementById('update_phone').value,
                        mother_age: document.getElementById('update_age').value ? parseInt(document.getElementById('update_age').value, 10) : null,
                        residence: document.getElementById('update_residence').value || null,
                        sha_number: document.getElementById('update_sha').value || null
                    }).eq('id', currentPatient.id);
                    if (res.error) throw res.error;
                    localStorage.setItem('mnh_user_name', document.getElementById('update_name').value);
                    localStorage.setItem('mnh_user_phone', document.getElementById('update_phone').value);
                    alert('Information updated successfully!');
                    closeModal();
                    loadMotherDashboard();
                } catch (err) {
                    alert('Failed to update: ' + err.message);
                    btn.disabled = false;
                    btn.textContent = 'Save Changes';
                }
            });
        }, 100);
    };

    window.registerNewborn = function () {
        if (!currentPatient) return;
        if (currentPatient.child_name && currentPatient.child_dob) {
            showModal('Child Already Registered',
                '<div style="background: #fef3c7; border: 1px solid #fcd34d; padding: 16px; border-radius: 8px; color: #92400e;">' +
                '<p style="margin: 0 0 8px 0; font-weight: 700;">A child is already on record:</p>' +
                '<p style="margin: 0;"><strong>' + esc(currentPatient.child_name) + '</strong></p>' +
                '<p style="margin: 4px 0 0 0; font-size: 13px;">Born: ' + formatDate(currentPatient.child_dob) + '</p></div>' +
                '<p style="margin-top: 16px; font-size: 13px; color: #64748b;">If you have given birth to another child, please visit the clinic so a nurse can create a new patient record for the newborn.</p>');
            return;
        }
        var content = '<p style="margin-bottom: 16px; color: #64748b; font-size: 14px;">Congratulations on your newborn. Fill in these details to complete your child\'s digital Kadi ya Kliniki.</p>' +
            '<form id="newborn_form">' +
            '<div class="modal-form-group"><label>Child\'s Full Name *</label><input type="text" id="newborn_name" required placeholder="e.g., Neema Sarah"></div>' +
            '<div class="modal-form-group"><label>Date of Birth *</label><input type="date" id="newborn_dob" required max="' + new Date().toISOString().split('T')[0] + '"></div>' +
            '<div class="modal-form-group"><label>Sex *</label><select id="newborn_sex" required><option value="">Select sex</option><option value="Male">Male</option><option value="Female">Female</option></select></div>' +
            '<button type="submit" class="modal-submit-btn" id="newborn_submit_btn">Register Newborn</button></form>';
        showModal('Register Your Newborn', content);

        setTimeout(function () {
            document.getElementById('newborn_form').addEventListener('submit', async function (e) {
                e.preventDefault();
                var btn = document.getElementById('newborn_submit_btn');
                btn.disabled = true;
                btn.textContent = 'Saving...';
                try {
                    var res = await supabase.from('patients').update({
                        child_name: document.getElementById('newborn_name').value.trim(),
                        child_dob: document.getElementById('newborn_dob').value,
                        child_sex: document.getElementById('newborn_sex').value
                    }).eq('id', currentPatient.id);
                    if (res.error) throw res.error;
                    alert('Newborn registered successfully!');
                    closeModal();
                    loadMotherDashboard();
                } catch (err) {
                    alert('Failed to register newborn: ' + err.message);
                    btn.disabled = false;
                    btn.textContent = 'Register Newborn';
                }
            });
        }, 100);
    };

    window.handleLogout = async function () {
        if (confirm('Are you sure you want to logout?')) {
            await supabase.auth.signOut();
            localStorage.removeItem('mnh_user_phone');
            localStorage.removeItem('mnh_user_name');
            window.location.href = 'index.html';
        }
    };

    // ==========================================
    // 8. INIT
    // ==========================================
    document.addEventListener('DOMContentLoaded', function () {
        loadMotherDashboard();
    });
})();
