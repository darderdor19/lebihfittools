// State and Initialization
let currentChart = null;
let currentMacroChart = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

const GAS_URL = "https://script.google.com/macros/s/AKfycbwJKz3DwDQ7RC--c3yah7OviAW5ej41q2hrc9Rwwef_ccBbFWf-LL0lyEswej-mJkO2Rw/exec";
let tempAuthEmail = "";
let tempAuthName = "";

async function initApp() {
    const profile = getProfile();
    const apiKey = getApiKey();
    const visionKey = getVisionKey();
    const authUser = getAuthUser();
    
    if (apiKey) document.getElementById('apiKeyInput').value = apiKey;
    if (visionKey) document.getElementById('visionKeyInput').value = visionKey;
    if (apiKey || visionKey) updateApiStatus(true);

    if (!authUser) {
        document.getElementById('authOverlay').classList.remove('hidden');
    } else {
        // Sync Firebase jika sudah login
        await syncFirebaseToLocal();
        
        // Panggil getProfile lagi karena mungkin baru ketarik dari Firebase
        const updatedProfile = getProfile();
        
        if (!updatedProfile) {
            document.getElementById('onboarding').classList.remove('hidden');
        } else {
            document.getElementById('app').classList.remove('hidden');
            renderProfileDisplay();
            
            // Check url params for deep linking
            const urlParams = new URLSearchParams(window.location.search);
            const pageParam = urlParams.get('page');
            const rangeParam = urlParams.get('range');
            const fromParam = urlParams.get('from');
            const toParam = urlParams.get('to');
            
            if (pageParam === 'history') {
                showPage('history');
                if (fromParam && toParam) {
                    document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
                    document.getElementById('pCustom').classList.add('active');
                    document.getElementById('customDateRange').classList.remove('hidden');
                    document.getElementById('dateFrom').value = fromParam;
                    document.getElementById('dateTo').value = toParam;
                    loadHistoryData(new Date(fromParam.replace(/-/g, '/')), new Date(toParam.replace(/-/g, '/')));
                } else if (rangeParam) {
                    setPeriod(rangeParam);
                } else {
                    setPeriod('7');
                }
            } else {
                showPage('dashboard');
            }
        }
    }

    // Initialize Lucide icons if available
    if (window.lucide) {
        lucide.createIcons();
    }
}

