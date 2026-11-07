/**
 * MNH RCH - ANC Clinic Logic (v2 - Validated)
 * Implements the Tanzania National ANC Guidelines 2018 (WHO 8-contact model).
 * Includes LMP validation, SFH sanity checks, and GA in weeks+days.
 */
(function () {
    'use strict';

    if (window.__MNH_ANC_ACTIONS_LOADED__) return;
    window.__MNH_ANC_ACTIONS_LOADED__ = true;

    console.log('[ANC] Script loaded');

    var SUPABASE_URL = 'https://fmaaudmdgmgklvqcmvad.supabase.co';
    var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E';
    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    var currentUser = '';
    var currentPatient = null;
    var currentEnrollment = null;
    var currentContacts = [];
    var recordingContact = null;

    var CONTACTS = [
        { n: 1, w: 12, label: '1st contact (booking, up to 12 wks)' },
        { n: 2, w: 20, label: '2nd contact (20 wks)' },
        { n: 3, w: 26, label: '3rd contact (26 wks)' },
        { n: 4, w: 30, label: '4th contact (30 wks)' },
        { n: 5, w: 34, label: '5th contact (34 wks)' },
        { n: 6, w: 36, label: '6th contact (36 wks)' },
        { n: 7, w: 38, label: '7th contact (38 wks)' },
        { n: 8, w: 40, label: '8th contact (40 wks)' },
        { n: 9, w: 41, label: 'Return for delivery (41 wks)' }
    ];

    var CONTACT_TASKS = {
        1: ['Syphilis test (RPR/VDRL)', 'HIV test (PITC)', 'Blood group & Rhesus', 'Hb / FBC', 'MSU culture or gram stain', 'Urine glucose + albumin', 'mRDT', 'TB screen', 'TT1 if status unknown', 'Start daily IFA', 'Give LLIN', 'Birth & emergency plan'],
        2: ['Obstetric ultrasound (~20 wks)', 'TT2 (4 wks after TT1)', 'Mebendazole 500mg stat (2nd trimester)', 'IFA refill', 'IPTp-SP if 4 wks since last dose'],
        3: ['Hb', 'MSU culture', 'Urine glucose', 'Urine albumin if BP >140/90', 'IFA refill', 'IPTp-SP if 4 wks'],
        4: ['Hb if symptomatic', 'Urine albumin if BP >140/90', 'Discuss labour', 'Discuss family planning', 'IFA refill', 'IPTp-SP if 4 wks'],
        5: ['Hb', 'MSU culture', 'Urine glucose', 'Repeat HIV test', 'Assess lie & presentation', 'Teach newborn care & breastfeeding', 'IFA refill', 'IPTp-SP if 4 wks'],
        6: ['Hb if symptomatic', 'Urine albumin if BP >140/90', 'Lie & presentation', 'Review newborn care', 'IPTp-SP if 4 wks'],
        7: ['Hb if symptomatic', 'Urine albumin if BP >140/90', 'Lie & presentation', 'IPTp-SP if 4 wks'],
        8: ['Hb if symptomatic', 'Urine albumin if BP >140/90', 'Lie & presentation', 'Postpartum FP counselling', 'IPTp-SP if 4 wks'],
        9: ['Prepare for delivery', 'Refer to delivery facility if not in labour']
    };

    // ==========================================
    // HELPERS
    // ==========================================
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function today() {
        var d = new Date();
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function addDays(dateLike, days) {
        var d = new Date(dateLike);
        d.setDate(d.getDate() + days);
        return d;
    }

    function fmt(d) {
        if (!d) return 'N/A';
        return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function isoDate(d) {
        var x = new Date(d);
        return x.toISOString().split('T')[0];
    }

    function gaWeeks(lmp, onDate) {
        return Math.floor((new Date(onDate) - new Date(lmp)) / (7 * 86400000));
    }

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

    function phoneVariants(input) {
        var raw = String(input || '').trim();
        var digits = raw.replace(/\D/g, '');
        var set = {};
        function add(v) { if (v) set[v] = 1; }
        add(raw); add(digits);
        if (digits.length === 12 && digits.indexOf('255') === 0) {
            add('0' + digits.slice(3)); add('255' + digits.slice(3)); add('+255' + digits.slice(3));
        }
        if (digits.length === 10 && digits.charAt(0) === '0') {
            add('255' + digits.slice(1)); add('+255' + digits.slice(1));
        }
        if (digits.length === 9 && (digits.charAt(0) === '6' || digits.charAt(0) === '7')) {
            add('0' + digits); add('255' + digits); add('+255' + digits);
        }
        return Object.keys(set);
    }

    function numOrNull(id) {
        var v = document.getElementById(id).value;
        return v === '' ? null : parseFloat(v);
    }

    function valOrNull(id) {
        var v = document.getElementById(id).value;
        return v === '' ? null : v;
    }

    // ==========================================
    // STATS
    // ==========================================
    async function loadStats() {
        var t = today();
        var monthStart = new Date(t.getFullYear(), t.getMonth(), 1);

        var active = await sb.from('anc_enrollments').select('*', { count: 'exact', head: true }).eq('status', 'active');
        var contactsToday = await sb.from('anc_contacts').select('*', { count: 'exact', head: true }).eq('visit_date', isoDate(t));
        var enrolledMonth = await sb.from('anc_enrollments').select('*', { count: 'exact', head: true }).gte('enrolled_at', monthStart.toISOString());

        document.getElementById('stat_active').textContent = active.count || 0;
        document.getElementById('stat_today').textContent = contactsToday.count || 0;
        document.getElementById('stat_month').textContent = enrolledMonth.count || 0;

        var enr = await sb.from('anc_enrollments').select('id, lmp_date').eq('status', 'active');
        var overdue = 0;
        if (enr.data && enr.data.length) {
            var ids = enr.data.map(function (e) { return e.id; });
            var cts = await sb.from('anc_contacts').select('anc_id, contact_number').in('anc_id', ids);
            var doneMap = {};
            (cts.data || []).forEach(function (c) { doneMap[c.anc_id + ':' + c.contact_number] = 1; });
            enr.data.forEach(function (e) {
                CONTACTS.forEach(function (c) {
                    if (c.n === 9) return;
                    var due = addDays(e.lmp_date, c.w * 7);
                    if (!doneMap[e.id + ':' + c.n] && t > addDays(due, 7)) overdue++;
                });
            });
        }
        document.getElementById('stat_overdue').textContent = overdue;
    }

    // ==========================================
    // ACTIVE CLIENTS LIST
    // ==========================================
    async function loadClients() {
        var res = await sb.from('anc_enrollments')
            .select('id, lmp_date, edd, status, patient_id, patients(id, mother_name, phone_number)')
            .eq('status', 'active')
            .order('enrolled_at', { ascending: false })
            .limit(60);

        var box = document.getElementById('anc_list');
        if (res.error || !res.data || !res.data.length) {
            box.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 30px; font-style: italic;">No active pregnancies enrolled yet</p>';
            return;
        }

        box.innerHTML = res.data.map(function (e) {
            var gaText = gaLabel(e.lmp_date, today());
            var p = e.patients || {};
            return '<div class="patient-item" onclick="openEnrollment(\'' + e.id + '\')">' +
                '<div><h4>' + esc(p.mother_name) + '</h4><p>' + esc(p.phone_number) + ' &middot; GA ' + gaText + ' &middot; EDD ' + fmt(e.edd) + '</p></div>' +
                '<div class="patient-meta">Tap to open<small>schedule & contacts</small></div>' +
            '</div>';
        }).join('');
    }

    // ==========================================
    // LOOKUP + ENROLLMENT OPEN
    // ==========================================
    window.openEnrollment = async function (id) {
        var e = await sb.from('anc_enrollments').select('*, patients(id, mother_name, phone_number)').eq('id', id).single();
        if (e.error || !e.data) { alert('Could not open enrollment: ' + (e.error && e.error.message)); return; }
        currentPatient = e.data.patients;
        currentEnrollment = e.data;
        var c = await sb.from('anc_contacts').select('*').eq('anc_id', id).order('visit_date', { ascending: true });
        currentContacts = c.data || [];
        renderMotherBox();
        renderSchedule();
        document.getElementById('schedule_card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    async function lookupMother() {
        var phone = document.getElementById('anc_phone').value.trim();
        var banner = document.getElementById('anc_lookup_status');
        document.getElementById('mother_box').style.display = 'none';
        document.getElementById('schedule_card').style.display = 'none';
        document.getElementById('enroll_card').style.display = 'none';
        document.getElementById('contact_card').style.display = 'none';
        currentPatient = null; currentEnrollment = null; currentContacts = [];

        if (phone.replace(/\D/g, '').length < 9) {
            banner.className = 'lookup-banner notfound';
            banner.innerHTML = 'Enter a full phone number to check the system.';
            return;
        }

        banner.className = 'lookup-banner notfound';
        banner.innerHTML = 'Checking system...';

        var res = await sb.from('patients').select('*').in('phone_number', phoneVariants(phone)).order('created_at', { ascending: false }).limit(5);
        if (res.error) {
            banner.className = 'lookup-banner error';
            banner.innerHTML = 'Lookup failed: ' + esc(res.error.message);
            return;
        }
        if (!res.data || !res.data.length) {
            banner.className = 'lookup-banner notfound';
            banner.innerHTML = 'This mother is NOT registered in the system. Register her first at the <a href="nurse.html" style="color:inherit; font-weight:700;">Nurse Station</a>, then return here to enroll her pregnancy.';
            return;
        }

        currentPatient = res.data[0];
        banner.className = 'lookup-banner found';
        banner.innerHTML = 'Mother found: <strong>' + esc(currentPatient.mother_name) + '</strong> &middot; ' + esc(currentPatient.phone_number);

        var e = await sb.from('anc_enrollments').select('*').eq('patient_id', currentPatient.id).eq('status', 'active').order('enrolled_at', { ascending: false }).limit(1);
        if (e.data && e.data.length) {
            currentEnrollment = e.data[0];
            var c = await sb.from('anc_contacts').select('*').eq('anc_id', currentEnrollment.id).order('visit_date', { ascending: true });
            currentContacts = c.data || [];
        }
        renderMotherBox();
        if (currentEnrollment) renderSchedule();
    }

    function renderMotherBox() {
        var box = document.getElementById('mother_box');
        box.style.display = 'block';
        var html = '<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">' +
            '<div style="font-size:14px; color:var(--text-muted);">' +
                '<strong style="color:var(--text-dark);">' + esc(currentPatient.mother_name) + '</strong> &middot; ' + esc(currentPatient.phone_number) +
                (currentPatient.child_name ? ' &middot; Child: ' + esc(currentPatient.child_name) : ' &middot; Antenatal (no child on record)') +
            '</div>';
        if (currentEnrollment) {
            var gaText = gaLabel(currentEnrollment.lmp_date, today());
            html += '<div><span class="chip ok">Active pregnancy &middot; GA ' + gaText + ' &middot; EDD ' + fmt(currentEnrollment.edd) + '</span></div>';
        } else {
            html += '<button class="btn-check" onclick="showEnrollForm()">Enroll New Pregnancy</button>';
        }
        html += '</div>';
        box.innerHTML = html;
    }

    window.showEnrollForm = function () {
        document.getElementById('enroll_card').style.display = 'block';
        document.getElementById('enroll_card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    // ==========================================
    // SCHEDULE
    // ==========================================
    function buildSchedule() {
        var t = today();
        return CONTACTS.map(function (c) {
            var due = addDays(currentEnrollment.lmp_date, c.w * 7);
            var row = currentContacts.filter(function (k) { return k.contact_number === c.n; })[0];
            var status = row ? 'done' : (t > addDays(due, 7) ? 'overdue' : (t >= due ? 'due' : 'upcoming'));
            return { n: c.n, w: c.w, label: c.label, due: due, status: status, row: row };
        });
    }

    function renderSchedule() {
        document.getElementById('schedule_card').style.display = 'block';
        var gaText = gaLabel(currentEnrollment.lmp_date, today());
        document.getElementById('schedule_title').textContent = 'Contact Schedule - ' + currentPatient.mother_name;

        var spInfo = spEligibility();
        document.getElementById('schedule_summary').innerHTML =
            '<span class="chip">GA today: ' + gaText + '</span>' +
            '<span class="chip">EDD: ' + fmt(currentEnrollment.edd) + '</span>' +
            '<span class="chip">Contacts done: ' + currentContacts.length + ' / 8</span>' +
            '<span class="chip ' + (spInfo.ok ? 'ok' : 'warn') + '">IPTp-SP: ' + esc(spInfo.reason) + '</span>' +
            (currentEnrollment.rhesus === 'Negative' ? '<span class="chip warn">Rhesus negative - plan anti-D within 72h of delivery</span>' : '');

        document.getElementById('schedule_list').innerHTML = buildSchedule().map(function (s) {
            var right = '';
            if (s.status === 'done') {
                right = '<span class="chip ok">Done ' + fmt(s.row.visit_date) + '</span>';
            } else if (s.n <= 8) {
                right = '<button class="sched-btn" onclick="openContactForm(' + s.n + ')">Record contact</button>';
            }
            var statusChip = s.status === 'overdue' ? '<span class="chip bad">Overdue</span>' :
                             s.status === 'due' ? '<span class="chip warn">Due now</span>' :
                             s.status === 'upcoming' ? '<span class="chip">Due ' + fmt(s.due) + '</span>' : '';
            return '<div class="sched-row ' + s.status + '">' +
                '<div><div class="sched-title">' + s.label + '</div><div class="sched-meta">Target week ' + s.w + ' &middot; due ' + fmt(s.due) + '</div></div>' +
                '<div style="display:flex; align-items:center; gap:8px;">' + statusChip + right + '</div>' +
            '</div>';
        }).join('');
    }

    function spEligibility() {
        var ga = gaWeeks(currentEnrollment.lmp_date, today());
        if (ga < 13) return { ok: false, reason: 'starts at 13 weeks (2nd trimester)' };
        var doses = currentContacts.filter(function (c) { return c.iptp_sp_dose > 0; });
        if (!doses.length) return { ok: true, reason: 'dose 1 due now' };
        var total = doses.reduce(function (a, c) { return a + c.iptp_sp_dose; }, 0);
        var last = doses[doses.length - 1];
        var days = Math.floor((today() - new Date(last.visit_date)) / 86400000);
        if (days >= 28) return { ok: true, reason: 'dose ' + (total + 1) + ' due (4-week gap met)' };
        return { ok: false, reason: total + ' dose(s) given, ' + (28 - days) + ' days to next' };
    }

    // ==========================================
    // CONTACT FORM
    // ==========================================
    window.openContactForm = function (n) {
        recordingContact = n;
        document.getElementById('contact_card').style.display = 'block';
        document.getElementById('contact_title').textContent = 'Contact ' + n + ' of 8 - ' + currentPatient.mother_name;
        document.getElementById('ct_date').value = isoDate(today());
        document.getElementById('ct_ga').value = gaLabel(currentEnrollment.lmp_date, document.getElementById('ct_date').value);

        var tasks = CONTACT_TASKS[n] || [];
        var sp = spEligibility();
        var chips = tasks.map(function (t) { return '<span class="chip">' + esc(t) + '</span>'; }).join('');
        chips += '<span class="chip ' + (sp.ok ? 'ok' : 'warn') + '">SP: ' + esc(sp.reason) + '</span>';
        if (n >= 5) chips += '<span class="chip warn">Assess lie & presentation</span>';
        document.getElementById('contact_tasks').innerHTML = '<div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:8px;">Guideline tasks for this contact</div>' + chips;

        var sched = buildSchedule();
        var next = sched.filter(function (s) { return s.n === n + 1; })[0];
        if (next) document.getElementById('ct_next').value = isoDate(next.due);

        document.getElementById('contact_card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    function setupContactForm() {
        // Bind the date change listener ONCE here to prevent stacking
        document.getElementById('ct_date').addEventListener('change', function () {
            if (!currentEnrollment) return;
            var dateVal = this.value || isoDate(today());
            document.getElementById('ct_ga').value = gaLabel(currentEnrollment.lmp_date, dateVal);
        });

        document.getElementById('contact_form').addEventListener('submit', async function (e) {
            e.preventDefault();
            if (!currentEnrollment || !recordingContact) return;

            var btn = document.getElementById('contact_submit');
            btn.disabled = true;
            btn.textContent = 'Saving...';

            try {
                var danger = document.getElementById('ct_danger').checked;
                var counselling = Array.prototype.slice.call(document.querySelectorAll('.ct_couns:checked'))
                    .map(function (c) { return c.value; }).join(', ');
                                
                var visitDate = document.getElementById('ct_date').value || isoDate(today());
                var gVisit = gaParts(currentEnrollment.lmp_date, visitDate);
                if (gVisit.negative) {
                    alert('Visit date is before the LMP. Correct the visit date or fix the LMP at the enrollment before saving.');
                    btn.disabled = false;
                    btn.textContent = 'Save Contact & Update Card';
                    return;
                }
                var sfhVal = numOrNull('ct_sfh');
                if (sfhVal != null) {
                    if (gVisit.weeks >= 20 && Math.abs(sfhVal - gVisit.weeks) > 3) {
                        if (!confirm('SFH ' + sfhVal + ' cm does not match ' + gVisit.weeks + ' weeks gestation (expected about ' + (gVisit.weeks - 2) + ' to ' + (gVisit.weeks + 2) + ' cm). Save anyway?')) {
                            btn.disabled = false;
                            btn.textContent = 'Save Contact & Update Card';
                            return;
                        }
                    }
                    if (gVisit.weeks < 20 && sfhVal > 20) {
                        if (!confirm('SFH ' + sfhVal + ' cm is unusually high for ' + gVisit.weeks + ' weeks gestation. Save anyway?')) {
                            btn.disabled = false;
                            btn.textContent = 'Save Contact & Update Card';
                            return;
                        }
                    }
                }

                var payload = {
                    anc_id: currentEnrollment.id,
                    contact_number: recordingContact,
                    visit_date: visitDate,
                    ga_weeks: gVisit.weeks,
                    danger_signs: danger,
                    danger_signs_note: document.getElementById('ct_danger_note').value || null,
                    bp_systolic: numOrNull('ct_bps'),
                    bp_diastolic: numOrNull('ct_bpd'),
                    weight_kg: numOrNull('ct_weight'),
                    sfh_cm: sfhVal,
                    foetal_heart_rate: numOrNull('ct_fhr'),
                    lie: valOrNull('ct_lie'),
                    presentation: valOrNull('ct_presentation'),
                    hb: numOrNull('ct_hb'),
                    urine_glucose: valOrNull('ct_glucose'),
                    urine_albumin: valOrNull('ct_albumin'),
                    msu_sent: document.getElementById('ct_msu').checked,
                    hiv_test_done: document.getElementById('ct_hivtest').checked,
                    hiv_result: valOrNull('ct_hivresult'),
                    mrdt_done: document.getElementById('ct_mrdt').checked,
                    mrdt_result: valOrNull('ct_mrdtresult'),
                    tb_screened: document.getElementById('ct_tb').checked,
                    ultrasound_done: document.getElementById('ct_uss').checked,
                    tt_dose: valOrNull('ct_tt'),
                    iptp_sp_dose: parseInt(document.getElementById('ct_sp').value, 10) || 0,
                    mebendazole_given: document.getElementById('ct_meb').checked,
                    ifa_months: parseInt(document.getElementById('ct_ifa').value, 10) || 0,
                    llin_given: document.getElementById('ct_llin').checked,
                    counselling: counselling || null,
                    next_appointment: document.getElementById('ct_next').value || null,
                    notes: document.getElementById('ct_notes').value || null,
                    recorded_by: currentUser
                };

                var ins = await sb.from('anc_contacts').insert(payload).select().single();
                if (ins.error) throw ins.error;

                if (danger) {
                    await sb.from('queue').insert({
                        patient_id: currentEnrollment.patient_id,
                        current_station: 'Doctor',
                        status: 'Waiting',
                        diagnosis: 'ANC danger signs: ' + (payload.danger_signs_note || 'see ANC contact ' + recordingContact),
                        created_at: new Date().toISOString()
                    });
                }

                await sb.from('anc_enrollments').update({ updated_at: new Date().toISOString() }).eq('id', currentEnrollment.id);

                var c = await sb.from('anc_contacts').select('*').eq('anc_id', currentEnrollment.id).order('visit_date', { ascending: true });
                currentContacts = c.data || [];

                alert('Contact ' + recordingContact + ' saved.' + (danger ? ' Client added to doctor queue per RAM protocol.' : ''));
                document.getElementById('contact_form').reset();
                document.getElementById('contact_card').style.display = 'none';
                renderSchedule();
                loadStats();
                loadClients();
            } catch (err) {
                console.error('[ANC] Contact save error:', err);
                alert('Failed to save contact: ' + err.message);
            }
            btn.disabled = false;
            btn.textContent = 'Save Contact & Update Card';
        });
    }

    // ==========================================
    // ENROLL FORM
    // ==========================================
    function setupEnrollForm() {
        var lmp = document.getElementById('en_lmp'); // FIXED: Added variable declaration
        lmp.addEventListener('change', function () {
            if (!lmp.value) return;
            var g = gaParts(lmp.value, today());
            var eddBox = document.getElementById('en_edd');
            var gaBox = document.getElementById('en_ga');
            if (g.negative) {
                eddBox.value = '';
                gaBox.value = 'LMP is in the future - correct it';
                return;
            }
            eddBox.value = isoDate(addDays(lmp.value, 280));
            gaBox.value = gaLabel(lmp.value, today()) + (g.weeks > 12 ? ' (late booking: guideline advises first contact before 12 weeks)' : '');
        });

        document.getElementById('enroll_form').addEventListener('submit', async function (e) {
            e.preventDefault();
            if (!currentPatient) { alert('Find the mother first.'); return; }
            
            var lmpVal = document.getElementById('en_lmp').value;
            var gEnrol = gaParts(lmpVal, today());
            if (!lmpVal || gEnrol.negative) {
                alert('LMP cannot be empty or in the future. Verify the date with the mother before enrolling.');
                return;
            }
            if (gEnrol.weeks > 44) {
                alert('This LMP gives ' + gEnrol.weeks + ' weeks gestation, beyond 44 weeks. The LMP date is almost certainly wrong.');
                return;
            }

            var btn = document.getElementById('enroll_submit');
            btn.disabled = true;

            try {
                var ins = await sb.from('anc_enrollments').insert({
                    patient_id: currentPatient.id,
                    lmp_date: document.getElementById('en_lmp').value,
                    edd: document.getElementById('en_edd').value,
                    gravida: numOrNull('en_gravida'),
                    para: numOrNull('en_para'),
                    abortions: numOrNull('en_abortions'),
                    blood_group: valOrNull('en_blood'),
                    rhesus: valOrNull('en_rhesus'),
                    hiv_status: valOrNull('en_hiv'),
                    syphilis_status: valOrNull('en_syphilis'),
                    hb_baseline: numOrNull('en_hb'),
                    status: 'active'
                }).select().single();
                if (ins.error) throw ins.error;

                currentEnrollment = ins.data;
                currentContacts = [];
                alert('Pregnancy enrolled. Eight-contact schedule created.');
                document.getElementById('enroll_card').style.display = 'none';
                document.getElementById('enroll_form').reset();
                renderMotherBox();
                renderSchedule();
                loadStats();
                loadClients();
            } catch (err) {
                alert('Enrollment failed: ' + err.message);
            }
            btn.disabled = false;
        });
    }

    // ==========================================
    // LOGOUT + INIT
    // ==========================================
    window.handleLogout = async function () {
        await sb.auth.signOut();
        window.location.href = 'login.html';
    };

    async function initAnc() {
        try {
            var sess = await sb.auth.getSession();
            if (!sess.data.session) { window.location.href = 'login.html'; return; }
            var prof = await sb.from('profiles').select('full_name, role').eq('id', sess.data.session.user.id).single();
            if (!prof.data || ['nurse', 'doctor', 'admin'].indexOf(prof.data.role) === -1) {
                window.location.href = 'login.html'; return;
            }
            currentUser = prof.data.full_name;
            document.getElementById('user_info').textContent = prof.data.role.charAt(0).toUpperCase() + prof.data.role.slice(1) + ': ' + prof.data.full_name;
            document.getElementById('loading_message').style.display = 'none';
            document.getElementById('anc_content').style.display = 'block';

            document.getElementById('anc_check_btn').addEventListener('click', lookupMother);
            document.getElementById('anc_phone').addEventListener('blur', function () {
                if (this.value.trim() !== '') lookupMother();
            });

            setupEnrollForm();
            setupContactForm();
            loadStats();
            loadClients();
        } catch (err) {
            console.error('[ANC] Init error:', err);
            document.getElementById('loading_message').innerHTML = '<p style="color: var(--danger); font-weight: 600;">Error loading ANC clinic. Refresh the page.</p>';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAnc);
    } else {
        initAnc();
    }
})();
