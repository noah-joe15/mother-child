/**
 * MNH RCH - Pharmacy Portal Logic
 * Guideline-based dispensing (Tanzania ANC Guidelines 2018) with
 * contraindication checks, stock ledger sync, and queue integration.
 */
(function () {
    'use strict';

    if (window.__MNH_PHARMACY_LOADED__) return;
    window.__MNH_PHARMACY_LOADED__ = true;

    console.log('[Pharmacy] Script loaded');

    var SUPABASE_URL = 'https://fmaaudmdgmgklvqcmvad.supabase.co';
    var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZtYWF1ZG1kZ21na2x2cWNtdmFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzk2MjMsImV4cCI6MjEwMjcxNTYyM30.yGKizF1gywUIctA_VKDVuI9YO8rH7i-kfQ2RfDb2u_E';
    var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    var currentUser = '';
    var stockCache = [];

    // Guideline commodity catalogue with default regimens
    var CATALOG = [
        { key: 'ifa', name: 'Iron-Folic Acid (Ferrous Sulphate 200mg + FA 0.4mg)', unit: 'tabs', qty: 90, months: 3, regimen: '1 tablet daily until 3 months after delivery. Double dose (200mg twice daily) if anaemic until Hb normal.', stock: 'Ferrous Sulphate 200mg + Folic Acid 0.4mg tablets' },
        { key: 'sp', name: 'IPTp-SP (Sulphadoxine-Pyrimethamine, 3 tablets)', unit: 'doses', qty: 3, regimen: '3 tablets single dose under Directly Observed Treatment with clean water. Repeat if vomited within 30 minutes.', stock: 'Sulphadoxine-Pyrimethamine tablets (IPTp-SP)' },
        { key: 'meb', name: 'Mebendazole 500mg', unit: 'tabs', qty: 1, regimen: '500mg stat on empty stomach. Once every 6 months from 2nd trimester.', stock: 'Mebendazole 500mg tablets' },
        { key: 'llin', name: 'Long-Lasting Insecticidal Net (LLIN)', unit: 'nets', qty: 1, regimen: 'Give net and counsel on correct nightly use.', stock: 'Long-Lasting Insecticidal Net (LLIN)' },
        { key: 'calcium', name: 'Calcium 1.5-2g elemental daily', unit: 'tabs', qty: 90, regimen: 'Daily in divided doses where available to reduce pre-eclampsia risk.', stock: 'Calcium Carbonate 1.5-2g elemental tablets' },
        { key: 'amox', name: 'Amoxicillin (ASB first line)', unit: 'caps', qty: 21, regimen: '500mg three times daily for 7 days. Test-of-cure culture 1 week after treatment.', stock: 'Amoxicillin 500mg capsules' },
        { key: 'nitro', name: 'Nitrofurantoin (ASB second line)', unit: 'tabs', qty: 14, regimen: '100mg twice daily for 7 days.', stock: 'Nitrofurantoin 100mg tablets' },
        { key: 'benpen', name: 'Benzathine Penicillin 2.4MU IM (syphilis)', unit: 'vials', qty: 1, regimen: 'Single dose IM. Treat partner too. Treat newborn if mother positive.', stock: 'Benzathine Penicillin 2.4MU vials' },
        { key: 'eryth', name: 'Erythromycin (syphilis, penicillin allergy)', unit: 'tabs', qty: 21, regimen: '500mg three times daily for 7 days in early syphilis.', stock: 'Erythromycin 500mg tablets' },
        { key: 'tt', name: 'Tetanus Toxoid', unit: 'vials', qty: 1, regimen: 'TT1 if status unknown. Plan TT2 in 4 weeks.', stock: 'Tetanus Toxoid vials' },
        { key: 'antihtn', name: 'Antihypertensive (per STG)', unit: 'tabs', qty: 30, regimen: 'Per Standard Treatment Guidelines when BP above 140/90.', stock: 'Antihypertensives (per STG)' },
        { key: 'act', name: 'ACT Antimalarial (treatment)', unit: 'packs', qty: 1, regimen: 'Full treatment per national malaria guidelines when mRDT positive.', stock: 'ACT Antimalarials (treatment)' },
        { key: 'steroid', name: 'Corticosteroids (foetal lung maturity)', unit: 'vials', qty: 2, regimen: 'From 28 weeks when delivery expected within 48 hours.', stock: 'Corticosteroids (betamethasone/dexamethasone)' },
        { key: 'antid', name: 'Anti-D Immunoglobulin', unit: 'vials', qty: 1, regimen: 'Within 72 hours post-delivery or post-abortion for Rh-negative mother with Rh-positive baby.', stock: 'Anti-D Immunoglobulin vials' },
        { key: 'art', name: 'ARVs (PMTCT)', unit: 'packs', qty: 1, regimen: 'Start or continue ART immediately per PMTCT guidelines. CTC linkage.', stock: 'ARVs (PMTCT referral pack)' }
    ];

    // ==========================================
    // HELPERS
    // ==========================================
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function todayIso() { return new Date().toISOString().split('T')[0]; }

    function fmt(d) {
        if (!d) return 'N/A';
        return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    function gaWeeks(lmp, onDate) {
        return Math.floor((new Date(onDate) - new Date(lmp)) / (7 * 86400000));
    }

    function phoneVariants(input) {
        var raw = String(input || '').trim();
        var digits = raw.replace(/\D/g, '');
        var set = {};
        function add(v) { if (v) set[v] = 1; }
        add(raw); add(digits);
        if (digits.length === 12 && digits.indexOf('255') === 0) { add('0' + digits.slice(3)); add('+255' + digits.slice(3)); }
        if (digits.length === 10 && digits.charAt(0) === '0') { add('255' + digits.slice(1)); add('+255' + digits.slice(1)); }
        return Object.keys(set);
    }

    // ==========================================
    // MODAL
    // ==========================================
    function showModal(title, html) {
        var old = document.getElementById('ph_modal');
        if (old) old.remove();
        var wrap = document.createElement('div');
        wrap.id = 'ph_modal';
        wrap.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,.6);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';
        wrap.innerHTML = '<div style="background:white;border-radius:16px;width:100%;max-width:620px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,.25);">' +
            '<div style="padding:18px 24px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:white;border-radius:16px 16px 0 0;">' +
            '<h3 style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">' + title + '</h3>' +
            '<button onclick="closePhModal()" style="background:none;border:none;cursor:pointer;color:#64748b;padding:4px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
            '</div><div style="padding:24px;" id="ph_modal_body">' + html + '</div></div>';
        wrap.addEventListener('click', function (e) { if (e.target === wrap) closePhModal(); });
        document.body.appendChild(wrap);
    }

    function closePhModal() {
        var m = document.getElementById('ph_modal');
        if (m) m.remove();
    }
    window.closePhModal = closePhModal;

    // ==========================================
    // CONTRAINDICATION ENGINE
    // ==========================================
    function runChecks(item, ctx) {
        var block = [], warn = [];
        if (item.key === 'sp') {
            if (!ctx.pregnant) block.push('No active pregnancy on record. IPTp-SP is for pregnant women only.');
            else {
                if (ctx.ga < 13) block.push('Gestational age ' + ctx.ga + ' weeks: SP starts in the 2nd trimester (13 weeks).');
                if (ctx.sulfa) block.push('Sulfa drug allergy recorded on this patient. SP is contraindicated - reinforce LLIN use.');
                if (ctx.hivPositive && ctx.cotrim) block.push('HIV-positive on cotrimoxazole prophylaxis. SP is contraindicated.');
                if (ctx.lastSPDays != null && ctx.lastSPDays < 28) warn.push('Only ' + ctx.lastSPDays + ' days since the last SP dose. Minimum gap is 4 weeks.');
            }
        }
        if (item.key === 'meb') {
            if (ctx.pregnant && ctx.ga < 13) block.push('First trimester: anti-helminthics must NOT be given.');
            if (ctx.lastMebDays != null && ctx.lastMebDays < 180) warn.push('Mebendazole was given ' + ctx.lastMebDays + ' days ago. Interval is 6 months.');
        }
        if (item.key === 'ifa' && ctx.anaemic) warn.push('Anaemia (Hb ' + ctx.hb + ' g/dL): dispense double dose until Hb rises to normal.');
        if (item.key === 'antid') warn.push('Confirm baby is Rhesus positive and that this is within 72 hours of delivery or abortion.');
        if (item.key === 'steroid') warn.push('Confirm gestational age 28+ weeks and delivery expected within 48 hours.');
        if (item.key === 'art') warn.push('Link to CTC immediately per PMTCT guidelines.');
        if (item.key === 'amox' || item.key === 'nitro') warn.push('Confirm ASB culture or gram stain result. Schedule test-of-cure one week after treatment.');
        if (item.key === 'benpen') warn.push('Confirm syphilis serology. Treat partner and screen newborn.');
        return { block: block, warn: warn };
    }

    // ==========================================
    // LISTS
    // ==========================================
    async function loadStatsAndStock() {
        var t = todayIso();
        var sRes = await sb.from('stock_items').select('*').order('name');
        stockCache = sRes.data || [];
        var low = stockCache.filter(function (i) { return i.quantity_on_hand <= i.reorder_level; });

        var dRes = await sb.from('dispensing').select('*', { count: 'exact', head: true }).gte('created_at', t + 'T00:00:00');
        var qRes = await sb.from('queue').select('*', { count: 'exact', head: true }).eq('current_station', 'Pharmacy').eq('status', 'Waiting');
        var aRes = await sb.from('anc_contacts').select('*', { count: 'exact', head: true }).eq('visit_date', t);

        document.getElementById('stat_dispensed').textContent = dRes.count || 0;
        document.getElementById('stat_queue').textContent = qRes.count || 0;
        document.getElementById('stat_seen').textContent = aRes.count || 0;
        document.getElementById('stat_low').textContent = low.length;

        var banner = document.getElementById('low_stock_banner');
        if (low.length) {
            banner.style.display = 'block';
            banner.innerHTML = 'LOW STOCK ALERT - order via R&R: ' + low.map(function (i) { return esc(i.name) + ' (' + i.quantity_on_hand + ' left)'; }).join('; ');
        } else {
            banner.style.display = 'none';
        }

        var body = document.getElementById('stock_body');
        body.innerHTML = stockCache.map(function (i) {
            var isLow = i.quantity_on_hand <= i.reorder_level;
            return '<tr>' +
                '<td style="font-weight:600;">' + esc(i.name) + '</td>' +
                '<td>' + esc(i.category || '-') + '</td>' +
                '<td style="font-weight:700;">' + i.quantity_on_hand + ' ' + esc(i.unit) + '</td>' +
                '<td>' + i.reorder_level + '</td>' +
                '<td>' + (isLow ? '<span class="chip bad">LOW</span>' : '<span class="chip ok">OK</span>') + '</td>' +
                '<td><button class="btn-check" onclick="receiveStock(\'' + i.id + '\')">Receive</button> ' +
                '<button class="btn-check" style="background:#64748b;" onclick="adjustStock(\'' + i.id + '\')">Adjust</button></td>' +
                '</tr>';
        }).join('');
    }

    async function loadQueue() {
        var res = await sb.from('queue')
            .select('id, diagnosis, prescription, created_at, patients(id, mother_name, phone_number)')
            .eq('current_station', 'Pharmacy').eq('status', 'Waiting')
            .order('created_at', { ascending: true });
        var box = document.getElementById('queue_list');
        if (!res.data || !res.data.length) {
            box.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px; font-style:italic;">No patients waiting at the pharmacy station right now.</p>';
            return;
        }
        box.innerHTML = res.data.map(function (q) {
            var p = q.patients || {};
            return '<div class="row-item"><div><h4>' + esc(p.mother_name) + '</h4><p>' + esc(p.phone_number) +
                (q.prescription ? ' &middot; Rx: ' + esc(q.prescription) : '') + (q.diagnosis ? ' &middot; Dx: ' + esc(q.diagnosis) : '') + '</p></div>' +
                '<button class="btn-check" onclick="openDispensing(\'' + p.id + '\', \'' + q.id + '\', null)">Open Dispensing Card</button></div>';
        }).join('');
    }

    async function loadActivity() {
        var t = todayIso();
        var a = await sb.from('anc_contacts')
            .select('id, contact_number, anc_enrollments(patient_id, patients(id, mother_name, phone_number))')
            .eq('visit_date', t).order('created_at', { ascending: false }).limit(30);
        var v = await sb.from('vitals')
            .select('id, patient_id, patients(id, mother_name, phone_number)')
            .gte('recorded_at', t + 'T00:00:00').order('recorded_at', { ascending: false }).limit(30);

        var map = {};
        (a.data || []).forEach(function (c) {
            var p = c.anc_enrollments && c.anc_enrollments.patients;
            if (p) map[p.id] = { p: p, src: 'ANC contact ' + c.contact_number, cid: c.id };
        });
        (v.data || []).forEach(function (row) {
            var p = row.patients;
            if (p && !map[p.id]) map[p.id] = { p: p, src: 'Vitals recorded', cid: null };
        });

        var items = Object.keys(map).map(function (k) { return map[k]; });
        var box = document.getElementById('activity_list');
        if (!items.length) {
            box.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px; font-style:italic;">No ANC contacts or vitals recorded today yet.</p>';
            return;
        }
        box.innerHTML = items.map(function (it) {
            return '<div class="row-item"><div><h4>' + esc(it.p.mother_name) + '</h4><p>' + esc(it.p.phone_number) + ' &middot; <span class="chip">' + esc(it.src) + '</span></p></div>' +
                '<button class="btn-check" onclick="openDispensing(\'' + it.p.id + '\', null, ' + (it.cid ? '\'' + it.cid + '\'' : 'null') + ')">Open Dispensing Card</button></div>';
        }).join('');
    }

    async function loadRecent() {
        var res = await sb.from('dispensing')
            .select('item_name, quantity, unit, created_at, dispensed_by, patients(mother_name)')
            .order('created_at', { ascending: false }).limit(15);
        var box = document.getElementById('recent_list');
        if (!res.data || !res.data.length) {
            box.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px; font-style:italic;">Nothing dispensed yet.</p>';
            return;
        }
        box.innerHTML = res.data.map(function (d) {
            return '<div class="row-item"><div><h4>' + esc(d.item_name) + ' &middot; ' + d.quantity + ' ' + esc(d.unit) + '</h4>' +
                '<p>' + esc(d.patients ? d.patients.mother_name : '') + ' &middot; ' + fmt(d.created_at) + ' &middot; by ' + esc(d.dispensed_by || '-') + '</p></div></div>';
        }).join('');
    }

    // ==========================================
    // SEARCH
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
        if (q.length < 2) { box.innerHTML = ''; return; }
        var safe = q.replace(/[,()]/g, '');
        var res = await sb.from('patients').select('id, mother_name, child_name, phone_number')
            .or('mother_name.ilike.%' + safe + '%,child_name.ilike.%' + safe + '%,phone_number.ilike.%' + safe + '%')
            .order('created_at', { ascending: false }).limit(8);
        if (!res.data || !res.data.length) {
            box.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:14px; font-style:italic;">No matches.</p>';
            return;
        }
        box.innerHTML = res.data.map(function (p) {
            return '<div class="row-item"><div><h4>' + esc(p.mother_name) + '</h4><p>' + esc(p.phone_number) + ' &middot; Child: ' + esc(p.child_name || 'antenatal') + '</p></div>' +
                '<button class="btn-check" onclick="openDispensing(\'' + p.id + '\', null, null)">Open Dispensing Card</button></div>';
        }).join('');
    }

    // ==========================================
    // DISPENSING CARD
    // ==========================================
    window.openDispensing = async function (patientId, queueId, contactId) {
        try {
            var pRes = await sb.from('patients').select('*').eq('id', patientId).single();
            if (pRes.error || !pRes.data) throw pRes.error;
            var p = pRes.data;

            var eRes = await sb.from('anc_enrollments').select('*').eq('patient_id', patientId).eq('status', 'active').order('enrolled_at', { ascending: false }).limit(1);
            var enr = (eRes.data && eRes.data[0]) || null;

            var cRes = await sb.from('anc_contacts').select('*').eq('anc_id', enr ? enr.id : '00000000-0000-0000-0000-000000000000').order('visit_date', { ascending: true });
            var contacts = cRes.data || [];

            var dRes = await sb.from('dispensing').select('item_key, item_name, created_at').eq('patient_id', patientId).gte('created_at', todayIso() + 'T00:00:00');
            var todayKeys = (dRes.data || []).map(function (d) { return d.item_key; });

            var hRes = await sb.from('dispensing').select('item_name, quantity, unit, created_at').eq('patient_id', patientId).order('created_at', { ascending: false }).limit(5);
            var history = hRes.data || [];

            // Clinical context
            var ctx = {
                pregnant: !!enr,
                ga: enr ? gaWeeks(enr.lmp_date, new Date()) : null,
                sulfa: !!p.sulfa_allergy,
                hivPositive: enr ? enr.hiv_status === 'Positive' : false,
                cotrim: enr ? !!enr.on_cotrimoxazole : false,
                hb: null,
                anaemic: false,
                lastSPDays: null,
                lastMebDays: null
            };
            for (var i = contacts.length - 1; i >= 0; i--) { if (contacts[i].hb != null) { ctx.hb = contacts[i].hb; break; } }
            if (ctx.hb == null && enr && enr.hb_baseline != null) ctx.hb = enr.hb_baseline;
            ctx.anaemic = ctx.hb != null && ctx.hb < 11;
            var spRows = contacts.filter(function (c) { return c.iptp_sp_dose > 0; });
            if (spRows.length) ctx.lastSPDays = Math.floor((new Date() - new Date(spRows[spRows.length - 1].visit_date)) / 86400000);
            var mebRows = contacts.filter(function (c) { return c.mebendazole_given; });
            if (mebRows.length) ctx.lastMebDays = Math.floor((new Date() - new Date(mebRows[mebRows.length - 1].visit_date)) / 86400000);

            var chips = '<span class="chip">' + esc(p.mother_name) + '</span>' +
                '<span class="chip">' + esc(p.phone_number) + '</span>' +
                (ctx.pregnant ? '<span class="chip ok">Pregnant &middot; GA ' + ctx.ga + ' wks</span>' : '<span class="chip">Not currently enrolled in ANC</span>') +
                (ctx.hivPositive ? '<span class="chip warn">HIV positive' + (ctx.cotrim ? ' &middot; on cotrimoxazole' : '') + '</span>' : '') +
                (ctx.hb != null ? '<span class="chip ' + (ctx.anaemic ? 'bad' : 'ok') + '">Hb ' + ctx.hb + (ctx.anaemic ? ' (anaemic)' : '') + '</span>' : '') +
                (ctx.sulfa ? '<span class="chip bad">Sulfa allergy</span>' : '');

            var allergyRow = '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin:12px 0;font-size:13px;">' +
                '<strong>Allergy verification (guideline: always ask about sulfa allergy before SP):</strong> ' +
                (p.sulfa_allergy ? '<span class="chip bad">Sulfa allergy RECORDED</span>' : '<span class="chip ok">No sulfa allergy recorded</span>') +
                ' <button class="btn-check" style="background:#64748b;" onclick="toggleSulfa(\'' + p.id + '\', ' + (!p.sulfa_allergy) + ')">' + (p.sulfa_allergy ? 'Clear allergy flag' : 'Record sulfa allergy') + '</button>' +
                (ctx.pregnant ? ' <button class="btn-check" style="background:#64748b;" onclick="toggleCotrim(\'' + enr.id + '\', ' + (!ctx.cotrim) + ')">' + (ctx.cotrim ? 'Not on cotrimoxazole' : 'On cotrimoxazole') + '</button>' : '') +
                '</div>';

            var options = CATALOG.map(function (c, idx) { return '<option value="' + idx + '">' + esc(c.name) + '</option>'; }).join('');

            var histHtml = history.length
                ? '<div style="margin-top:14px;font-size:12px;color:#64748b;"><strong>Already dispensed to this patient (last 5):</strong><br>' + history.map(function (h) { return esc(h.item_name) + ' (' + h.quantity + ' ' + esc(h.unit) + ', ' + fmt(h.created_at) + ')'; }).join('<br>') + '</div>'
                : '';

            var html = chips + allergyRow +
                '<div style="margin-bottom:10px;"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Select commodity to dispense</label>' +
                '<select id="disp_item" onchange="refreshChecks()" style="width:100%;padding:10px 12px;font-size:14px;border:1.5px solid #e2e8f0;border-radius:8px;background:#f8fafc;font-family:Inter,sans-serif;">' + options + '</select></div>' +
                '<div id="disp_checks" style="margin-bottom:10px;"></div>' +
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
                '<div><label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Quantity</label><input type="number" id="disp_qty" style="width:100%;padding:10px 12px;font-size:14px;border:1.5px solid #e2e8f0;border-radius:8px;"></div>' +
                '<div><label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Months supply (IFA)</label><input type="number" id="disp_months" style="width:100%;padding:10px 12px;font-size:14px;border:1.5px solid #e2e8f0;border-radius:8px;"></div>' +
                '</div>' +
                '<div style="margin-top:10px;"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Regimen / instructions</label><textarea id="disp_regimen" rows="3" style="width:100%;padding:10px 12px;font-size:13px;border:1.5px solid #e2e8f0;border-radius:8px;font-family:Inter,sans-serif;box-sizing:border-box;"></textarea></div>' +
                '<div id="disp_stock_line" style="margin:10px 0;font-size:12px;color:#64748b;"></div>' +
                '<div style="margin-top:6px;"><label style="font-size:13px;font-weight:600;display:block;margin-bottom:6px;">Pharmacist notes</label><input type="text" id="disp_notes" placeholder="Optional notes" style="width:100%;padding:10px 12px;font-size:13px;border:1.5px solid #e2e8f0;border-radius:8px;box-sizing:border-box;"></div>' +
                histHtml +
                '<button id="disp_save" class="btn-check" style="width:100%;padding:14px;font-size:15px;margin-top:16px;" onclick="saveDispensing(\'' + p.id + '\', ' + (queueId ? '\'' + queueId + '\'' : 'null') + ', ' + (contactId ? '\'' + contactId + '\'' : 'null') + ', ' + JSON.stringify(ctx).replace(/"/g, '&quot;') + ')">Dispense & Update Ledger</button>';

            showModal('Dispensing Card - ' + esc(p.mother_name), html);
            window.__PH_CTX = ctx;
            window.__PH_TODAY_KEYS = todayKeys;
            refreshChecks();
        } catch (err) {
            alert('Failed to open dispensing card: ' + err.message);
        }
    };

    window.refreshChecks = function () {
        var sel = document.getElementById('disp_item');
        if (!sel) return;
        var item = CATALOG[parseInt(sel.value, 10)];
        var ctx = window.__PH_CTX || {};
        var res = runChecks(item, ctx);
        var box = document.getElementById('disp_checks');
        var html = '';
        res.block.forEach(function (b) { html += '<div style="background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;border-radius:8px;padding:10px;font-size:13px;font-weight:600;margin-bottom:6px;">BLOCKED: ' + esc(b) + '</div>'; });
        res.warn.forEach(function (w) { html += '<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;border-radius:8px;padding:10px;font-size:13px;font-weight:600;margin-bottom:6px;">CAUTION: ' + esc(w) + '</div>'; });
        if ((window.__PH_TODAY_KEYS || []).indexOf(item.key) >= 0) {
            html += '<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;border-radius:8px;padding:10px;font-size:13px;font-weight:600;margin-bottom:6px;">CAUTION: this item was already dispensed to this patient today.</div>';
        }
        box.innerHTML = html;

        document.getElementById('disp_qty').value = item.qty;
        document.getElementById('disp_months').value = item.months || '';
        document.getElementById('disp_regimen').value = item.regimen;

        var stockLine = document.getElementById('disp_stock_line');
        var st = stockCache.filter(function (s) { return s.name === item.stock; })[0];
        if (st) {
            var enough = st.quantity_on_hand >= item.qty;
            stockLine.innerHTML = 'Stock: <strong>' + st.quantity_on_hand + ' ' + esc(st.unit) + '</strong> on hand (reorder at ' + st.reorder_level + '). ' +
                (enough ? '' : '<span style="color:#ef4444;font-weight:700;">Insufficient stock - this dispense will trigger an R&R order.</span>');
        } else {
            stockLine.innerHTML = 'No ledger entry mapped for this item.';
        }

        var saveBtn = document.getElementById('disp_save');
        saveBtn.disabled = res.block.length > 0;
        saveBtn.style.opacity = res.block.length > 0 ? '0.5' : '1';
        saveBtn.style.cursor = res.block.length > 0 ? 'not-allowed' : 'pointer';
    };

    window.saveDispensing = async function (patientId, queueId, contactId, ctx) {
        var sel = document.getElementById('disp_item');
        var item = CATALOG[parseInt(sel.value, 10)];
        var res = runChecks(item, ctx);
        if (res.block.length) { alert('Cannot dispense: ' + res.block.join(' ')); return; }
        if (res.warn.length) {
            if (!confirm('Guideline cautions:\n- ' + res.warn.join('\n- ') + '\n\nProceed with dispensing?')) return;
        }

        var qty = parseFloat(document.getElementById('disp_qty').value) || 0;
        if (qty <= 0) { alert('Enter a valid quantity.'); return; }

        var btn = document.getElementById('disp_save');
        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            var ins = await sb.from('dispensing').insert({
                patient_id: patientId,
                queue_id: queueId,
                anc_contact_id: contactId,
                item_key: item.key,
                item_name: item.name,
                regimen: document.getElementById('disp_regimen').value,
                quantity: qty,
                unit: item.unit,
                months_supply: parseFloat(document.getElementById('disp_months').value) || null,
                instructions: document.getElementById('disp_regimen').value,
                checks_passed: res.warn.length ? 'Warnings acknowledged: ' + res.warn.join(' | ') : 'All checks passed',
                notes: document.getElementById('disp_notes').value || null,
                dispensed_by: currentUser
            }).select().single();
            if (ins.error) throw ins.error;

            // Stock ledger sync
            var st = stockCache.filter(function (s) { return s.name === item.stock; })[0];
            if (st) {
                var newQty = st.quantity_on_hand - qty;
                await sb.from('stock_items').update({ quantity_on_hand: newQty, updated_at: new Date().toISOString() }).eq('id', st.id);
                await sb.from('stock_movements').insert({ item_id: st.id, change_qty: -qty, reason: 'Dispensed', reference_id: ins.data.id, created_by: currentUser });
            }

            // Close the queue loop when patient came via referral
            if (queueId) {
                await sb.from('queue').update({ status: 'Completed', current_station: 'Pharmacy' }).eq('id', queueId);
            }

            alert(item.name + ' dispensed and ledger updated.');
            closePhModal();
            loadStatsAndStock();
            loadQueue();
            loadActivity();
            loadRecent();
        } catch (err) {
            alert('Dispensing failed: ' + err.message);
            btn.disabled = false;
            btn.textContent = 'Dispense & Update Ledger';
        }
    };

    window.toggleSulfa = async function (patientId, value) {
        var res = await sb.from('patients').update({ sulfa_allergy: value }).eq('id', patientId);
        if (res.error) { alert('Update failed: ' + res.error.message); return; }
        openDispensing(patientId, null, null);
    };

    window.toggleCotrim = async function (enrId, value) {
        var res = await sb.from('anc_enrollments').update({ on_cotrimoxazole: value }).eq('id', enrId);
        if (res.error) { alert('Update failed: ' + res.error.message); return; }
        var e = await sb.from('anc_enrollments').select('patient_id').eq('id', enrId).single();
        if (e.data) openDispensing(e.data.patient_id, null, null);
    };

    // ==========================================
    // STOCK ACTIONS
    // ==========================================
    window.receiveStock = async function (itemId) {
        var q = prompt('Quantity received into store:');
        if (q === null || q === '') return;
        var qty = parseFloat(q);
        if (isNaN(qty) || qty <= 0) { alert('Invalid quantity.'); return; }
        var item = stockCache.filter(function (i) { return i.id === itemId; })[0];
        if (!item) return;
        await sb.from('stock_items').update({ quantity_on_hand: item.quantity_on_hand + qty, updated_at: new Date().toISOString() }).eq('id', itemId);
        await sb.from('stock_movements').insert({ item_id: itemId, change_qty: qty, reason: 'Receipt', created_by: currentUser });
        loadStatsAndStock();
    };

    window.adjustStock = async function (itemId) {
        var q = prompt('Adjustment quantity (use negative for losses/expiries, positive for corrections):');
        if (q === null || q === '') return;
        var qty = parseFloat(q);
        if (isNaN(qty) || qty === 0) { alert('Invalid adjustment.'); return; }
        var item = stockCache.filter(function (i) { return i.id === itemId; })[0];
        if (!item) return;
        await sb.from('stock_items').update({ quantity_on_hand: item.quantity_on_hand + qty, updated_at: new Date().toISOString() }).eq('id', itemId);
        await sb.from('stock_movements').insert({ item_id: itemId, change_qty: qty, reason: 'Adjustment', created_by: currentUser });
        loadStatsAndStock();
    };

    // ==========================================
    // LOGOUT + INIT
    // ==========================================
    window.handleLogout = async function () {
        await sb.auth.signOut();
        window.location.href = 'login.html';
    };

    async function initPharmacy() {
        try {
            var sess = await sb.auth.getSession();
            if (!sess.data.session) { window.location.href = 'login.html'; return; }
            var prof = await sb.from('profiles').select('full_name, role').eq('id', sess.data.session.user.id).single();
            if (!prof.data || ['pharmacist', 'nurse', 'doctor', 'admin'].indexOf(prof.data.role) === -1) {
                window.location.href = 'login.html'; return;
            }
            currentUser = prof.data.full_name;
            document.getElementById('user_info').textContent = prof.data.role.charAt(0).toUpperCase() + prof.data.role.slice(1) + ': ' + prof.data.full_name;
            document.getElementById('loading_message').style.display = 'none';
            document.getElementById('pharmacy_content').style.display = 'block';

            setupSearch();
            loadStatsAndStock();
            loadQueue();
            loadActivity();
            loadRecent();
        } catch (err) {
            console.error('[Pharmacy] Init error:', err);
            document.getElementById('loading_message').innerHTML = '<p style="color: var(--danger); font-weight: 600;">Error loading pharmacy. Refresh the page.</p>';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPharmacy);
    } else {
        initPharmacy();
    }
})();