// ===== AUTHENTICATION =====
async function requestOTP() {
    const email = document.getElementById('authEmail').value.trim();
    const name = document.getElementById('authName').value.trim();
    
    if (!name) {
        showToast("Masukkan nama panggilan lu bro", "error");
        return;
    }
    if (!email || !email.includes('@')) {
        showToast("Masukkan email yang valid", "error");
        return;
    }
    
    if (GAS_URL === "URL_GAS_LU_DISINI") {
        showToast("Setup URL Google Apps Script belum dilakukan!", "error");
        return;
    }

    const btn = document.getElementById('btnRequestOtp');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Mengirim...';
    btn.disabled = true;

    try {
        console.log('[OTP] Sending requestOTP to:', GAS_URL);
        const res = await fetch(GAS_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'requestOTP', email: email, name: name })
        });
        
        console.log('[OTP] Response status:', res.status, res.statusText);
        const rawText = await res.text();
        console.log('[OTP] Raw response:', rawText);
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch(parseErr) {
            console.error('[OTP] JSON parse failed:', parseErr, 'Raw:', rawText);
            showToast("Server error: respons bukan JSON. Cek console.", "error");
            return;
        }
        
        console.log('[OTP] Parsed response:', data);
        
        if (data.success) {
            tempAuthEmail = email;
            tempAuthName = name;
            document.getElementById('displayEmail').innerText = email;
            document.getElementById('authStep1').classList.add('hidden');
            document.getElementById('authStep2').classList.remove('hidden');
            showToast("Kode OTP terkirim!", "success");
        } else {
            showToast(data.error || "Gagal mengirim OTP", "error");
        }
    } catch (error) {
        console.error('[OTP] Fetch error:', error);
        showToast("Network error: " + error.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function verifyOTP() {
    const otp = document.getElementById('authOtp').value.trim();
    if (!otp || otp.length < 6) {
        showToast("Masukkan 6 digit OTP", "error");
        return;
    }

    const btn = document.getElementById('btnVerifyOtp');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Verifikasi...';
    btn.disabled = true;

    try {
        console.log('[OTP] Sending verifyOTP to:', GAS_URL);
        const res = await fetch(GAS_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'verifyOTP', email: tempAuthEmail, otp: otp })
        });
        
        console.log('[OTP] Verify response status:', res.status, res.statusText);
        const rawText = await res.text();
        console.log('[OTP] Verify raw response:', rawText);
        
        let data;
        try {
            data = JSON.parse(rawText);
        } catch(parseErr) {
            console.error('[OTP] Verify JSON parse failed:', parseErr, 'Raw:', rawText);
            showToast("Server error: respons bukan JSON. Cek console.", "error");
            return;
        }
        
        console.log('[OTP] Verify parsed response:', data);
        
        if (data.success) {
            setAuthUser(data.data.email, data.data.name || tempAuthName);
            document.getElementById('authOverlay').classList.add('hidden');
            showToast("Login Berhasil! Menyinkronkan data...", "info");
            
            await syncFirebaseToLocal();
            showToast("Sinkronisasi Selesai!", "success");
            
            // Check if profile exists
            if (!getProfile()) {
                document.getElementById('onboarding').classList.remove('hidden');
            } else {
                document.getElementById('app').classList.remove('hidden');
                renderProfileDisplay();
                showPage('dashboard');
            }
        } else {
            showToast(data.error || "OTP Salah", "error");
        }
    } catch (error) {
        console.error('[OTP] Verify fetch error:', error);
        showToast("Network error: " + error.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

function resetAuth() {
    tempAuthEmail = "";
    tempAuthName = "";
    document.getElementById('authStep2').classList.add('hidden');
    document.getElementById('authStep1').classList.remove('hidden');
    document.getElementById('authOtp').value = "";
}


// Navigation
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(`page-${pageId}`).classList.add('active');
    const navBtn = document.querySelector(`.nav-btn[data-page="${pageId}"]`);
    if (navBtn) navBtn.classList.add('active');
    
    if (window.innerWidth <= 768) {
        closeSidebar();
    }

    // Page specific rendering
    if (pageId === 'dashboard') renderDashboard();
    if (pageId === 'history') {
        setPeriod('7');
    }
    if (pageId === 'activity') {
        renderTodayActivities();
        if (window.lucide) lucide.createIcons();
    }
    if (pageId === 'settings') checkTelegramStatus();
    if (pageId === 'calculator') {
        prefillRecalcForm();
    }
}

// ============================================================
// KEGIATAN HARIAN — Activity & Sleep Logging
// ============================================================

// --- Tab Switching ---
function switchActivityTab(tab) {
    document.querySelectorAll('.act-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('actPanelSport').style.display = tab === 'sport' ? '' : 'none';
    document.getElementById('actPanelSleep').style.display = tab === 'sleep' ? '' : 'none';
    document.getElementById(tab === 'sport' ? 'actTabSport' : 'actTabSleep').classList.add('active');
}

function switchWorkoutTab(tab) {
    document.querySelectorAll('.workout-sub-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('wPanelWorkout').style.display = tab === 'workout' ? '' : 'none';
    document.getElementById('wPanelGym').style.display = tab === 'gym' ? '' : 'none';
    document.getElementById(tab === 'workout' ? 'wTabWorkout' : 'wTabGym').classList.add('active');
}

function switchHistoryMainTab(tab) {
    document.querySelectorAll('.history-main-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('histPanelFood').style.display = tab === 'food' ? '' : 'none';
    document.getElementById('histPanelActivity').style.display = tab === 'activity' ? '' : 'none';
    document.getElementById(tab === 'food' ? 'histTabFood' : 'histTabActivity').classList.add('active');
    if (tab === 'activity') renderActivityHistory();
}

// --- Workout Functions ---
let _workoutSession = []; // Current workout session buffer
let _workoutSetCount = 1;

function selectWorkoutPreset(name) {
    document.getElementById('workoutExName').value = name;
    document.getElementById('workoutExName').focus();
}

function addWorkoutSet() {
    _workoutSetCount++;
    const container = document.getElementById('workoutSetsContainer');
    const row = document.createElement('div');
    row.className = 'workout-set-row';
    row.id = `workoutSet_${_workoutSetCount}`;
    row.innerHTML = `
        <div class="set-label">Set ${_workoutSetCount}</div>
        <input type="number" class="set-input" placeholder="Reps" min="1" id="wReps_${_workoutSetCount}">
        <button class="set-remove-btn" onclick="removeWorkoutSet(${_workoutSetCount})"><i data-lucide="x" style="width:14px;height:14px;"></i></button>`;
    container.appendChild(row);
    if (window.lucide) lucide.createIcons();
    // Show remove button on set 1 if >1 sets
    if (_workoutSetCount > 1) {
        const firstRemove = document.querySelector('#workoutSet_1 .set-remove-btn');
        if (firstRemove) { firstRemove.style.opacity = '1'; firstRemove.style.pointerEvents = 'auto'; }
    }
}

function removeWorkoutSet(n) {
    const el = document.getElementById(`workoutSet_${n}`);
    if (el) el.remove();
    // Re-label remaining sets
    const rows = document.querySelectorAll('#workoutSetsContainer .workout-set-row');
    rows.forEach((row, i) => {
        row.querySelector('.set-label').textContent = `Set ${i + 1}`;
    });
    if (rows.length === 1) {
        const firstRemove = rows[0].querySelector('.set-remove-btn');
        if (firstRemove) { firstRemove.style.opacity = '0'; firstRemove.style.pointerEvents = 'none'; }
    }
}

function addWorkoutExercise() {
    const name = document.getElementById('workoutExName').value.trim();
    if (!name) { showToast('Masukkan nama gerakan dulu', 'error'); return; }
    // Collect per-set reps
    const setRows = document.querySelectorAll('#workoutSetsContainer .workout-set-row');
    const sets = [];
    setRows.forEach((row, i) => {
        const repsEl = row.querySelector('.set-input');
        sets.push({ set: i + 1, reps: parseInt(repsEl.value) || 0 });
    });
    _workoutSession.push({ name, sets });
    renderWorkoutSessionList();
    // Reset inputs
    document.getElementById('workoutExName').value = '';
    document.querySelectorAll('.set-input').forEach(el => el.value = '');
}

// ===== CALORIE BURN CALCULATION =====
// Formula: kcal = MET × weightKg × durationHours
// MET values per intensity
const MET_WORKOUT = { low: 3.5, medium: 5.5, high: 8.0 };
const MET_GYM     = { low: 3.0, medium: 5.0, high: 6.5 };
// Ratio of energy from fat/carb/protein during exercise
const BURN_RATIO  = { fat: 0.30, carb: 0.60, protein: 0.10 }; // kcal proportion
// Fat: 9 kcal/g, Carb: 4 kcal/g, Protein: 4 kcal/g

function calcBurnedCalories(met, durationMin) {
    const profile = getProfile() || {};
    const weight = parseFloat(profile.bb) || 70;
    const kcal = met * weight * (durationMin / 60);
    const fatG    = (kcal * BURN_RATIO.fat) / 9;
    const carbG   = (kcal * BURN_RATIO.carb) / 4;
    const proteinG= (kcal * BURN_RATIO.protein) / 4;
    return { kcal: Math.round(kcal), fatG: fatG.toFixed(1), carbG: carbG.toFixed(1), proteinG: proteinG.toFixed(1) };
}

function renderBurnPreview(containerId, burn, durationMin, intensity) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!burn || !durationMin) { el.innerHTML = ''; return; }
    el.innerHTML = `
        <div class="calburn-main">
            <span class="calburn-kcal">${burn.kcal}</span>
            <span class="calburn-unit">kcal terbakar</span>
        </div>
        <div class="calburn-label">🔥 Estimasi ${durationMin} menit · intensitas ${intensity === 'low' ? 'ringan' : intensity === 'medium' ? 'sedang' : 'tinggi'}</div>
        <div class="calburn-macros">
            <span class="calburn-macro-badge fat">🧴 Lemak ${burn.fatG}g</span>
            <span class="calburn-macro-badge carb">⚡ Karbo ${burn.carbG}g</span>
            <span class="calburn-macro-badge protein">💪 Protein ${burn.proteinG}g</span>
        </div>
        <div class="calburn-note">*Estimasi berdasarkan berat badan ${(getProfile()||{}).bb||70}kg. Nilai aktual bervariasi tergantung kondisi tubuh.</div>`;
}

function previewWorkoutBurn() {
    const dur = parseFloat(document.getElementById('workoutDuration').value) || 0;
    const intensity = document.getElementById('workoutIntensity').value;
    if (!dur) { document.getElementById('workoutBurnPreview').innerHTML = ''; return; }
    const burn = calcBurnedCalories(MET_WORKOUT[intensity], dur);
    renderBurnPreview('workoutBurnPreview', burn, dur, intensity);
}

function previewGymBurn() {
    const dur = parseFloat(document.getElementById('gymDuration').value) || 0;
    const intensity = document.getElementById('gymIntensity').value;
    if (!dur) { document.getElementById('gymBurnPreview').innerHTML = ''; return; }
    const burn = calcBurnedCalories(MET_GYM[intensity], dur);
    renderBurnPreview('gymBurnPreview', burn, dur, intensity);
}

function renderWorkoutSessionList() {
    const list = document.getElementById('workoutSessionList');
    const saveBtn = document.getElementById('btnSaveWorkout');
    const burnSection = document.getElementById('workoutBurnSection');
    if (_workoutSession.length === 0) {
        list.innerHTML = '';
        saveBtn.style.display = 'none';
        if (burnSection) burnSection.style.display = 'none';
        return;
    }
    saveBtn.style.display = 'block';
    if (burnSection) burnSection.style.display = 'block';
    list.innerHTML = `<div style="font-size:0.8rem;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Sesi Workout (${_workoutSession.length} gerakan)</div>` +
        _workoutSession.map((ex, idx) => `
            <div class="workout-exercise-item">
                <div>
                    <div class="exercise-item-name">${ex.name}</div>
                    <div class="exercise-item-sets">
                        ${ex.sets.map(s => `<span class="exercise-set-badge">Set ${s.set}: ${s.reps} reps</span>`).join('')}
                    </div>
                </div>
                <button class="exercise-remove-btn" onclick="removeWorkoutExercise(${idx})"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
            </div>`).join('');
    if (window.lucide) lucide.createIcons();
    // Refresh burn preview
    previewWorkoutBurn();
}

function removeWorkoutExercise(idx) {
    _workoutSession.splice(idx, 1);
    renderWorkoutSessionList();
}

function saveWorkoutSession() {
    if (_workoutSession.length === 0) { showToast('Tambah minimal 1 gerakan', 'error'); return; }
    const durationMin = parseFloat(document.getElementById('workoutDuration').value) || 0;
    const intensity = document.getElementById('workoutIntensity')?.value || 'medium';
    const burn = durationMin > 0 ? calcBurnedCalories(MET_WORKOUT[intensity], durationMin) : null;
    const item = {
        id: uid(), date: todayKey(), type: 'workout',
        exercises: [..._workoutSession],
        durationMin: durationMin || null,
        intensity: durationMin ? intensity : null,
        burn: burn,
        createdAt: Date.now()
    };
    saveActivity(item);
    _workoutSession = [];
    _workoutSetCount = 1;
    // Reset UI
    document.getElementById('workoutSessionList').innerHTML = '';
    document.getElementById('btnSaveWorkout').style.display = 'none';
    document.getElementById('workoutBurnSection').style.display = 'none';
    document.getElementById('workoutDuration').value = '';
    document.getElementById('workoutBurnPreview').innerHTML = '';
    document.getElementById('workoutSetsContainer').innerHTML = `
        <div class="workout-set-row" id="workoutSet_1">
            <div class="set-label">Set 1</div>
            <input type="number" class="set-input" placeholder="Reps" min="1" id="wReps_1">
            <button class="set-remove-btn" onclick="removeWorkoutSet(1)" style="opacity:0;pointer-events:none;"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
        </div>`;
    if (window.lucide) lucide.createIcons();
    renderTodayActivities();
    renderDashboardActivityCard();
    const burnMsg = burn ? ` (Estimasi ${burn.kcal} kcal terbakar)` : '';
    showToast(`Sesi workout disimpan!${burnMsg}`, 'success');
}

// --- Gym Functions ---
let _gymSelectedMuscles = {}; // { muscle: [{ name, sets: [{set, reps}] }] }

function toggleGymMuscle(muscle) {
    const chip = document.querySelector(`.muscle-chip[data-muscle="${muscle}"]`);
    if (_gymSelectedMuscles[muscle]) {
        delete _gymSelectedMuscles[muscle];
        if (chip) chip.classList.remove('active');
    } else {
        _gymSelectedMuscles[muscle] = [{ name: '', sets: [{ set: 1, reps: 0 }] }];
        if (chip) chip.classList.add('active');
    }
    renderGymMuscleInputs();
    const hasMuscles = Object.keys(_gymSelectedMuscles).length > 0;
    document.getElementById('btnSaveGym').style.display = hasMuscles ? 'block' : 'none';
    const burnSection = document.getElementById('gymBurnSection');
    if (burnSection) burnSection.style.display = hasMuscles ? 'block' : 'none';
}

const MUSCLE_LABELS = { chest:'Chest', back:'Back', shoulder:'Shoulder', bicep:'Bicep', tricep:'Tricep', forearm:'Forearm', abs:'Abs', traps:'Traps', leg:'Leg' };

function renderGymMuscleInputs() {
    const container = document.getElementById('gymMuscleInputs');
    const muscles = Object.keys(_gymSelectedMuscles);
    if (muscles.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = muscles.map(muscle => {
        const variations = _gymSelectedMuscles[muscle];
        return `<div class="gym-muscle-section" id="gymSection_${muscle}">
            <div class="gym-muscle-title">${MUSCLE_LABELS[muscle] || muscle}</div>
            ${variations.map((v, vi) => `
                <div class="gym-variation-row" id="gymVar_${muscle}_${vi}">
                    <input type="text" class="gym-variation-input" placeholder="Nama gerakan (mis: Bench Press)" value="${v.name}" oninput="updateGymVarName('${muscle}',${vi},this.value)">
                    <button class="gym-remove-var" onclick="removeGymVariation('${muscle}',${vi})" title="Hapus variasi">✕</button>
                </div>
                <div class="gym-sets-per-var">
                    ${v.sets.map((s, si) => `
                    <div class="gym-per-set-row">
                        <span class="gym-per-set-label">Set ${si + 1}</span>
                        <input type="number" class="set-input" style="max-width:80px;" placeholder="Reps" value="${s.reps || ''}" min="1" oninput="updateGymSetReps('${muscle}',${vi},${si},this.value)">
                        ${si > 0 ? `<button class="gym-remove-set" onclick="removeGymSet('${muscle}',${vi},${si})" title="Hapus set">✕</button>` : ''}
                    </div>`).join('')}
                    <button class="gym-add-set-btn" onclick="addGymSet('${muscle}',${vi})">+ Set</button>
                </div>`).join('')}
            <button class="gym-add-var-btn" onclick="addGymVariation('${muscle}')">+ Tambah Variasi Gerakan</button>
        </div>`;
    }).join('');
}

function updateGymVarName(muscle, vi, val) {
    if (_gymSelectedMuscles[muscle] && _gymSelectedMuscles[muscle][vi]) _gymSelectedMuscles[muscle][vi].name = val;
}
function updateGymSetReps(muscle, vi, si, val) {
    if (_gymSelectedMuscles[muscle]?.[vi]?.sets?.[si]) _gymSelectedMuscles[muscle][vi].sets[si].reps = parseInt(val) || 0;
}
function addGymVariation(muscle) {
    if (!_gymSelectedMuscles[muscle]) return;
    _gymSelectedMuscles[muscle].push({ name: '', sets: [{ set: 1, reps: 0 }] });
    renderGymMuscleInputs();
}
function removeGymVariation(muscle, vi) {
    if (_gymSelectedMuscles[muscle]) _gymSelectedMuscles[muscle].splice(vi, 1);
    if (_gymSelectedMuscles[muscle] && _gymSelectedMuscles[muscle].length === 0) {
        delete _gymSelectedMuscles[muscle];
        document.querySelector(`.muscle-chip[data-muscle="${muscle}"]`)?.classList.remove('active');
    }
    renderGymMuscleInputs();
    document.getElementById('btnSaveGym').style.display = Object.keys(_gymSelectedMuscles).length > 0 ? 'block' : 'none';
}
function addGymSet(muscle, vi) {
    if (!_gymSelectedMuscles[muscle]?.[vi]) return;
    const setNum = _gymSelectedMuscles[muscle][vi].sets.length + 1;
    _gymSelectedMuscles[muscle][vi].sets.push({ set: setNum, reps: 0 });
    renderGymMuscleInputs();
}
function removeGymSet(muscle, vi, si) {
    if (!_gymSelectedMuscles[muscle]?.[vi]) return;
    _gymSelectedMuscles[muscle][vi].sets.splice(si, 1);
    // Re-number sets
    _gymSelectedMuscles[muscle][vi].sets.forEach((s, i) => s.set = i + 1);
    renderGymMuscleInputs();
}

function saveGymSession() {
    const muscles = Object.keys(_gymSelectedMuscles);
    if (muscles.length === 0) { showToast('Pilih minimal 1 otot', 'error'); return; }
    const muscleData = muscles.map(muscle => ({
        muscle,
        variations: _gymSelectedMuscles[muscle].map(v => ({
            name: v.name || '(tanpa nama)',
            sets: v.sets
        }))
    }));
    const durationMin = parseFloat(document.getElementById('gymDuration').value) || 0;
    const intensity = document.getElementById('gymIntensity')?.value || 'medium';
    const burn = durationMin > 0 ? calcBurnedCalories(MET_GYM[intensity], durationMin) : null;
    const item = {
        id: uid(), date: todayKey(), type: 'gym',
        muscles: muscleData,
        durationMin: durationMin || null,
        intensity: durationMin ? intensity : null,
        burn: burn,
        createdAt: Date.now()
    };
    saveActivity(item);
    // Reset gym state
    _gymSelectedMuscles = {};
    document.querySelectorAll('.muscle-chip').forEach(c => c.classList.remove('active'));
    document.getElementById('gymMuscleInputs').innerHTML = '';
    document.getElementById('btnSaveGym').style.display = 'none';
    document.getElementById('gymBurnSection').style.display = 'none';
    document.getElementById('gymDuration').value = '';
    document.getElementById('gymBurnPreview').innerHTML = '';
    renderTodayActivities();
    renderDashboardActivityCard();
    const burnMsg = burn ? ` (Estimasi ${burn.kcal} kcal terbakar)` : '';
    showToast(`Sesi gym disimpan!${burnMsg}`, 'success');
}

// --- Sleep Functions ---
let _sleepType = 'malam';
let _sleepQuality = 'lelap';
let _sleepHours = 0;

function calcSleepDuration() {
    const start = document.getElementById('sleepStart').value;
    const end = document.getElementById('sleepEnd').value;
    if (!start || !end) return;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60;
    const hours = diff / 60;
    _sleepHours = hours;
    document.getElementById('sleepDurationDisplay').textContent = `⏱ Durasi: ${Math.floor(hours)}j ${Math.round((hours % 1) * 60)}m`;
    document.getElementById('sleepHoursManual').value = hours.toFixed(1);
}

function updateSleepDurationFromManual() {
    const val = parseFloat(document.getElementById('sleepHoursManual').value) || 0;
    _sleepHours = val;
    document.getElementById('sleepDurationDisplay').textContent = val > 0 ? `⏱ Durasi: ${Math.floor(val)}j ${Math.round((val % 1) * 60)}m` : '';
}

function selectSleepType(type) {
    _sleepType = type;
    document.querySelectorAll('.sleep-type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.type === type);
    });
}

function selectSleepQuality(quality) {
    _sleepQuality = quality;
    document.querySelectorAll('.sleep-quality-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.quality === quality);
    });
}

function saveSleepLog() {
    const hours = _sleepHours || parseFloat(document.getElementById('sleepHoursManual').value) || 0;
    if (!hours || hours <= 0) { showToast('Isi durasi tidur dulu', 'error'); return; }
    const item = {
        id: uid(), date: todayKey(), type: 'sleep',
        hours, sleepType: _sleepType, quality: _sleepQuality,
        startTime: document.getElementById('sleepStart').value || '',
        endTime: document.getElementById('sleepEnd').value || '',
        createdAt: Date.now()
    };
    saveActivity(item);
    // Reset
    document.getElementById('sleepStart').value = '';
    document.getElementById('sleepEnd').value = '';
    document.getElementById('sleepHoursManual').value = '';
    document.getElementById('sleepDurationDisplay').textContent = '';
    _sleepHours = 0;
    renderTodayActivities();
    showToast('Data tidur berhasil disimpan!', 'success');
}

// --- Render Today Activities ---
function renderTodayActivities() {
    const activities = getTodayActivities();
    const container = document.getElementById('todayActivitiesList');
    if (!container) return;
    if (activities.length === 0) {
        container.innerHTML = `<p style="color:var(--text2);font-size:0.9rem;">Belum ada kegiatan tercatat hari ini.</p>`;
        return;
    }
    container.innerHTML = activities.map(act => {
        let detail = '';
        let typeLabel = act.type;
        let burnBadge = '';

        if (act.burn && (act.type === 'workout' || act.type === 'gym')) {
            burnBadge = `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center;">
                <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:rgba(0,255,204,0.08);border:1px solid rgba(0,255,204,0.3);border-radius:12px;font-size:0.75rem;font-weight:700;color:var(--success);">
                    <i data-lucide="flame" style="width:12px;height:12px;"></i> ${act.burn.kcal} kcal terbakar
                </span>
                <span style="font-size:0.72rem;color:#ffab40;display:inline-flex;align-items:center;gap:3px;"><i data-lucide="droplet" style="width:11px;height:11px;"></i> Lemak ${act.burn.fatG}g</span>
                <span style="font-size:0.72rem;color:#ffd60a;display:inline-flex;align-items:center;gap:3px;"><i data-lucide="zap" style="width:11px;height:11px;"></i> Karbo ${act.burn.carbG}g</span>
                <span style="font-size:0.72rem;color:var(--accent2);display:inline-flex;align-items:center;gap:3px;"><i data-lucide="dumbbell" style="width:11px;height:11px;"></i> Protein ${act.burn.proteinG}g</span>
                ${act.durationMin ? `<span style="font-size:0.7rem;color:var(--text3);display:inline-flex;align-items:center;gap:3px;"><i data-lucide="clock" style="width:11px;height:11px;"></i> ${act.durationMin} menit</span>` : ''}
            </div>`;
        }

        if (act.type === 'workout') {
            detail = act.exercises.map(ex =>
                `<b>${ex.name}</b> — ${ex.sets.map(s => `Set ${s.set}: ${s.reps} reps`).join(', ')}`
            ).join('<br>');
            typeLabel = 'Workout';
        } else if (act.type === 'gym') {
            detail = act.muscles.map(m =>
                `<b>${MUSCLE_LABELS[m.muscle] || m.muscle}:</b> ${m.variations.map(v => v.name || '(tanpa nama)').join(', ')}`
            ).join('<br>');
            typeLabel = 'Gym';
        } else if (act.type === 'sleep') {
            const sleepTypeLabel = { 
                malam: '<i data-lucide="moon" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:3px;"></i> Tidur Malam', 
                siang: '<i data-lucide="sun" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:3px;"></i> Tidur Siang', 
                sebentar: '<i data-lucide="zap" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:3px;"></i> Tidur Sebentar' 
            };
            const qualityLabel = { 
                lelap: '<i data-lucide="smile" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:3px;"></i> Lelap', 
                biasa: '<i data-lucide="meh" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:3px;"></i> Biasa', 
                kurang: '<i data-lucide="frown" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:3px;"></i> Kurang Nyenyak' 
            };
            detail = `<b>${Math.floor(act.hours)}j ${Math.round((act.hours % 1) * 60)}m</b> — ${sleepTypeLabel[act.sleepType] || act.sleepType} · ${qualityLabel[act.quality] || act.quality}`;
            typeLabel = 'Tidur';
        }
        return `<div class="activity-log-item">
            <div class="activity-log-header">
                <span class="activity-log-type ${act.type}">${typeLabel}</span>
                <button class="activity-log-delete" onclick="deleteActivity('${act.id}');renderTodayActivities();renderDashboardActivityCard();" title="Hapus">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                </button>
            </div>
            <div class="activity-log-detail">${detail}${burnBadge}</div>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

// --- Render Activity History ---
function renderActivityHistory() {
    const fromEl = document.getElementById('dateFrom');
    const toEl = document.getElementById('dateTo');
    if (!fromEl || !toEl) return;
    const from = new Date(fromEl.value);
    const to = new Date(toEl.value);
    const allActs = getActivitiesRange(from, to);
    const summaryEl = document.getElementById('activityHistorySummary');
    const listEl = document.getElementById('activityHistoryList');
    if (!summaryEl || !listEl) return;
    // Compute summary stats
    let totalWorkoutSessions = 0, totalGymSessions = 0, totalSleepEntries = 0, totalSleepHours = 0;
    const allDates = Object.keys(allActs).sort().reverse();
    allDates.forEach(date => {
        allActs[date].forEach(a => {
            if (a.type === 'workout') totalWorkoutSessions++;
            if (a.type === 'gym') totalGymSessions++;
            if (a.type === 'sleep') { totalSleepEntries++; totalSleepHours += a.hours || 0; }
        });
    });
    const avgSleep = totalSleepEntries > 0 ? (totalSleepHours / totalSleepEntries).toFixed(1) : '--';
    summaryEl.innerHTML = `
        <div class="act-stat-card"><div class="act-stat-value">${totalWorkoutSessions}</div><div class="act-stat-label">Sesi Workout</div></div>
        <div class="act-stat-card"><div class="act-stat-value">${totalGymSessions}</div><div class="act-stat-label">Sesi Gym</div></div>
        <div class="act-stat-card"><div class="act-stat-value">${totalSleepHours.toFixed(1)}j</div><div class="act-stat-label">Total Tidur</div></div>
        <div class="act-stat-card"><div class="act-stat-value">${avgSleep}j</div><div class="act-stat-label">Rata-rata Tidur/Hari</div></div>`;
    // Build list by date
    const datesWithActs = allDates.filter(d => allActs[d].length > 0);
    if (datesWithActs.length === 0) {
        listEl.innerHTML = `<p style="color:var(--text2);font-size:0.9rem;padding:16px 0;">Tidak ada kegiatan di periode ini.</p>`;
        return;
    }
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    listEl.innerHTML = datesWithActs.map(date => {
        const [y, m, d] = date.split('-');
        const acts = allActs[date];
        const actHtml = acts.map(act => {
            let detail = '';
            let badge = act.type;
            if (act.type === 'workout') {
                detail = act.exercises.map(ex => `${ex.name} (${ex.sets.length} set)`).join(' · ');
                badge = '<i data-lucide="zap" style="width:12px;height:12px;vertical-align:text-bottom;margin-right:3px;"></i> Workout';
            } else if (act.type === 'gym') {
                detail = act.muscles.map(m => `${MUSCLE_LABELS[m.muscle] || m.muscle}: ${m.variations.map(v=>v.name||'?').join(', ')}`).join(' | ');
                badge = '<i data-lucide="dumbbell" style="width:12px;height:12px;vertical-align:text-bottom;margin-right:3px;"></i> Gym';
            } else if (act.type === 'sleep') {
                detail = `${Math.floor(act.hours)}j ${Math.round((act.hours%1)*60)}m — ${act.sleepType} — ${act.quality}`;
                badge = '<i data-lucide="moon" style="width:12px;height:12px;vertical-align:text-bottom;margin-right:3px;"></i> Tidur';
            }
            return `<div style="padding:6px 10px;background:var(--bg);border-radius:6px;margin-top:6px;font-size:0.82rem;">
                <span style="font-size:0.7rem;font-weight:700;color:var(--accent2);text-transform:uppercase;display:inline-flex;align-items:center;gap:3px;">${badge}</span><br>
                <span style="color:var(--text2);">${detail}</span>
            </div>`;
        }).join('');
        return `<div class="history-item" style="padding:12px 0;border-bottom:1px solid var(--border);">
            <div style="font-weight:700;font-size:0.9rem;">${parseInt(d)} ${months[parseInt(m)-1]} ${y}</div>
            ${actHtml}
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

// --- History Comprehensive AI Analysis (food + activity + sleep) ---
// --- History Comprehensive AI Analysis (food + activity + sleep) ---
async function updateHistoryAIAnalysis(foodStats, fromDate, toDate) {
    const el = document.getElementById('historyAiContent');
    if (!el) return;
    const apiKey = localStorage.getItem('lf_apikey');
    if (!apiKey) {
        el.innerHTML = `<p style="color:var(--text2);font-size:0.85rem;">Set API Key di Settings untuk analisis AI komprehensif.</p>`;
        return;
    }

    const email = localStorage.getItem('lf_user_email');
    if (!email) return;
    const safeEmail = email.replace(/\"/g, '').replace(/[\.\#\$\[\]]/g, '_');
    const signature = getRangeDataSignature(email, fromDate, toDate);
    const cacheKey = `ai_history_sig_${safeEmail}_${fromDate}_${toDate}`;
    const cached = localStorage.getItem(cacheKey);
    let cacheData = null;
    try { if (cached) cacheData = JSON.parse(cached); } catch(e){}

    if (cacheData && cacheData.signature === signature && cacheData.html) {
        el.innerHTML = styleAIHtml(cacheData.html);
        return;
    }

    el.innerHTML = `<div style="display:flex;align-items:center;gap:10px;color:var(--text2);padding:8px 0;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:lfSpin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
        Menganalisis data komprehensif dengan Groq AI...
    </div>`;

    // Gather activity data for the period
    const allActs = getActivitiesRange(new Date(fromDate.replace(/-/g, '/')), new Date(toDate.replace(/-/g, '/')));
    let workoutCount = 0, gymCount = 0, sleepData = [], musclesTrained = {};
    Object.values(allActs).forEach(dayActs => {
        dayActs.forEach(a => {
            if (a.type === 'workout') { workoutCount++; }
            if (a.type === 'gym') {
                gymCount++;
                a.muscles?.forEach(m => { musclesTrained[m.muscle] = (musclesTrained[m.muscle] || 0) + 1; });
            }
            if (a.type === 'sleep') sleepData.push({ hours: a.hours, quality: a.quality, type: a.sleepType });
        });
    });
    const avgSleepHours = sleepData.length > 0 ? (sleepData.reduce((s,x) => s+x.hours, 0) / sleepData.length).toFixed(1) : 'tidak tercatat';
    const profile = getProfile() || {};
    const totalDays = Math.round((new Date(toDate) - new Date(fromDate)) / (1000 * 60 * 60 * 24)) + 1;
    const prompt = `Kamu adalah ahli gizi, fisioterapi, dan pelatih fitness profesional. Analisis data komprehensif berikut dan berikan evaluasi yang sangat personal, mendalam, dan actionable dalam bahasa Indonesia gaul yang ramah (pakai "lu/kamu"):

== PROFIL USER ==
Gender: ${profile.gender || '?'}, BB: ${profile.bb||'?'}kg, TB: ${profile.tb||'?'}cm, Usia: ${profile.usia||'?'}th
Goal: ${profile.target || 'maintenance'}, Aktivitas: ${profile.aktivitas || '?'}

== DATA NUTRISI (${totalDays} hari) ==
Rata-rata kalori: ${Math.round(foodStats.avgCal)} kcal/hari (target: ${foodStats.calTarget} kcal)
Protein: ${foodStats.avgProtein.toFixed(1)}g/hari (target: ${foodStats.targetProtein}g)
Karbo: ${foodStats.avgCarbs.toFixed(1)}g/hari, Lemak: ${foodStats.avgFat.toFixed(1)}g/hari
Serat: ${foodStats.avgFiber.toFixed(1)}g/hari, Gula: ${foodStats.avgSugar.toFixed(1)}g/hari

== DATA KEGIATAN (${totalDays} hari) ==
Sesi workout: ${workoutCount} kali
Sesi gym: ${gymCount} kali
Otot yang dilatih: ${Object.keys(musclesTrained).map(m => `${MUSCLE_LABELS[m]||m} (${musclesTrained[m]}x)`).join(', ') || 'tidak tercatat'}

== DATA TIDUR ==
Rata-rata tidur: ${avgSleepHours} jam/malam
Jumlah catatan tidur: ${sleepData.length} entri

== INSTRUKSI ==
Buat analisis komprehensif dalam HTML VALID (tanpa markdown/code block). Wajib ada:
1. Status nutrisi dan dampaknya ke goal dan latihan
2. Analisis kegiatan olahraga: apakah frekuensi & volume cukup untuk body recomposition? Progressive overload sudah ada?
3. Keterkaitan antara nutrisi dan performa latihan (apakah protein cukup untuk recovery? kalori mendukung latihan?)
4. Analisis kualitas dan durasi tidur — dampaknya ke recovery otot dan metabolisme
5. Saran spesifik untuk perbaikan komposisi tubuh (body recomposition)
6. Top 3 prioritas yang harus diubah minggu ini

Jangan gunakan emoji sama sekali. Gunakan layout HTML yang bersih, elegan, dan profesional. Gunakan div dengan border-left berwarna sesuai status. JAWAB HANYA HTML VALID.`;
    try {
        const raw = await callAI([{ role: 'user', content: prompt }], false, 'llama-3.3-70b-versatile');
        let cleanHtml = (raw || '').trim().replace(/```html\n?/gi,'').replace(/```\n?/gi,'').trim();
        const aiHtml = `
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:12px;padding:6px 10px;background:rgba(94,92,230,0.1);border-radius:8px;font-size:0.78rem;color:#8b8ff0;">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                <b>Analisis AI Groq</b> · Makanan + Olahraga + Tidur · ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} WIB
            </div>${cleanHtml}`;
        
        el.innerHTML = styleAIHtml(aiHtml);
        
        // Save to cache
        const newCache = { html: aiHtml, signature: signature, timestamp: Date.now() };
        DB.set(cacheKey, newCache);
    } catch(e) {
        el.innerHTML = `<p style="color:var(--text2);font-size:0.85rem;">Gagal memuat analisis AI: ${e.message}</p>`;
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('active');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('active');
}

// Target Buttons
document.querySelectorAll('.target-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        const parent = this.parentElement;
        parent.querySelectorAll('.target-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
    });
});

// Onboarding & Calculator
document.getElementById('calcForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnText = document.getElementById('calcBtnText');
    const loader = document.getElementById('calcBtnLoader');
    const resultDiv = document.getElementById('calcResult');
    
    const profile = {
        tb: document.getElementById('tb').value,
        bb: document.getElementById('bb').value,
        usia: document.getElementById('usia').value,
        gender: document.getElementById('gender').value,
        aktivitas: document.getElementById('aktivitas').value,
        target: document.querySelector('#targetGrid .active').dataset.target,
        catatan: document.getElementById('catatanTambahan').value
    };
    
    // Save Onboarding API Keys if provided
    const onbApi = document.getElementById('onboardingApiKey').value.trim();
    const onbVision = document.getElementById('onboardingVisionKey').value.trim();
    if (onbApi) setApiKey(onbApi);
    if (onbVision) setVisionKey(onbVision);

    try {
        btnText.classList.add('hidden');
        loader.classList.remove('hidden');
        
        // Wait for AI calculation
        const aiResult = await calcAI(profile);
        const finalProfile = { ...profile, targets: aiResult };
        setProfile(finalProfile);
        
        // Show result temporarily then go to app
        resultDiv.innerHTML = `
            <h4>Analisis Selesai!</h4>
            <div class="result-grid">
                <div class="result-item"><div class="val">${aiResult.cal}</div><div class="lbl">Kcal</div></div>
                <div class="result-item"><div class="val">${aiResult.protein}g</div><div class="lbl">Protein</div></div>
                <div class="result-item"><div class="val">${aiResult.carbs}g</div><div class="lbl">Karbo</div></div>
                <div class="result-item"><div class="val">${aiResult.fat}g</div><div class="lbl">Lemak</div></div>
            </div>
            <p class="result-notes">${aiResult.notes}</p>
        `;
        resultDiv.classList.remove('hidden');
        
        setTimeout(() => {
            document.getElementById('onboarding').classList.add('hidden');
            document.getElementById('app').classList.remove('hidden');
            renderProfileDisplay();
            showPage('dashboard');
        }, 3000);
        
    } catch (error) {
        showToast(error.message, 'error');
        resultDiv.innerHTML = `<p style="color:var(--danger)">Error: ${error.message}</p>`;
        resultDiv.classList.remove('hidden');
    } finally {
        btnText.classList.remove('hidden');
        loader.classList.add('hidden');
    }
});

// Update dashboard summary
function renderDashboard() {
    const profile = getProfile();
    const authUser = getAuthUser();
    if (!profile) return;
    
    // Set greeting
    const userName = authUser ? authUser.name : "Bro";
    document.getElementById('dashGreeting').innerText = `Halo, ${userName}!`;
    
    // Set date
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('dashDate').textContent = today.toLocaleDateString('id-ID', options);
    
    const logs = getTodayLogs();
    const totals = sumNutrients(logs);
    
    // Calorie Ring
    const calTarget = profile.targets.cal || 2000;
    const calConsumed = totals.cal;
    
    // Sum today's burned calories
    const todayActs = getTodayActivities();
    const totalBurned = todayActs.reduce((acc, act) => acc + ((act.burn && act.burn.kcal) ? parseFloat(act.burn.kcal) : 0), 0);
    const elBurned = document.getElementById('calBurned');
    if (elBurned) elBurned.textContent = Math.round(totalBurned);
    
    document.getElementById('calConsumed').textContent = Math.round(calConsumed);
    document.getElementById('calTarget').textContent = calTarget;
    document.getElementById('calRemaining').textContent = Math.max(0, calTarget - Math.round(calConsumed) + Math.round(totalBurned));
    
    const calRing = document.getElementById('calRing');
    const circumference = 2 * Math.PI * 50; // r=50
    const calPercent = Math.min(100, (calConsumed / calTarget) * 100);
    const offset = circumference - (calPercent / 100) * circumference;
    calRing.style.strokeDashoffset = offset;
    
    // Macros
    const renderMacro = (id, targetId, barId, val, target) => {
        document.getElementById(id).textContent = Math.round(val);
        document.getElementById(targetId).textContent = target;
        const percent = Math.min(100, (val / target) * 100);
        document.getElementById(barId).style.width = `${percent}%`;
    };
    
    renderMacro('proteinVal', 'proteinTarget', 'proteinBar', totals.protein, profile.targets.protein);
    renderMacro('carbsVal', 'carbsTarget', 'carbsBar', totals.carbs, profile.targets.carbs);
    renderMacro('fatVal', 'fatTarget', 'fatBar', totals.fat, profile.targets.fat);
    renderMacro('fiberVal', 'fiberTarget', 'fiberBar', totals.fiber, profile.targets.fiber || 25);
    
    // Micros
    const micros = [
        { key: 'sugar', label: 'Gula', max: 50, unit: 'g' },
        { key: 'sodium', label: 'Sodium', max: 2300, unit: 'mg' },
        { key: 'calcium', label: 'Kalsium', max: 1000, unit: 'mg' },
        { key: 'iron', label: 'Zat Besi', max: 18, unit: 'mg' },
        { key: 'vitC', label: 'Vit C', max: 90, unit: 'mg' },
        { key: 'vitD', label: 'Vit D', max: 20, unit: 'mcg' },
        { key: 'zinc', label: 'Zinc', max: 11, unit: 'mg' }
    ];
    
    const microGrid = document.getElementById('microGrid');
    microGrid.innerHTML = micros.map(m => {
        const val = totals[m.key] || 0;
        const target = profile.targets[m.key] || m.max;
        const pct = Math.min(100, (val / target) * 100);
        const over = val > target ? 'over' : '';
        return `
            <div class="micro-item">
                <span class="micro-label">${m.label}</span>
                <div class="micro-bar">
                    <div class="micro-bar-fill ${over}" style="width:${pct}%"></div>
                </div>
                <span class="micro-val"><strong>${Math.round(val)}</strong><span class="micro-divider">/</span>${target}<span class="micro-unit">${m.unit}</span></span>
            </div>
        `;
    }).join('');
    
    // Food List
    const foodList = document.getElementById('foodList');
    document.getElementById('foodCount').textContent = `${logs.length} item`;
    
    if (logs.length === 0) {
        foodList.innerHTML = '<div class="empty-state">Belum ada makanan hari ini. <br>Klik "+ Tambah Makanan" untuk mulai!</div>';
    } else {
        foodList.innerHTML = logs.map(item => `
            <div class="food-item">
                <div class="food-item-info">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                        <span class="meal-badge">${formatMealTime(item.mealTime)}</span>
                        <span class="food-item-name">${item.name}</span>
                    </div>
                    <div class="food-item-portion">${item.portion || '-'}</div>
                    <div class="food-item-macros">
                        <span>P: ${item.protein || 0}g</span> • 
                        <span>K: ${item.carbs || 0}g</span> • 
                        <span>L: ${item.fat || 0}g</span>
                    </div>
                </div>
                <div class="food-item-cal">${item.cal || 0} kcal</div>
                <div class="food-item-actions">
                    <button class="food-action-btn" onclick="openEditModal('${item.id}')" title="Edit"><i data-lucide="edit" style="width:16px;height:16px;color:#fff;"></i></button>
                    <button class="food-action-btn" onclick="confirmDeleteFood('${item.id}')" title="Hapus"><i data-lucide="trash-2" style="width:16px;height:16px;color:var(--danger)"></i></button>
                </div>
            </div>
        `).join('');
    }
    if (window.lucide) lucide.createIcons();

    // ---- BMI Gauge ----
    const bb = profile.bb || 0;
    const tb = profile.tb || 0;
    const targetBb = profile.targetBb || profile.bb || 0;
    if (bb && tb) {
        const bmi = bb / ((tb / 100) * (tb / 100));
        const bmiRounded = Math.round(bmi * 10) / 10;
        document.getElementById('bmiValue').textContent = bmiRounded;
        document.getElementById('bmiCurrentWeight').textContent = bb + ' kg';
        document.getElementById('bmiHeight').textContent = tb + ' cm';
        document.getElementById('bmiTargetWeight').textContent = (targetBb || '--') + (targetBb ? ' kg' : '');

        // Needle: BMI 10=leftmost(-90deg) 40=rightmost(90deg)
        const clamp = Math.min(40, Math.max(10, bmi));
        const angle = ((clamp - 10) / 30) * 180 - 90;
        document.getElementById('bmiNeedle').setAttribute('transform', `rotate(${angle}, 100, 100)`);

        const lbl = document.getElementById('bmiStatusLabel');
        lbl.className = 'bmi-status-label';
        if (bmi < 18.5)      { lbl.textContent = 'Kurus';       lbl.classList.add('kurus'); }
        else if (bmi < 25)   { lbl.textContent = 'Normal';      lbl.classList.add('normal'); }
        else if (bmi < 30)   { lbl.textContent = 'Overweight';  lbl.classList.add('overweight'); }
        else                 { lbl.textContent = 'Obesitas';     lbl.classList.add('obese'); }
    }
    
    // Render today's activity card on dashboard
    renderDashboardActivityCard();

    // Call daily AI Analysis (pass today's activities for enriched prompt)
    updateDailyAIAnalysis(logs, profile, authUser ? authUser.email : null);
}

function renderDashboardActivityCard() {
    const el = document.getElementById('dashActivityContent');
    if (!el) return;
    const activities = getTodayActivities();
    if (activities.length === 0) {
        el.innerHTML = `<p style="color:var(--text2);font-size:0.88rem;">Belum ada kegiatan tercatat. <span style="color:var(--accent);cursor:pointer;" onclick="showPage('activity')">Catat sekarang →</span></p>`;
        return;
    }
    el.innerHTML = `<div class="dash-activity-grid">` +
        activities.map(act => {
            let badge = '', detail = '';
            if (act.type === 'workout') {
                badge = '💪 Workout';
                detail = act.exercises.map(e => `${e.name} (${e.sets.length}s)`).join(' · ');
            } else if (act.type === 'gym') {
                badge = '🏋️ Gym';
                detail = act.muscles.map(m => MUSCLE_LABELS[m.muscle] || m.muscle).join(', ');
            } else if (act.type === 'sleep') {
                badge = '😴 Tidur';
                detail = `${Math.floor(act.hours)}j ${Math.round((act.hours % 1) * 60)}m · ${act.quality === 'lelap' ? '🌙 Lelap' : act.quality === 'biasa' ? '💤 Biasa' : '😵 Kurang'}`;
            }
            return `<div class="dash-activity-item">
                <div class="type-badge">${badge}</div>
                <div class="act-detail">${detail}</div>
            </div>`;
        }).join('') + `</div>`;
}


async function updateDailyAIAnalysis(logs, profile, email) {
    const aiCard = document.getElementById('aiAnalysisCard');
    const aiContent = document.getElementById('aiAnalysisContent');
    if (!aiCard || !aiContent) return;

    if (!logs || logs.length === 0 || !email) {
        aiCard.style.display = 'none';
        return;
    }

    aiCard.style.display = 'block';

    const today = new Date().toISOString().slice(0, 10);
    const signature = getDailyDataSignature(email, today);
    const safeEmail = email.replace(/\"/g, '').replace(/[\.\#\$\[\]]/g, '_');
    const cacheKey = `ai_daily_sig_${safeEmail}_${today}`;
    const cached = localStorage.getItem(cacheKey);
    let cacheData = null;
    try { if (cached) cacheData = JSON.parse(cached); } catch(e){}

    if (cacheData && cacheData.signature === signature && cacheData.html) {
        aiContent.innerHTML = styleAIHtml(cacheData.html);
        return;
    }

    // Show loading spinner
    aiContent.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;color:var(--text2);">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:lfSpin 1s linear infinite;flex-shrink:0;">
                <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
            </svg>
            <span style="font-size:0.9rem;">✨ AI Groq menganalisis gizi + kegiatan harian lu...</span>
        </div>`;

    // Add spin keyframe once
    if (!document.getElementById('lf-spin-style')) {
        const st = document.createElement('style');
        st.id = 'lf-spin-style';
        st.textContent = '@keyframes lfSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
        document.head.appendChild(st);
    }

    try {
        const totals = sumNutrients(logs);
        const calTarget = (profile.targets && profile.targets.cal) || 2000;
        const targetProtein = (profile.targets && profile.targets.protein) ? profile.targets.protein : Math.round((calTarget * 0.25) / 4);
        const targetCarbs   = (profile.targets && profile.targets.carbs)   ? profile.targets.carbs   : Math.round((calTarget * 0.50) / 4);
        const targetFat     = (profile.targets && profile.targets.fat)     ? profile.targets.fat     : Math.round((calTarget * 0.25) / 9);

        const calRatio = totals.cal / calTarget;
        const calStatus = calRatio <= 0.85 ? 'DEFISIT BESAR (-' + Math.round((1-calRatio)*100) + '%)' :
                          calRatio <= 0.95 ? 'CUTTING/DEFISIT (-' + Math.round((1-calRatio)*100) + '%)' :
                          calRatio <= 1.05 ? 'MAINTENANCE/ON TRACK' :
                          calRatio <= 1.15 ? 'SURPLUS RINGAN (+' + Math.round((calRatio-1)*100) + '%)' :
                                             'SURPLUS BERLEBIH (+' + Math.round((calRatio-1)*100) + '%)';

        const foodList = logs.map(l => `- ${l.name} (${l.portion || '1 porsi'}): ${Math.round(l.cal||0)} kcal | P:${(l.protein||0).toFixed(1)}g K:${(l.carbs||0).toFixed(1)}g L:${(l.fat||0).toFixed(1)}g`).join('\n');

        // Build activity context
        let activityContext = 'Tidak ada kegiatan tercatat hari ini.';
        const todayActs = getTodayActivities();
        if (todayActs.length > 0) {
            const workouts = todayActs.filter(a => a.type === 'workout');
            const gyms = todayActs.filter(a => a.type === 'gym');
            const sleeps = todayActs.filter(a => a.type === 'sleep');
            const lines = [];
            if (workouts.length > 0) {
                workouts.forEach(w => {
                    lines.push(`Workout: ${w.exercises.map(e => `${e.name} (${e.sets.length} set, ${e.sets.map(s=>`${s.reps}reps`).join('/')})`).join(', ')}`);
                });
            }
            if (gyms.length > 0) {
                gyms.forEach(g => {
                    const muscleList = g.muscles.map(m => `${MUSCLE_LABELS[m.muscle]||m.muscle}: ${m.variations.map(v=>`${v.name}(${v.sets.length}set)`).join(', ')}`).join(' | ');
                    lines.push(`Gym: ${muscleList}`);
                });
            }
            if (sleeps.length > 0) {
                sleeps.forEach(s => {
                    lines.push(`Tidur: ${Math.floor(s.hours)}j${Math.round((s.hours%1)*60)}m · ${s.sleepType} · ${s.quality}`);
                });
            }
            activityContext = lines.join('\n');
        }

        const prompt = `Kamu adalah ahli gizi dan pelatih fitness profesional. Evaluasi asupan gizi + kegiatan HARI INI untuk user LebihFit berikut, dan berikan analisis yang mendalam, personal, serta actionable dalam bahasa Indonesia gaul yang ramah (pakai "lu/kamu"):\n\n== DATA HARI INI ==\nProfil: ${profile.gender || '?'}, ${profile.bb || '?'}kg/${profile.tb || '?'}cm, Usia: ${profile.usia || '?'}th, Aktivitas: ${profile.aktivitas || '?'}, Goal: ${profile.target || 'maintenance'}\n\nMakanan tercatat (${logs.length} item):\n${foodList}\n\nTotal aktual vs Target harian:\n- Kalori: ${Math.round(totals.cal)} kcal vs ${calTarget} kcal → ${calStatus}\n- Protein: ${totals.protein.toFixed(1)}g vs ${targetProtein}g (${Math.round((totals.protein/targetProtein)*100)}%)\n- Karbohidrat: ${totals.carbs.toFixed(1)}g vs ${targetCarbs}g (${Math.round((totals.carbs/targetCarbs)*100)}%)\n- Lemak: ${totals.fat.toFixed(1)}g vs ${targetFat}g (${Math.round((totals.fat/targetFat)*100)}%)\n- Serat: ${totals.fiber.toFixed(1)}g (ideal ≥25g)\n- Gula: ${totals.sugar.toFixed(1)}g (batas <50g)\n- Sodium: ${Math.round(totals.sodium)}mg (batas <2300mg)\n\n== KEGIATAN HARI INI ==\n${activityContext}\n\n== FORMAT RESPONS ==\nTulis evaluasi dalam HTML VALID (TANPA markdown, TANPA code block). Wajib ada bagian:\n\n1. Status Kalori → <div style="padding:12px 14px;border-left:4px solid [WARNA];border-radius:8px;margin-bottom:10px;background:[BG]"> — isi: status, dampak ke goal, saran konkret untuk sisa hari ini atau besok\n\n2. Analisis Makronutrisi → heading + 3 div (protein, karbo, lemak) masing2 dengan:\n   - Status (KURANG/OK/BERLEBIH)\n   - Dampak spesifik ke tubuh/performa latihan  \n   - Saran makanan konkret untuk melengkapi hari ini / besok\n\n3. Kaitkan nutrisi dengan kegiatan hari ini: apakah asupan mendukung latihan yang dilakukan? Recovery otot cukup? Tidur cukup?\n\n4. Mikronutrisi (jika serat<25 atau gula>50 atau sodium>2300) → ringkas dalam 1 div\n\n5. Saran Aktivitas → berdasarkan sisa kalori, goal, dan kegiatan yang sudah dilakukan hari ini\n\n6. Prioritas Besok → 2-3 hal terpenting yang harus diperbaiki besok (format <ul><li>)\n\nGunakan warna: hijau = OK/cukup, merah = kurang/berlebih bahaya, kuning = perlu perhatian, biru = cutting/defisit. Jangan gunakan emoji sama sekali. Gunakan desain layout HTML yang bersih, elegan, dan profesional. JAWAB HANYA HTML, tanpa teks di luar tag HTML.`;

        const rawHtml = await callAI([{ role: 'user', content: prompt }], false, 'llama-3.3-70b-versatile');

        if (rawHtml) {
            // Clean up any markdown code fences
            let cleanHtml = rawHtml.trim().replace(/```html\n?/gi, '').replace(/```\n?/gi, '').trim();

            const aiHtml = `
                <div style="display:flex;align-items:center;gap:7px;margin-bottom:12px;padding:6px 10px;background:rgba(94,92,230,0.1);border-radius:8px;font-size:0.78rem;color:#8b8ff0;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                    <b>Dianalisis AI Groq</b> · llama-3.3-70b · ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} WIB
                </div>
                ${cleanHtml}`;

            aiContent.innerHTML = styleAIHtml(aiHtml);

            // Cache the result using DB.set
            const newCache = { html: aiHtml, signature: signature, timestamp: Date.now() };
            DB.set(cacheKey, newCache);
        } else {
            aiContent.innerHTML = `<p style="color:var(--text2);font-size:0.9rem;">Gagal memuat analisis AI. Coba refresh halaman.</p>`;
        }
    } catch (err) {
        console.error('[AI Daily]', err);
        aiContent.innerHTML = `<p style="color:var(--text2);font-size:0.9rem;">Gagal memuat analisis AI: ${err.message}</p>`;
    }
}

function formatMealTime(val) {
    const map = { sarapan: 'Sarapan', makan_siang: 'Makan Siang', makan_malam: 'Makan Malam', snack: 'Snack' };
    return map[val] || val;
}

// Log Food
function switchLogTab(tab) {
    document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.log-panel').forEach(p => p.classList.add('hidden'));
    
    if (tab === 'manual') {
        document.getElementById('tabManual').classList.add('active');
        document.getElementById('manualForm').classList.remove('hidden');
    } else {
        document.getElementById('tabPhoto').classList.add('active');
        document.getElementById('photoForm').classList.remove('hidden');
    }
}

document.getElementById('foodForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const item = {
        id: uid(),
        date: todayKey(),
        name: document.getElementById('foodName').value,
        portion: document.getElementById('foodPortion').value,
        mealTime: document.getElementById('mealTime').value,
        cal: parseFloat(document.getElementById('foodCal').value) || 0,
        protein: parseFloat(document.getElementById('foodProtein').value) || 0,
        carbs: parseFloat(document.getElementById('foodCarbs').value) || 0,
        fat: parseFloat(document.getElementById('foodFat').value) || 0,
        fiber: parseFloat(document.getElementById('foodFiber').value) || 0,
        sugar: parseFloat(document.getElementById('foodSugar').value) || 0,
        sodium: parseFloat(document.getElementById('foodSodium').value) || 0,
        calcium: parseFloat(document.getElementById('foodCalcium').value) || 0,
        iron: parseFloat(document.getElementById('foodIron').value) || 0,
        vitC: parseFloat(document.getElementById('foodVitC').value) || 0,
        vitD: parseFloat(document.getElementById('foodVitD').value) || 0,
        zinc: parseFloat(document.getElementById('foodZinc').value) || 0,
    };
    
    saveFoodItem(item);
    showToast('Makanan berhasil disimpan!', 'success');
    clearFoodForm();
    showPage('dashboard');
});

function clearFoodForm() {
    document.getElementById('foodForm').reset();
    document.getElementById('nutrisiContainer').classList.add('hidden');
    document.getElementById('btnSimpanMakanan').classList.add('hidden');
}

async function analyzeTextFood() {
    const name = document.getElementById('foodName').value.trim();
    const portion = document.getElementById('foodPortion').value.trim();
    const desc = document.getElementById('foodDesc').value.trim();
    
    if (!name) {
        showToast('Masukkan nama makanan terlebih dahulu', 'error');
        return;
    }
    
    const btn = document.getElementById('analyzeTextBtn');
    const originalText = btn.innerHTML;
    
    try {
        btn.innerHTML = '<i data-lucide="loader" class="spin" style="width:18px;height:18px;display:inline-block;vertical-align:text-bottom;"></i> Menganalisis...';
        btn.disabled = true;
        if (window.lucide) lucide.createIcons();
        
        const res = await analyzeTextAI(name, portion, desc);
        
        document.getElementById('foodCal').value = res.cal || 0;
        document.getElementById('foodProtein').value = res.protein || 0;
        document.getElementById('foodCarbs').value = res.carbs || 0;
        document.getElementById('foodFat').value = res.fat || 0;
        document.getElementById('foodFiber').value = res.fiber || 0;
        document.getElementById('foodSugar').value = res.sugar || 0;
        document.getElementById('foodSodium').value = res.sodium || 0;
        document.getElementById('foodCalcium').value = res.calcium || 0;
        document.getElementById('foodIron').value = res.iron || 0;
        document.getElementById('foodVitC').value = res.vitC || 0;
        document.getElementById('foodVitD').value = res.vitD || 0;
        document.getElementById('foodZinc').value = res.zinc || 0;
        
        document.getElementById('nutrisiContainer').classList.remove('hidden');
        document.getElementById('btnSimpanMakanan').classList.remove('hidden');
        
        showToast('Analisis nutrisi berhasil!', 'success');
        
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        if (window.lucide) lucide.createIcons();
    }
}

// Photo Upload
let currentPhotoBase64 = null;
let currentPhotoMime = null;

function handlePhotoUpload(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            // Show preview with original
            document.getElementById('photoPreview').src = e.target.result;
            document.getElementById('photoPreviewWrap').classList.remove('hidden');
            document.getElementById('photoUploadArea').classList.add('hidden');
            
            // Compress image before sending to AI (max 512px, 60% quality)
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX = 512;
                let w = img.width, h = img.height;
                if (w > h && w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
                else if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
                canvas.width = w;
                canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                const compressed = canvas.toDataURL('image/jpeg', 0.6);
                currentPhotoBase64 = compressed.split(',')[1];
                currentPhotoMime = 'image/jpeg';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function clearPhoto() {
    document.getElementById('photoInput').value = '';
    document.getElementById('photoPreview').src = '';
    document.getElementById('photoPreviewWrap').classList.add('hidden');
    document.getElementById('photoUploadArea').classList.remove('hidden');
    document.getElementById('photoResult').classList.add('hidden');
    currentPhotoBase64 = null;
    currentPhotoMime = null;
}

async function analyzePhoto() {
    if (!currentPhotoBase64) return;
    
    const btn = document.getElementById('analyzeBtn');
    const resultDiv = document.getElementById('photoResult');
    
    try {
        btn.innerHTML = '⏳ Menganalisis...';
        btn.disabled = true;
        resultDiv.classList.add('hidden');
        
        const res = await analyzePhotoAI(currentPhotoBase64, currentPhotoMime);
        
        // Populate manual form with results
        document.getElementById('foodName').value = res.name || '';
        document.getElementById('foodPortion').value = res.portion || '';
        document.getElementById('foodCal').value = res.cal || 0;
        document.getElementById('foodProtein').value = res.protein || 0;
        document.getElementById('foodCarbs').value = res.carbs || 0;
        document.getElementById('foodFat').value = res.fat || 0;
        
        document.getElementById('foodFiber').value = res.fiber || 0;
        document.getElementById('foodSugar').value = res.sugar || 0;
        document.getElementById('foodSodium').value = res.sodium || 0;
        document.getElementById('foodCalcium').value = res.calcium || 0;
        document.getElementById('foodIron').value = res.iron || 0;
        document.getElementById('foodVitC').value = res.vitC || 0;
        document.getElementById('foodVitD').value = res.vitD || 0;
        document.getElementById('foodZinc').value = res.zinc || 0;
        
        document.getElementById('nutrisiContainer').classList.remove('hidden');
        document.getElementById('btnSimpanMakanan').classList.remove('hidden');
        
        switchLogTab('manual');
        showToast('Analisis AI berhasil! Silakan cek dan simpan.', 'success');
        clearPhoto();
        
    } catch (error) {
        showToast(error.message, 'error');
        resultDiv.innerHTML = `<p style="color:var(--danger)">Error: ${error.message}</p>`;
        resultDiv.classList.remove('hidden');
    } finally {
        btn.innerHTML = '<i data-lucide="bot" style="display:inline-block;vertical-align:text-bottom;width:18px;height:18px;"></i> Analisis AI';
        btn.disabled = false;
        if(window.lucide) lucide.createIcons();
    }
}

// Edit & Delete
let currentEditId = null;

function openEditModal(id) {
    const logs = getTodayLogs();
    const item = logs.find(i => i.id === id);
    if (!item) return;
    
    currentEditId = id;
    document.getElementById('editFoodId').value = id;
    document.getElementById('editFoodName').value = item.name;
    document.getElementById('editFoodPortion').value = item.portion || '';
    document.getElementById('editFoodDesc').value = item.desc || '';
    document.getElementById('editMealTime').value = item.mealTime || 'makan_siang';
    
    // Store current nutrisi in hidden fields
    document.getElementById('editCal').value = item.cal || 0;
    document.getElementById('editProtein').value = item.protein || 0;
    document.getElementById('editCarbs').value = item.carbs || 0;
    document.getElementById('editFat').value = item.fat || 0;
    document.getElementById('editFiber').value = item.fiber || 0;
    document.getElementById('editSugar').value = item.sugar || 0;
    document.getElementById('editSodium').value = item.sodium || 0;
    document.getElementById('editCalcium').value = item.calcium || 0;
    document.getElementById('editIron').value = item.iron || 0;
    document.getElementById('editVitC').value = item.vitC || 0;
    document.getElementById('editVitD').value = item.vitD || 0;
    document.getElementById('editZinc').value = item.zinc || 0;
    
    // Reset AI status
    document.getElementById('editAiStatus').style.display = 'none';
    document.getElementById('editNutrPreview').style.display = 'none';
    
    // Show current values in preview if they exist
    if (item.cal) {
        document.getElementById('editPreviewCal').textContent = `${Math.round(item.cal)} kcal`;
        document.getElementById('editPreviewProtein').textContent = `${(item.protein||0).toFixed(1)}g`;
        document.getElementById('editPreviewCarbs').textContent = `${(item.carbs||0).toFixed(1)}g`;
        document.getElementById('editPreviewFat').textContent = `${(item.fat||0).toFixed(1)}g`;
        document.getElementById('editNutrPreview').style.display = 'block';
    }
    
    document.getElementById('editModal').classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

async function analyzeEditFood() {
    const name = document.getElementById('editFoodName').value.trim();
    const portion = document.getElementById('editFoodPortion').value.trim();
    const desc = document.getElementById('editFoodDesc').value.trim();
    
    if (!name) {
        showToast('Masukkan nama makanan terlebih dahulu', 'error');
        return;
    }
    
    const apiKey = getApiKey();
    if (!apiKey) {
        showToast('API Key belum diset. Buka Settings untuk mengisi API Key.', 'error');
        return;
    }
    
    const btn = document.getElementById('editAnalyzeBtn');
    const statusDiv = document.getElementById('editAiStatus');
    const statusText = document.getElementById('editAiStatusText');
    
    btn.disabled = true;
    statusDiv.style.display = 'block';
    statusText.textContent = 'Menganalisis nutrisi dengan AI...';
    document.getElementById('editNutrPreview').style.display = 'none';
    
    try {
        const result = await analyzeTextAI(name, portion || '1 porsi', desc);
        
        // Store in hidden fields
        document.getElementById('editCal').value = result.cal || 0;
        document.getElementById('editProtein').value = result.protein || 0;
        document.getElementById('editCarbs').value = result.carbs || 0;
        document.getElementById('editFat').value = result.fat || 0;
        document.getElementById('editFiber').value = result.fiber || 0;
        document.getElementById('editSugar').value = result.sugar || 0;
        document.getElementById('editSodium').value = result.sodium || 0;
        document.getElementById('editCalcium').value = result.calcium || 0;
        document.getElementById('editIron').value = result.iron || 0;
        document.getElementById('editVitC').value = result.vitC || 0;
        document.getElementById('editVitD').value = result.vitD || 0;
        document.getElementById('editZinc').value = result.zinc || 0;
        
        // Show preview
        document.getElementById('editPreviewCal').textContent = `${Math.round(result.cal || 0)} kcal`;
        document.getElementById('editPreviewProtein').textContent = `${(result.protein||0).toFixed(1)}g`;
        document.getElementById('editPreviewCarbs').textContent = `${(result.carbs||0).toFixed(1)}g`;
        document.getElementById('editPreviewFat').textContent = `${(result.fat||0).toFixed(1)}g`;
        
        statusText.textContent = 'Analisis selesai! Klik Simpan Update untuk menyimpan.';
        statusDiv.style.borderColor = 'var(--success)';
        document.getElementById('editNutrPreview').style.display = 'block';
        
        if (window.lucide) lucide.createIcons();
        showToast('Analisis AI selesai!', 'success');
    } catch (e) {
        statusText.textContent = 'Analisis gagal: ' + e.message;
        statusDiv.style.borderColor = 'var(--danger)';
        showToast('Analisis AI gagal: ' + e.message, 'error');
    } finally {
        btn.disabled = false;
    }
}

function closeEditModal() {
    document.getElementById('editModal').classList.add('hidden');
    currentEditId = null;
}

document.getElementById('editFoodForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!currentEditId) return;
    
    const updated = {
        name: document.getElementById('editFoodName').value,
        portion: document.getElementById('editFoodPortion').value,
        desc: document.getElementById('editFoodDesc').value,
        mealTime: document.getElementById('editMealTime').value,
        cal: parseFloat(document.getElementById('editCal').value) || 0,
        protein: parseFloat(document.getElementById('editProtein').value) || 0,
        carbs: parseFloat(document.getElementById('editCarbs').value) || 0,
        fat: parseFloat(document.getElementById('editFat').value) || 0,
        fiber: parseFloat(document.getElementById('editFiber').value) || 0,
        sugar: parseFloat(document.getElementById('editSugar').value) || 0,
        sodium: parseFloat(document.getElementById('editSodium').value) || 0,
        calcium: parseFloat(document.getElementById('editCalcium').value) || 0,
        iron: parseFloat(document.getElementById('editIron').value) || 0,
        vitC: parseFloat(document.getElementById('editVitC').value) || 0,
        vitD: parseFloat(document.getElementById('editVitD').value) || 0,
        zinc: parseFloat(document.getElementById('editZinc').value) || 0,
    };
    
    updateFoodItem(currentEditId, updated);
    closeEditModal();
    renderDashboard();
    showToast('Makanan berhasil diupdate!', 'success');
});

function confirmDeleteFood(id) {
    showCustomConfirm('Yakin ingin menghapus makanan ini?', () => {
        deleteFoodItem(id);
        renderDashboard();
        showToast('Makanan dihapus!', 'info');
    });
}

// History
function setPeriod(periodDays) {
    document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
    
    // Convert period string to days if needed
    let days = 7;
    if (periodDays === '7') { days = 7; document.getElementById('p7').classList.add('active'); }
    else if (periodDays === '14') { days = 14; document.getElementById('p14').classList.add('active'); }
    else if (periodDays === '30') { days = 30; document.getElementById('p30').classList.add('active'); }
    else if (periodDays === '60') { days = 60; document.getElementById('p60').classList.add('active'); }
    else if (periodDays === '90') { days = 90; document.getElementById('p90').classList.add('active'); }
    else if (periodDays === '180') { days = 180; document.getElementById('p180').classList.add('active'); }
    else if (periodDays === '365') { days = 365; document.getElementById('p365').classList.add('active'); }
    else if (periodDays === 'custom') {
        document.getElementById('pCustom').classList.add('active');
        document.getElementById('customDateRange').classList.remove('hidden');
        return;
    } else {
        // Fallback for old tabs
        days = 7; 
        const el = document.getElementById('pWeek') || document.getElementById('p7');
        if(el) el.classList.add('active');
    }
    
    document.getElementById('customDateRange').classList.add('hidden');
    
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days + 1);
    
    loadHistoryData(from, to);
}

function loadHistoryData(from, to) {
    const data = getLogsRange(from, to);
    renderHistoryChart(data);
    renderHistoryStats(data);
    renderHistoryList(data);

    // Trigger comprehensive AI analysis (food + activity + sleep)
    const profile = getProfile() || {};
    const calTarget = (profile.targets && profile.targets.cal) || 2000;
    const targetProtein = (profile.targets && profile.targets.protein) ? profile.targets.protein : Math.round((calTarget * 0.25) / 4);
    const dataLen = data.length || 1;
    const foodStats = {
        avgCal: data.reduce((s, d) => s + (d.totals.cal || 0), 0) / dataLen,
        avgProtein: data.reduce((s, d) => s + (d.totals.protein || 0), 0) / dataLen,
        avgCarbs: data.reduce((s, d) => s + (d.totals.carbs || 0), 0) / dataLen,
        avgFat: data.reduce((s, d) => s + (d.totals.fat || 0), 0) / dataLen,
        avgFiber: data.reduce((s, d) => s + (d.totals.fiber || 0), 0) / dataLen,
        avgSugar: data.reduce((s, d) => s + (d.totals.sugar || 0), 0) / dataLen,
        calTarget,
        targetProtein
    };
    updateHistoryAIAnalysis(foodStats, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10));
    // Also refresh activity history if that tab is active
    if (document.getElementById('histPanelActivity') && document.getElementById('histPanelActivity').style.display !== 'none') {
        renderActivityHistory();
    }
}

function loadHistory() {
    const fromVal = document.getElementById('dateFrom').value;
    const toVal = document.getElementById('dateTo').value;
    if (fromVal && toVal) {
        loadHistoryData(new Date(fromVal.replace(/-/g, '/')), new Date(toVal.replace(/-/g, '/')));
    }
}

function renderHistoryChart(data) {
    const canvas = document.getElementById('historyChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const labels = data.map(d => {
        const date = new Date(d.date);
        return `${date.getDate()}/${date.getMonth()+1}`;
    });
    const cals = data.map(d => d.totals.cal);
    
    if (currentChart) currentChart.destroy();
    
    // Create gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, 'rgba(0, 240, 255, 0.2)');
    gradient.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
    
    currentChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Kalori',
                data: cals,
                borderColor: '#00f0ff',
                borderWidth: 3,
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#00f0ff',
                pointBorderColor: '#0b121c',
                pointBorderWidth: 2,
                pointRadius: 0, // Clean line without visible points unless hovered
                pointHoverRadius: 6,
                pointHoverBackgroundColor: '#ffffff',
                pointHoverBorderColor: '#00f0ff',
                pointHoverBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(11, 18, 28, 0.95)',
                    titleColor: '#e0f7fa',
                    bodyColor: '#e0f7fa',
                    borderColor: 'rgba(0, 240, 255, 0.3)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    displayColors: false,
                    padding: 12,
                    titleFont: { family: '"Inter", sans-serif', weight: 'bold', size: 12 },
                    bodyFont: { family: '"Inter", sans-serif', size: 12 }
                }
            },
            scales: {
                y: { 
                    beginAtZero: true, 
                    grid: { 
                        color: 'rgba(255, 255, 255, 0.03)', 
                        drawBorder: false 
                    }, 
                    ticks: { color: '#8caebf', font: { family: '"Inter", sans-serif', size: 10 } } 
                },
                x: { 
                    grid: { display: false }, 
                    ticks: { color: '#8caebf', font: { family: '"Inter", sans-serif', size: 10 } } 
                }
            }
        }
    });

    // Render Macro/Micro Chart
    const ctxMacro = document.getElementById('macroChart');
    if (!ctxMacro) return;

    const avgProtein = data.reduce((sum, d) => sum + (d.totals.protein || 0), 0) / (data.length || 1);
    const avgCarbs = data.reduce((sum, d) => sum + (d.totals.carbs || 0), 0) / (data.length || 1);
    const avgFat = data.reduce((sum, d) => sum + (d.totals.fat || 0), 0) / (data.length || 1);

    if (currentMacroChart) currentMacroChart.destroy();
    
    currentMacroChart = new Chart(ctxMacro, {
        type: 'doughnut',
        data: {
            labels: ['Protein', 'Karbo', 'Lemak'],
            datasets: [{
                data: [avgProtein, avgCarbs, avgFat],
                backgroundColor: ['#00f0ff', '#fbbf24', '#ff3366'],
                borderWidth: 0,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '78%', // Clean ring design matching reference
            plugins: { 
                legend: { display: false }, // Use custom HTML legend instead
                tooltip: {
                    backgroundColor: 'rgba(11, 18, 28, 0.95)',
                    titleColor: '#e0f7fa',
                    bodyColor: '#e0f7fa',
                    borderColor: 'rgba(0, 240, 255, 0.3)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    titleFont: { family: '"Inter", sans-serif', weight: 'bold', size: 12 },
                    bodyFont: { family: '"Inter", sans-serif', size: 12 },
                    callbacks: {
                        label: function(context) {
                            let val = context.raw || 0;
                            return ` ${context.label}: ${val.toFixed(1)}g`;
                        }
                    }
                }
            }
        },
        plugins: [{
            id: 'centerText',
            beforeDraw: function(chart) {
                const { ctx, chartArea: { top, right, bottom, left } } = chart;
                ctx.save();
                
                const dataset = chart.data.datasets[0];
                const total = dataset.data.reduce((a, b) => a + b, 0);
                
                const centerX = (left + right) / 2;
                const centerY = (top + bottom) / 2;
                
                // Value (Large, Bold) on top
                ctx.font = 'bold 22px "Inter", "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${Math.round(total)}g`, centerX, centerY - 6);
                
                // Subtitle (Small, Muted) below
                ctx.font = 'normal 10px "Inter", "Plus Jakarta Sans", sans-serif';
                ctx.fillStyle = '#8caebf';
                ctx.fillText('TOTAL MAKRO', centerX, centerY + 14);
                
                ctx.restore();
            }
        }]
    });

    // Render Custom HTML Legend
    const totalGrams = avgProtein + avgCarbs + avgFat;
    const proteinPct = totalGrams > 0 ? Math.round((avgProtein / totalGrams) * 100) : 0;
    const carbsPct = totalGrams > 0 ? Math.round((avgCarbs / totalGrams) * 100) : 0;
    const fatPct = totalGrams > 0 ? Math.round((avgFat / totalGrams) * 100) : 0;

    const legendContainer = document.getElementById('macroLegend');
    if (legendContainer) {
        legendContainer.innerHTML = `
            <div class="macro-legend-item" style="color: #00f0ff;">
                <div class="macro-legend-dot" style="background-color: #00f0ff;"></div>
                <div class="macro-legend-info">
                    <span class="macro-legend-val">${avgProtein.toFixed(1)}g</span>
                    <span class="macro-legend-lbl">Protein (${proteinPct}%)</span>
                </div>
            </div>
            <div class="macro-legend-item" style="color: #fbbf24;">
                <div class="macro-legend-dot" style="background-color: #fbbf24;"></div>
                <div class="macro-legend-info">
                    <span class="macro-legend-val">${avgCarbs.toFixed(1)}g</span>
                    <span class="macro-legend-lbl">Karbo (${carbsPct}%)</span>
                </div>
            </div>
            <div class="macro-legend-item" style="color: #ff3366;">
                <div class="macro-legend-dot" style="background-color: #ff3366;"></div>
                <div class="macro-legend-info">
                    <span class="macro-legend-val">${avgFat.toFixed(1)}g</span>
                    <span class="macro-legend-lbl">Lemak (${fatPct}%)</span>
                </div>
            </div>
        `;
    }
}

function renderHistoryStats(data) {
    if (!data.length) {
        document.getElementById('historyAvgGrid').innerHTML = '<p style="color:var(--text2)">Tidak ada data untuk periode ini.</p>';
        return;
    }
    
    const totals = data.reduce((acc, d) => {
        acc.cal += d.totals.cal;
        acc.protein += d.totals.protein;
        acc.carbs += d.totals.carbs;
        acc.fat += d.totals.fat;
        return acc;
    }, { cal:0, protein:0, carbs:0, fat:0 });
    
    const count = data.length;
    
    document.getElementById('historyAvgGrid').innerHTML = `
        <div class="avg-item"><div class="val">${Math.round(totals.cal/count)}</div><div class="lbl">Kalori/hari</div></div>
        <div class="avg-item"><div class="val">${Math.round(totals.protein/count)}g</div><div class="lbl">Protein/hari</div></div>
        <div class="avg-item"><div class="val">${Math.round(totals.carbs/count)}g</div><div class="lbl">Karbo/hari</div></div>
        <div class="avg-item"><div class="val">${Math.round(totals.fat/count)}g</div><div class="lbl">Lemak/hari</div></div>
    `;
}

function renderHistoryList(data) {
    const list = document.getElementById('historyList');
    if (!data.length) {
        list.innerHTML = '<div class="empty-state">Tidak ada data.</div>';
        return;
    }
    
    // Sort descending by date
    const sorted = [...data].sort((a,b) => new Date(b.date) - new Date(a.date));
    
    list.innerHTML = sorted.map(d => {
        const dateObj = new Date(d.date);
        const dateStr = dateObj.toLocaleDateString('id-ID', { weekday:'short', day:'numeric', month:'short' });
        
        const itemsHtml = d.items.map(item => `
            <div class="history-sub-item">
                <span>${item.name} (${item.portion || '1'})</span>
                <span>${item.cal} kcal</span>
            </div>
        `).join('');
        
        return `
            <div class="history-day" onclick="this.querySelector('.history-day-items').classList.toggle('open')">
                <div class="history-day-header">
                    <div>
                        <div class="history-day-date">${dateStr}</div>
                        <div class="history-day-macros">P:${Math.round(d.totals.protein)}g K:${Math.round(d.totals.carbs)}g L:${Math.round(d.totals.fat)}g</div>
                    </div>
                    <div class="history-day-cal">${Math.round(d.totals.cal)} kcal</div>
                </div>
                <div class="history-day-items">${itemsHtml}</div>
            </div>
        `;
    }).join('');
}

// Profile & Recalculate
function renderProfileDisplay() {
    const profile = getProfile();
    const authUser = getAuthUser() || { email: '', name: 'Bro' };
    if (!profile) return;
    
    document.getElementById('sidebarProfile').innerHTML = `
        <div style="background: var(--surface2); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); margin-bottom: 12px; overflow: hidden;">
            <div style="font-weight: 700; color: var(--text1); font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${authUser.name || 'Bro'}</div>
            <div style="font-size: 0.75rem; color: var(--text2); margin-bottom: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${authUser.email || ''}">${authUser.email || ''}</div>
            
            <div style="display: flex; flex-direction: column; gap: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text2);">
                    <i data-lucide="target" style="width:16px;height:16px;color:var(--accent)"></i> 
                    <span>Target: <b style="color:var(--text1)">${Math.round(profile.targets.cal)} kcal</b></span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text2);">
                    <i data-lucide="activity" style="width:16px;height:16px;color:var(--accent)"></i> 
                    <span style="color:var(--text1); font-weight: 500;">${profile.target.replace('_', ' ').toUpperCase()}</span>
                </div>
            </div>
        </div>
        <button onclick="logout()" style="width: 100%; background: transparent; border: 1px solid var(--danger); color: var(--danger); padding: 8px; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 6px; transition: 0.2s;" onmouseover="this.style.background='var(--danger)'; this.style.color='#fff'" onmouseout="this.style.background='transparent'; this.style.color='var(--danger)'">
            <i data-lucide="log-out" style="width:16px;height:16px;"></i> Log Out
        </button>
    `;
    
    if (window.lucide) lucide.createIcons();
    
    const currentCard = document.getElementById('currentProfileDisplay');
    if (currentCard) {
        currentCard.innerHTML = `
            <div class="current-profile-grid">
                <div class="profile-item"><div class="lbl">Tinggi / Berat</div><div class="val">${profile.tb}cm / ${profile.bb}kg</div></div>
                <div class="profile-item"><div class="lbl">Usia / Gender</div><div class="val">${profile.usia}th / ${profile.gender}</div></div>
                <div class="profile-item"><div class="lbl">BMR Est.</div><div class="val">${profile.targets.bmr || '-'} kcal</div></div>
                <div class="profile-item"><div class="lbl">TDEE Est.</div><div class="val">${profile.targets.tdee || '-'} kcal</div></div>
            </div>
            <div style="margin-top:16px;font-size:0.9rem;color:var(--text2)">
                <b>Catatan AI:</b> ${profile.targets.notes || '-'}
            </div>
        `;
    }
}

function prefillRecalcForm() {
    const profile = getProfile();
    if (!profile) return;
    
    document.getElementById('r_tb').value = profile.tb;
    document.getElementById('r_bb').value = profile.bb;
    document.getElementById('r_usia').value = profile.usia;
    document.getElementById('r_gender').value = profile.gender;
    document.getElementById('r_aktivitas').value = profile.aktivitas;
    document.getElementById('r_catatan').value = profile.catatan || '';
    
    document.querySelectorAll('#recalcTargetGrid .target-btn').forEach(b => {
        b.classList.remove('active');
        if (b.dataset.target === profile.target) b.classList.add('active');
    });
}

document.getElementById('recalcForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const resultDiv = document.getElementById('recalcResult');
    
    const profile = {
        tb: document.getElementById('r_tb').value,
        bb: document.getElementById('r_bb').value,
        usia: document.getElementById('r_usia').value,
        gender: document.getElementById('r_gender').value,
        aktivitas: document.getElementById('r_aktivitas').value,
        target: document.querySelector('#recalcTargetGrid .active').dataset.target,
        catatan: document.getElementById('r_catatan').value
    };

    try {
        btn.innerHTML = '⏳ Menghitung Ulang...';
        btn.disabled = true;
        
        const aiResult = await calcAI(profile);
        const finalProfile = { ...profile, targets: aiResult };
        setProfile(finalProfile);
        
        resultDiv.innerHTML = `
            <div style="color:var(--success);margin-bottom:12px;font-weight:600"><i data-lucide="check-circle" style="display:inline-block;vertical-align:text-bottom;"></i> Profil Berhasil Diupdate!</div>
            <div class="result-grid">
                <div class="result-item"><div class="val">${aiResult.cal}</div><div class="lbl">Kcal</div></div>
                <div class="result-item"><div class="val">${aiResult.protein}g</div><div class="lbl">Protein</div></div>
                <div class="result-item"><div class="val">${aiResult.carbs}g</div><div class="lbl">Karbo</div></div>
                <div class="result-item"><div class="val">${aiResult.fat}g</div><div class="lbl">Lemak</div></div>
            </div>
        `;
        resultDiv.classList.remove('hidden');
        renderProfileDisplay();
        
    } catch (error) {
        showToast(error.message, 'error');
        resultDiv.innerHTML = `<p style="color:var(--danger)">Error: ${error.message}</p>`;
        resultDiv.classList.remove('hidden');
    } finally {
        btn.innerHTML = '<i data-lucide="bot" style="display:inline-block;vertical-align:text-bottom;width:18px;height:18px;"></i> Update Target dengan AI';
        btn.disabled = false;
        if(window.lucide) lucide.createIcons();
    }
});

// Settings
function toggleApiVis(id) {
    const input = document.getElementById(id || 'apiKeyInput');
    input.type = input.type === 'password' ? 'text' : 'password';
}

function saveApiKey() {
    const key = document.getElementById('apiKeyInput').value.trim();
    const visionKey = document.getElementById('visionKeyInput').value.trim();
    setApiKey(key);
    setVisionKey(visionKey);
    updateApiStatus(!!key || !!visionKey);
    showToast('API Keys disimpan', 'success');
}

function updateApiStatus(hasKey) {
    const div = document.getElementById('apiStatus');
    if (hasKey) {
        div.innerHTML = '<i data-lucide="check-circle" style="display:inline-block;vertical-align:text-bottom;width:18px;height:18px;color:var(--success)"></i> API Key tersimpan. Fitur siap digunakan.';
        div.className = 'api-status ok';
    } else {
        div.innerHTML = '<i data-lucide="alert-triangle" style="display:inline-block;vertical-align:text-bottom;width:18px;height:18px;color:var(--danger)"></i> API Key belum diset. Fitur AI tidak bisa digunakan.';
        div.className = 'api-status err';
    }
    if(window.lucide) lucide.createIcons();
}

// ===== TELEGRAM CONNECT =====
const BOT_USERNAME = 'jadilebihfit_bot';

function connectTelegram() {
    const authUser = getAuthUser();
    if (!authUser || !authUser.email) {
        showToast('Login dulu sebelum connect Telegram!', 'error');
        return;
    }

    // Encode email untuk deep link
    const encodedEmail = authUser.email.replace('@', '_at_').replace(/\./g, '_dot_');
    const deepLink = `https://t.me/${BOT_USERNAME}?start=${encodedEmail}`;

    document.getElementById('telegramLinkBox').classList.remove('hidden');
    document.getElementById('telegramDeepLink').href = deepLink;
    document.getElementById('telegramLinkText').value = deepLink;
    if(window.lucide) lucide.createIcons();
}

async function checkTelegramStatus() {
    const authUser = getAuthUser();
    if (!authUser || !authUser.email) return;
    const statusDiv = document.getElementById('telegramStatus');
    if (!statusDiv) return;

    // Check Firebase if telegram is linked
    if (!fbDb) return;
    const safeEmailKey = authUser.email.replace(/[\.\#\$\[\]]/g, '_');
    try {
        const snapshot = await fbDb.ref(`users/${safeEmailKey}/telegram_chat_id`).once('value');
        const chatId = snapshot.val();
        if (chatId) {
            statusDiv.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:var(--success);"><i data-lucide="check-circle" style="width:18px;height:18px;"></i> <span>Telegram sudah terhubung!</span></div>`;
            document.getElementById('btnConnectTelegram').textContent = 'Hubungkan Ulang';
        } else {
            statusDiv.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:var(--text2);"><i data-lucide="circle" style="width:18px;height:18px;"></i> <span>Belum terhubung</span></div>`;
        }
        if(window.lucide) lucide.createIcons();
    } catch(e) {}
}

function exportData() {
    const data = {
        profile: getProfile(),
        logs: getLogs()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lebihfit-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function confirmClearAll() {
    showCustomConfirm('PERINGATAN BAHAYA!<br><br>Apakah kamu YAKIN ingin menghapus SEMUA data nutrisi dan profil kamu? Data yang dihapus tidak bisa dikembalikan!', () => {
        DB.del('lf_profile');
        DB.del('lf_logs');
        showToast('Semua data telah dihapus. Reloading...', 'error');
        setTimeout(() => location.reload(), 1500);
    }, true);
}

function confirmDeleteAccount() {
    showCustomConfirm('PERINGATAN BAHAYA SANGAT TINGGI!<br><br>Apakah kamu YAKIN ingin menghapus AKUN LebihFit kamu secara PERMANEN?<br><br>Tindakan ini akan menghapus seluruh profil, riwayat gizi, dan unlink bot Telegram Anda. Tindakan ini TIDAK BISA DIBATALKAN!', async () => {
        try {
            showToast('Menghapus akun dari database...', 'info');
            await deleteUserAccount();
            localStorage.clear();
            showToast('Akun telah dihapus secara permanen. Redirecting...', 'error');
            setTimeout(() => location.reload(), 1500);
        } catch (err) {
            console.error("Gagal menghapus akun:", err);
            showToast('Gagal menghapus akun: ' + err.message, 'error');
        }
    }, true);
}

function logout() {
    showCustomConfirm("Yakin ingin log out bro?", () => {
        clearAuthUser();
        window.location.reload();
    });
}

// ===== CUSTOM POPUPS (MODALS) =====

// --- Custom Select (Bottom Sheet) ---
let currentSelectInputId = null;

const selectOptionsData = {
    'gender': [
        {val: 'pria', label: 'Pria'},
        {val: 'wanita', label: 'Wanita'}
    ],
    'aktivitas': [
        {val: 'sedentary', label: 'Sedentary (Hampir tidak olahraga)'},
        {val: 'light', label: 'Light (Olahraga 1-3x/minggu)'},
        {val: 'moderate', label: 'Moderate (Olahraga 3-5x/minggu)'},
        {val: 'active', label: 'Active (Olahraga 6-7x/minggu)'},
        {val: 'very_active', label: 'Very Active (Olahraga keras setiap hari)'}
    ],
    'mealTime': [
        {val: 'sarapan', label: 'Sarapan'},
        {val: 'makan_siang', label: 'Makan Siang'},
        {val: 'makan_malam', label: 'Makan Malam'},
        {val: 'snack', label: 'Snack'}
    ],
    'editMealTime': [
        {val: 'sarapan', label: 'Sarapan'},
        {val: 'makan_siang', label: 'Makan Siang'},
        {val: 'makan_malam', label: 'Makan Malam'},
        {val: 'snack', label: 'Snack'}
    ]
};

const selectTitles = {
    'gender': 'Jenis Kelamin',
    'aktivitas': 'Level Aktivitas',
    'mealTime': 'Waktu Makan',
    'editMealTime': 'Waktu Makan'
};

function openCustomSelect(inputId) {
    currentSelectInputId = inputId;
    const currentVal = document.getElementById(inputId).value;
    const title = selectTitles[inputId] || 'Pilih Opsi';
    const options = selectOptionsData[inputId] || [];
    
    document.getElementById('customSheetTitle').innerText = title;
    
    const optionsHtml = options.map(opt => `
        <div class="custom-sheet-opt ${opt.val === currentVal ? 'selected' : ''}" onclick="selectCustomOption('${opt.val}', '${opt.label}')">
            <span>${opt.label}</span>
            ${opt.val === currentVal ? '<i data-lucide="check" style="width:18px;height:18px"></i>' : ''}
        </div>
    `).join('');
    
    document.getElementById('customSheetOptions').innerHTML = optionsHtml;
    document.getElementById('customSheetOverlay').classList.add('active');
    if(window.lucide) lucide.createIcons();
}

function selectCustomOption(val, label) {
    if (currentSelectInputId) {
        document.getElementById(currentSelectInputId).value = val;
        document.getElementById(currentSelectInputId + '_label').innerText = label;
    }
    closeCustomSelect();
}

function closeCustomSelect(e) {
    if (e && e.target !== e.currentTarget) return;
    document.getElementById('customSheetOverlay').classList.remove('active');
}

function openMobileAddSelect() {
    currentSelectInputId = null;
    document.getElementById('customSheetTitle').innerText = 'Tambah Data';
    const optionsHtml = `
        <div class="custom-sheet-opt" onclick="navigateFromMobileAdd('log')">
            <i data-lucide="plus-circle" style="width:18px;height:18px;margin-right:10px;color:var(--accent);"></i>
            <span>Log Makanan</span>
        </div>
        <div class="custom-sheet-opt" onclick="navigateFromMobileAdd('activity')">
            <i data-lucide="dumbbell" style="width:18px;height:18px;margin-right:10px;color:var(--success);"></i>
            <span>Kegiatan Harian</span>
        </div>
    `;
    document.getElementById('customSheetOptions').innerHTML = optionsHtml;
    document.getElementById('customSheetOverlay').classList.add('active');
    if (window.lucide) lucide.createIcons();
}

function navigateFromMobileAdd(page) {
    showPage(page);
    closeCustomSelect();
}

function openReportRangeSelect() {
    const title = 'Pilih Periode Laporan PDF';
    const options = [
        {val: '7', label: 'Mingguan (7 Hari)'},
        {val: '30', label: 'Bulanan (30 Hari)'},
        {val: '90', label: '3 Bulan (90 Hari)'},
        {val: '180', label: '6 Bulan (180 Hari)'},
        {val: '365', label: '1 Tahun (365 Hari)'},
        {val: 'all', label: 'All Time (Semua Data)'}
    ];
    
    document.getElementById('customSheetTitle').innerText = title;
    
    const optionsHtml = options.map(opt => `
        <div class="custom-sheet-opt" onclick="downloadReportWithRange('${opt.val}')">
            <span>${opt.label}</span>
        </div>
    `).join('');
    
    document.getElementById('customSheetOptions').innerHTML = optionsHtml;
    document.getElementById('customSheetOverlay').classList.add('active');
}

function downloadReportWithRange(range) {
    document.getElementById('customSheetOverlay').classList.remove('active');
    window.open(`report.html?range=${range}`, '_blank');
}

// --- Custom Confirm (Modal) ---
let confirmCallback = null;

function showCustomConfirm(msg, callback, isDanger = false) {
    document.getElementById('customConfirmMsg').innerHTML = msg;
    confirmCallback = callback;
    
    const iconDiv = document.getElementById('customConfirmIcon');
    if (isDanger) {
        iconDiv.innerHTML = '<i data-lucide="alert-octagon" style="width:48px;height:48px"></i>';
        iconDiv.className = 'custom-confirm-icon danger';
    } else {
        iconDiv.innerHTML = '<i data-lucide="help-circle" style="width:48px;height:48px"></i>';
        iconDiv.className = 'custom-confirm-icon';
    }
    
    const btn = document.getElementById('customConfirmBtn');
    btn.onclick = () => {
        if (confirmCallback) confirmCallback();
        closeCustomConfirm();
    };
    
    document.getElementById('customConfirmOverlay').classList.add('active');
    if(window.lucide) lucide.createIcons();
}

function closeCustomConfirm() {
    document.getElementById('customConfirmOverlay').classList.remove('active');
    confirmCallback = null;
}

// --- Custom Photo Picker Sheet ---
function openPhotoPickerSheet() {
    document.getElementById('customSheetTitle').innerText = 'Sumber Foto';
    document.getElementById('customSheetOptions').innerHTML = `
        <div class="custom-sheet-opt" onclick="closeCustomSelect(); document.getElementById('cameraInput').click();">
            <span>Kamera</span>
            <i data-lucide="camera" style="width:18px;height:18px"></i>
        </div>
        <div class="custom-sheet-opt" onclick="closeCustomSelect(); document.getElementById('photoInput').click();">
            <span>Galeri / File</span>
            <i data-lucide="image" style="width:18px;height:18px"></i>
        </div>
    `;
    document.getElementById('customSheetOverlay').classList.add('active');
    if(window.lucide) lucide.createIcons();
}

// Drag and drop support for hidden input
const dropArea = document.getElementById('photoUploadArea');
if(dropArea) {
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.style.borderColor = 'var(--accent)';
    });
    dropArea.addEventListener('dragleave', () => {
        dropArea.style.borderColor = 'var(--border)';
    });
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.style.borderColor = 'var(--border)';
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const input = document.getElementById('photoInput');
            input.files = e.dataTransfer.files;
            handlePhotoUpload(input);
        }
    });
}

// Clean/override styles of divs generated by AI to match dark premium theme
function styleAIHtml(rawHtml) {
    if (!rawHtml) return '';
    
    // Parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    
    // Select all div elements (or any direct blocks)
    const divs = doc.querySelectorAll('div');
    divs.forEach(div => {
        // Find existing inline styles
        const inlineStyle = div.getAttribute('style') || '';
        
        // Extract border-left-color or check if border-left exists
        let borderLeftColor = '';
        const borderLeftMatch = inlineStyle.match(/border-left:\s*[^;]*solid\s*([^;]*)/i);
        if (borderLeftMatch) {
            borderLeftColor = borderLeftMatch[1].trim();
        } else {
            const borderLeftColorMatch = inlineStyle.match(/border-left-color:\s*([^;]*)/i);
            if (borderLeftColorMatch) {
                borderLeftColor = borderLeftColorMatch[1].trim();
            }
        }
        
        // Set premium style override
        div.style.background = '#111723'; // matches var(--card-bg)
        div.style.backgroundColor = '#111723';
        div.style.color = '#e2e8f0'; // matches var(--text)
        div.style.padding = '14px 16px';
        div.style.borderRadius = '8px';
        div.style.marginBottom = '14px';
        div.style.fontSize = '0.82rem';
        div.style.lineHeight = '1.5';
        div.style.border = '1px solid rgba(255, 255, 255, 0.08)'; // thin white/gray border
        
        if (borderLeftColor) {
            div.style.borderLeft = `4px solid ${borderLeftColor}`; // Keep left border color!
        }
        
        // Process child spans, bold, and other text elements for status high contrast
        const children = div.querySelectorAll('span, strong, b, p, li');
        children.forEach(child => {
            const c = child.style.color;
            if (c) {
                const hex = c.toLowerCase();
                // If the color is a dark red/orange/yellow/green, swap to bright pastel
                if (hex.includes('7f1d1d') || hex.includes('991b1b') || hex.includes('b91c1c') || hex.includes('ef4444') || hex.includes('red')) {
                    child.style.color = '#ff8a80'; // bright light red
                } else if (hex.includes('713f12') || hex.includes('854d0e') || hex.includes('a16207') || hex.includes('yellow')) {
                    child.style.color = '#ffe082'; // bright light yellow
                } else if (hex.includes('14532d') || hex.includes('166534') || hex.includes('15803d') || hex.includes('green')) {
                    child.style.color = '#a5d6a7'; // bright light green
                } else if (hex.includes('000') || hex.includes('black')) {
                    child.style.color = '#e2e8f0'; // turn black text into white
                }
            }
        });
    });

    // Style any lists
    const uls = doc.querySelectorAll('ul');
    uls.forEach(ul => {
        ul.style.paddingLeft = '20px';
        ul.style.marginBottom = '14px';
        ul.style.lineHeight = '1.5';
    });

    const lis = doc.querySelectorAll('li');
    lis.forEach(li => {
        li.style.fontSize = '0.82rem';
        li.style.color = '#e2e8f0';
        li.style.marginBottom = '6px';
    });
    
    // Style headings if present
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(h => {
        h.style.fontSize = '0.9rem';
        h.style.fontWeight = '700';
        h.style.color = '#fff';
        h.style.marginTop = '18px';
        h.style.marginBottom = '8px';
        h.style.display = 'block';
    });

    return doc.body.innerHTML;
}