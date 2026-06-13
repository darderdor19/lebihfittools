// State and Initialization
let currentChart = null;
let currentMacroChart = null;
let currentMacroTotalChart = null;
let currentActivityChart = null;
let energyComparisonChart = null;
let progressAnalysisChart = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

const GAS_URL = "https://script.google.com/macros/s/AKfycbxuDjmrJWTYXY5PGJOA7Y6Lp7IzZNwt-i7MX1yiKTxZjjbpZZlk5Pe0o0N5l-3AGQs2/exec";
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
        // Sync Firebase in the background
        syncFirebaseToLocal().then(() => {
            const updatedProfile = getProfile();
            if (updatedProfile) {
                document.getElementById('onboarding').classList.add('hidden');
                document.getElementById('app').classList.remove('hidden');
                renderProfileDisplay();
            }
        }).catch(console.error);
        
        // Show UI immediately based on local state
        const profile = getProfile();
        if (!profile) {
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

    // Hide loading screen
    const loader = document.getElementById('loadingOverlay');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 400);
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
            clearAuthUser();
            setAuthUser(data.data.email, data.data.name || tempAuthName);
            document.getElementById('authOverlay').classList.add('hidden');
            showToast("Login Berhasil! Menyinkronkan data...", "info");
            
            // Sync Firebase in background
            syncFirebaseToLocal().then(() => {
                showToast("Sinkronisasi Selesai!", "success");
                const updatedProfile = getProfile();
                if (updatedProfile) {
                    document.getElementById('onboarding').classList.add('hidden');
                    document.getElementById('app').classList.remove('hidden');
                    renderProfileDisplay();
                    showPage('dashboard');
                }
            }).catch(console.error);
            
            // Check immediately if profile exists locally
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
    if (pageId === 'progress') {
        initProgressPage();
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
    document.getElementById('wPanelCardio').style.display = tab === 'cardio' ? '' : 'none';
    document.getElementById('wPanelOther').style.display = tab === 'other' ? '' : 'none';
    
    let activeTabId = 'wTabWorkout';
    if (tab === 'gym') activeTabId = 'wTabGym';
    else if (tab === 'cardio') activeTabId = 'wTabCardio';
    else if (tab === 'other') activeTabId = 'wTabOther';
    
    document.getElementById(activeTabId).classList.add('active');
}

function switchHistoryMainTab(tab) {
    document.querySelectorAll('.history-main-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('histPanelFood').style.display = tab === 'food' ? '' : 'none';
    document.getElementById('histPanelActivity').style.display = tab === 'activity' ? '' : 'none';
    document.getElementById(tab === 'food' ? 'histTabFood' : 'histTabActivity').classList.add('active');
    if (tab === 'activity') renderActivityHistory();
}

// --- Activity AI Analysis State & Preview Helpers ---
let _currentActivityAiResult = null;

function clearActivityAiPreview(type) {
    if (_currentActivityAiResult && _currentActivityAiResult.type === type) {
        _currentActivityAiResult = null;
    }
    const p = document.getElementById(`${type}AiPreview`);
    if (p) {
        p.style.display = 'none';
        p.innerHTML = '';
    }
    
    // Reset buttons: show Analisa AI, hide Simpan Sesi
    const typeUpper = type.charAt(0).toUpperCase() + type.slice(1);
    const btnAnalyze = document.getElementById(`btnAnalyze${typeUpper}AI`);
    const btnSave = document.getElementById(`btnSave${typeUpper}`);
    if (btnAnalyze) btnAnalyze.style.setProperty('display', 'block', 'important');
    if (btnSave) btnSave.style.setProperty('display', 'none', 'important');
}

function renderActivityAiPreview(type, res) {
    const previewId = `${type}AiPreview`;
    const el = document.getElementById(previewId);
    if (!el) return;
    if (!res) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }
    el.style.display = 'block';
    el.innerHTML = `
        <div class="activity-ai-preview-card" style="margin-top: 15px; padding: 14px; background: rgba(0, 255, 204, 0.04); border: 1.5px solid rgba(0, 255, 204, 0.3); border-radius: var(--radius-sm);">
            <div style="display:flex; align-items:center; gap:6px; color:var(--accent); font-weight:700; font-size:0.85rem; text-transform:uppercase; margin-bottom:10px;">
                <i data-lucide="sparkles" style="width:14px;height:14px;"></i> Hasil Analisis AI
            </div>
            <div style="display:flex; justify-content:space-around; align-items:center; gap:10px; margin-bottom:12px; background:var(--bg3); padding:10px; border-radius:var(--radius-sm);">
                <div style="text-align:center;">
                    <div style="font-size:1.2rem; font-weight:700; color:var(--success);">${res.burn.kcal}</div>
                    <div style="font-size:0.68rem; color:var(--text3); text-transform:uppercase;">kcal</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:1.1rem; font-weight:700; color:#ffab40;">${res.burn.fatG}g</div>
                    <div style="font-size:0.68rem; color:var(--text3); text-transform:uppercase;">Lemak</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:1.1rem; font-weight:700; color:#ffd60a;">${res.burn.carbG}g</div>
                    <div style="font-size:0.68rem; color:var(--text3); text-transform:uppercase;">Karbo</div>
                </div>
                <div style="text-align:center;">
                    <div style="font-size:1.1rem; font-weight:700; color:var(--accent2);">${res.burn.proteinG}g</div>
                    <div style="font-size:0.68rem; color:var(--text3); text-transform:uppercase;">Protein</div>
                </div>
            </div>
            ${res.analysis ? `
            <div style="font-size:0.8rem; line-height:1.4; color:var(--text2); background:rgba(255,255,255,0.02); padding:8px; border-radius:var(--radius-sm); border:1px solid var(--border);">
                <strong>Evaluasi Latihan:</strong><br>${res.analysis}
            </div>` : ''}
        </div>
    `;
    if (window.lucide) lucide.createIcons();
}

async function triggerActivityAI(type) {
    let item = null;
    const profile = getProfile() || {};
    
    if (type === 'workout') {
        if (_workoutSession.length === 0) { showToast('Tambah minimal 1 gerakan dulu', 'error'); return; }
        
        let estimatedDuration = 0;
        _workoutSession.forEach(ex => {
            const numSets = ex.sets.length;
            estimatedDuration += numSets * (0.5 + (ex.restTime || 60) / 60);
        });
        estimatedDuration = Math.max(10, Math.round(estimatedDuration));
        
        item = {
            id: uid(),
            date: todayKey(),
            type: 'workout',
            exercises: [..._workoutSession],
            durationMin: estimatedDuration,
            intensity: document.getElementById('workoutIntensity').value,
            burn: null,
            createdAt: Date.now()
        };
    } else if (type === 'gym') {
        const muscles = Object.keys(_gymSelectedMuscles);
        if (muscles.length === 0) { showToast('Pilih minimal 1 otot dulu', 'error'); return; }
        
        const muscleData = muscles.map(muscle => ({
            muscle,
            restTime: _gymRestTimes[muscle] || 60,
            variations: _gymSelectedMuscles[muscle].map(v => ({
                name: v.name || '(tanpa nama)',
                sets: v.sets.map(s => ({
                    set: s.set,
                    reps: s.reps || 0,
                    weight: s.weight || 0
                }))
            }))
        }));
        
        let estimatedDuration = 0;
        muscleData.forEach(m => {
            const rest = m.restTime || 60;
            m.variations.forEach(v => {
                estimatedDuration += v.sets.length * (0.5 + rest / 60);
            });
        });
        estimatedDuration = Math.max(10, Math.round(estimatedDuration));
        
        item = {
            id: uid(),
            date: todayKey(),
            type: 'gym',
            muscles: muscleData,
            durationMin: estimatedDuration,
            intensity: document.getElementById('gymIntensity').value,
            burn: null,
            createdAt: Date.now()
        };
    } else if (type === 'cardio') {
        const cardioName = document.getElementById('cardioName').value.trim();
        const cardioDuration = parseFloat(document.getElementById('cardioDuration').value) || 0;
        const cardioDistance = parseFloat(document.getElementById('cardioDistance').value) || 0;
        const cardioIntensity = document.getElementById('cardioIntensity').value;
        
        if (!cardioName) { showToast('Nama kardio tidak boleh kosong', 'error'); return; }
        if (cardioDuration <= 0) { showToast('Durasi harus lebih dari 0 menit', 'error'); return; }
        
        item = {
            id: uid(),
            date: todayKey(),
            type: 'cardio',
            name: cardioName,
            durationMin: cardioDuration,
            distanceKm: cardioDistance,
            intensity: cardioIntensity,
            burn: null,
            createdAt: Date.now()
        };
    } else if (type === 'other') {
        const otherActName = document.getElementById('otherActName').value.trim();
        const otherActDuration = parseFloat(document.getElementById('otherActDuration').value) || 0;
        const otherActIntensity = document.getElementById('otherActIntensity').value;
        
        if (!otherActName) { showToast('Nama aktivitas tidak boleh kosong', 'error'); return; }
        if (otherActDuration <= 0) { showToast('Durasi harus lebih dari 0 menit', 'error'); return; }
        
        item = {
            id: uid(),
            date: todayKey(),
            type: 'other',
            name: otherActName,
            durationMin: otherActDuration,
            intensity: otherActIntensity,
            burn: null,
            createdAt: Date.now()
        };
    }
    const apiKey = getApiKey();
    if (!apiKey) {
        showToast('API Key tidak ditemukan. Menggunakan kalkulasi standar.', 'info');
        const intensity = item.intensity || 'medium';
        let met = 5.0;
        if (type === 'workout') met = MET_WORKOUT[intensity] || 5.5;
        else if (type === 'gym') met = MET_GYM[intensity] || 5.0;
        else if (type === 'cardio') met = MET_CARDIO[intensity] || 7.0;
        else if (type === 'other') met = MET_OTHER[intensity] || 5.5;
        
        const burn = calcBurnedCalories(met, item.durationMin || 30, intensity);
        _currentActivityAiResult = {
            type: type,
            burn: burn,
            analysis: 'Kalkulasi standar digunakan karena API Key (Text) tidak ditemukan di pengaturan.'
        };
        renderActivityAiPreview(type, _currentActivityAiResult);
        
        const typeUpper = type.charAt(0).toUpperCase() + type.slice(1);
        const btnAnalyze = document.getElementById(`btnAnalyze${typeUpper}AI`);
        const btnSave = document.getElementById(`btnSave${typeUpper}`);
        if (btnAnalyze) btnAnalyze.style.setProperty('display', 'none', 'important');
        if (btnSave) btnSave.style.setProperty('display', 'block', 'important');
        return;
    }
    
    const btnId = `btnAnalyze${type.charAt(0).toUpperCase() + type.slice(1)}AI`;
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const origText = btn.innerHTML;
    
    try {
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="spin" style="width:16px;height:16px;display:inline-block;vertical-align:text-bottom;"></i> Menganalisis...';
        if (window.lucide) lucide.createIcons();
        
        const aiRes = await analyzeWorkoutAI(item, profile);
        
        _currentActivityAiResult = {
            type: type,
            burn: {
                kcal: aiRes.kcal || 0,
                fatG: aiRes.fatG || 0,
                carbG: aiRes.carbG || 0,
                proteinG: aiRes.proteinG || 0
            },
            analysis: aiRes.analysis || ''
        };
        
        renderActivityAiPreview(type, _currentActivityAiResult);
        
        const typeUpper = type.charAt(0).toUpperCase() + type.slice(1);
        const btnAnalyze = document.getElementById(`btnAnalyze${typeUpper}AI`);
        const btnSave = document.getElementById(`btnSave${typeUpper}`);
        if (btnAnalyze) btnAnalyze.style.setProperty('display', 'none', 'important');
        if (btnSave) btnSave.style.setProperty('display', 'block', 'important');
        
        showToast('Analisis AI berhasil!', 'success');
    } catch (err) {
        console.error(err);
        showToast('AI Error: ' + err.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
        if (window.lucide) lucide.createIcons();
    }
}

// --- Workout Functions ---
let _workoutSession = []; // Current workout session buffer
let _workoutSetCount = 1;

function selectWorkoutPreset(name) {
    document.getElementById('workoutExName').value = name;
    document.getElementById('workoutExName').focus();
}

function selectCardioPreset(name) {
    document.getElementById('cardioName').value = name;
    document.getElementById('cardioName').focus();
}

function selectOtherPreset(name) {
    document.getElementById('otherActName').value = name;
    document.getElementById('otherActName').focus();
}

function addWorkoutSet() {
    _workoutSetCount++;
    const container = document.getElementById('workoutSetsContainer');
    const row = document.createElement('div');
    row.className = 'workout-set-row';
    row.id = `workoutSet_${_workoutSetCount}`;
    row.innerHTML = `
        <div class="set-label">Set ${_workoutSetCount}</div>
        <div style="display:flex;align-items:center;gap:4px;flex:1;">
            <input type="number" class="set-input" placeholder="Reps" min="1" id="wReps_${_workoutSetCount}" style="max-width:70px;">
            <span style="font-size:0.8rem;color:var(--text3);">reps</span>
        </div>
        <div style="display:flex;align-items:center;gap:4px;flex:1;">
            <input type="number" class="set-input" placeholder="Beban" min="0" id="wWeight_${_workoutSetCount}" style="max-width:75px;">
            <span style="font-size:0.8rem;color:var(--text3);">kg</span>
        </div>
        <button class="set-remove-btn" onclick="removeWorkoutSet(${_workoutSetCount})"><i data-lucide="x" style="width:14px;height:14px;"></i></button>`;
    container.appendChild(row);
    clearActivityAiPreview('workout');
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
    clearActivityAiPreview('workout');
}

function addWorkoutExercise() {
    const name = document.getElementById('workoutExName').value.trim();
    if (!name) { showToast('Masukkan nama gerakan dulu', 'error'); return; }
    const restTime = parseInt(document.getElementById('workoutRestTime').value) || 60;
    // Collect per-set reps and weight
    const setRows = document.querySelectorAll('#workoutSetsContainer .workout-set-row');
    const sets = [];
    setRows.forEach((row, i) => {
        const repsEl = row.querySelector('input[id^="wReps_"]');
        const weightEl = row.querySelector('input[id^="wWeight_"]');
        sets.push({ 
            set: i + 1, 
            reps: parseInt(repsEl.value) || 0,
            weight: parseFloat(weightEl ? weightEl.value : 0) || 0
        });
    });
    _workoutSession.push({ name, restTime, sets });
    renderWorkoutSessionList();
    // Reset inputs
    document.getElementById('workoutExName').value = '';
    document.getElementById('workoutRestTime').value = '';
    document.querySelectorAll('.set-input').forEach(el => el.value = '');
    clearActivityAiPreview('workout');
}

// ===== CALORIE BURN CALCULATION =====
// Formula: kcal = MET × weightKg × durationHours
// MET values per intensity
const MET_WORKOUT = { low: 3.5, medium: 5.0, high: 6.0 };
const MET_GYM     = { low: 3.5, medium: 5.0, high: 6.0 };
const MET_CARDIO  = { low: 3.0, medium: 5.0, high: 8.3 };
const MET_OTHER   = { low: 3.0, medium: 5.0, high: 6.0 };

function calcBurnedCalories(met, durationMin, intensity = 'medium') {
    const profile = getProfile() || {};
    const weight = parseFloat(profile.bb) || 70;
    const kcal = met * weight * (durationMin / 60);
    
    // Dynamic ratio based on intensity
    let fatRatio = 0.30;
    let carbRatio = 0.65;
    let proteinRatio = 0.05;
    
    if (intensity === 'low') {
        fatRatio = 0.40;
        carbRatio = 0.55;
    } else if (intensity === 'high') {
        fatRatio = 0.20;
        carbRatio = 0.75;
    }
    
    const fatG    = (kcal * fatRatio) / 9;
    const carbG   = (kcal * carbRatio) / 4;
    const proteinG= (kcal * proteinRatio) / 4;
    
    return { 
        kcal: Math.round(kcal), 
        fatG: parseFloat(fatG.toFixed(1)), 
        carbG: parseFloat(carbG.toFixed(1)), 
        proteinG: parseFloat(proteinG.toFixed(1)) 
    };
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
    const burn = calcBurnedCalories(MET_WORKOUT[intensity], dur, intensity);
    renderBurnPreview('workoutBurnPreview', burn, dur, intensity);
}

function previewGymBurn() {
    const dur = parseFloat(document.getElementById('gymDuration').value) || 0;
    const intensity = document.getElementById('gymIntensity').value;
    if (!dur) { document.getElementById('gymBurnPreview').innerHTML = ''; return; }
    const burn = calcBurnedCalories(MET_GYM[intensity], dur, intensity);
    renderBurnPreview('gymBurnPreview', burn, dur, intensity);
}


// --- Gym & Workout State ---
let _gymSelectedMuscles = {}; // { muscle: [{ name, sets: [{set, reps, weight}] }] }
let _gymRestTimes = {}; // { muscle: seconds }
let _tempPendingActivity = null;

function renderWorkoutSessionList() {
    const list = document.getElementById('workoutSessionList');
    const actionsWrap = document.getElementById('workoutActions');
    if (_workoutSession.length === 0) {
        list.innerHTML = '';
        if (actionsWrap) actionsWrap.style.setProperty('display', 'none', 'important');
        return;
    }
    if (actionsWrap) actionsWrap.style.setProperty('display', 'flex', 'important');
    list.innerHTML = `<div style="font-size:0.8rem;color:var(--text2);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Sesi Workout (${_workoutSession.length} gerakan)</div>` +
        _workoutSession.map((ex, idx) => `
            <div class="workout-exercise-item">
                <div>
                    <div class="exercise-item-name">${ex.name}</div>
                    <div class="exercise-item-sets">
                        ${ex.sets.map(s => `<span class="exercise-set-badge">Set ${s.set}: ${s.reps} reps${s.weight ? ` @ ${s.weight} kg` : ''}</span>`).join('')}
                        ${ex.restTime ? `<span class="exercise-set-badge" style="background:rgba(94,92,230,0.15);color:#8b8ff0;"><i data-lucide="timer" style="width:10px;height:10px;display:inline-block;vertical-align:middle;margin-right:2px;"></i> ${ex.restTime}s rest</span>` : ''}
                    </div>
                </div>
                <button class="exercise-remove-btn" onclick="removeWorkoutExercise(${idx})"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
            </div>`).join('');
    if (window.lucide) lucide.createIcons();
}

function removeWorkoutExercise(idx) {
    _workoutSession.splice(idx, 1);
    renderWorkoutSessionList();
    clearActivityAiPreview('workout');
}

function saveWorkoutSession() {
    handleWorkoutOrGymSave('workout');
}

function saveGymSession() {
    handleWorkoutOrGymSave('gym');
}

function saveCardioSession() {
    handleWorkoutOrGymSave('cardio');
}

function saveOtherSession() {
    handleWorkoutOrGymSave('other');
}

async function handleWorkoutOrGymSave(type) {
    let item = null;
    const profile = getProfile() || {};
    
    if (type === 'workout') {
        if (_workoutSession.length === 0) { showToast('Tambah minimal 1 gerakan', 'error'); return; }
        
        let estimatedDuration = 0;
        _workoutSession.forEach(ex => {
            const numSets = ex.sets.length;
            estimatedDuration += numSets * (0.5 + (ex.restTime || 60) / 60);
        });
        estimatedDuration = Math.max(10, Math.round(estimatedDuration));
        
        item = {
            id: uid(),
            date: todayKey(),
            type: 'workout',
            exercises: [..._workoutSession],
            durationMin: estimatedDuration,
            intensity: document.getElementById('workoutIntensity').value,
            burn: null,
            createdAt: Date.now()
        };
    } else if (type === 'gym') {
        const muscles = Object.keys(_gymSelectedMuscles);
        if (muscles.length === 0) { showToast('Pilih minimal 1 otot', 'error'); return; }
        
        const muscleData = muscles.map(muscle => ({
            muscle,
            restTime: _gymRestTimes[muscle] || 60,
            variations: _gymSelectedMuscles[muscle].map(v => ({
                name: v.name || '(tanpa nama)',
                sets: v.sets.map(s => ({
                    set: s.set,
                    reps: s.reps || 0,
                    weight: s.weight || 0
                }))
            }))
        }));
        
        let estimatedDuration = 0;
        muscleData.forEach(m => {
            const rest = m.restTime || 60;
            m.variations.forEach(v => {
                estimatedDuration += v.sets.length * (0.5 + rest / 60);
            });
        });
        estimatedDuration = Math.max(10, Math.round(estimatedDuration));
        
        item = {
            id: uid(),
            date: todayKey(),
            type: 'gym',
            muscles: muscleData,
            durationMin: estimatedDuration,
            intensity: document.getElementById('gymIntensity').value,
            burn: null,
            createdAt: Date.now()
        };
    } else if (type === 'cardio') {
        const cardioName = document.getElementById('cardioName').value.trim();
        const cardioDuration = parseFloat(document.getElementById('cardioDuration').value) || 0;
        const cardioDistance = parseFloat(document.getElementById('cardioDistance').value) || 0;
        const cardioIntensity = document.getElementById('cardioIntensity').value;
        
        if (!cardioName) { showToast('Nama kardio tidak boleh kosong', 'error'); return; }
        if (cardioDuration <= 0) { showToast('Durasi harus lebih dari 0 menit', 'error'); return; }
        
        item = {
            id: uid(),
            date: todayKey(),
            type: 'cardio',
            name: cardioName,
            durationMin: cardioDuration,
            distanceKm: cardioDistance,
            intensity: cardioIntensity,
            burn: null,
            createdAt: Date.now()
        };
    } else if (type === 'other') {
        const otherActName = document.getElementById('otherActName').value.trim();
        const otherActDuration = parseFloat(document.getElementById('otherActDuration').value) || 0;
        const otherActIntensity = document.getElementById('otherActIntensity').value;
        
        if (!otherActName) { showToast('Nama aktivitas tidak boleh kosong', 'error'); return; }
        if (otherActDuration <= 0) { showToast('Durasi harus lebih dari 0 menit', 'error'); return; }
        
        item = {
            id: uid(),
            date: todayKey(),
            type: 'other',
            name: otherActName,
            durationMin: otherActDuration,
            intensity: otherActIntensity,
            burn: null,
            createdAt: Date.now()
        };
    }
    if (_currentActivityAiResult && _currentActivityAiResult.type === type) {
        item.burn = _currentActivityAiResult.burn;
        item.aiAnalysis = _currentActivityAiResult.analysis;
    } else {
        const intensity = item.intensity || 'medium';
        let met = 5.0;
        if (type === 'workout') met = MET_WORKOUT[intensity] || 5.5;
        else if (type === 'gym') met = MET_GYM[intensity] || 5.0;
        else if (type === 'cardio') met = MET_CARDIO[intensity] || 7.0;
        else if (type === 'other') met = MET_OTHER[intensity] || 5.5;
        const burn = calcBurnedCalories(met, item.durationMin || 30);
        item.burn = burn;
        item.aiAnalysis = '';
        showToast('Menyimpan dengan kalkulasi standar (Belum dianalisa AI)', 'info');
    }
    
    executeSaveActivity(item);
}

let _editingActivityId = null;

function showWorkoutAiModal(item) {
    const modal = document.getElementById('workoutAiModal');
    const content = document.getElementById('workoutAiContent');
    if (!modal || !content) return;
    
    const isGym = item.type === 'gym';
    const isWorkout = item.type === 'workout';
    const isCardio = item.type === 'cardio';
    const isOther = item.type === 'other';
    let activitySummary = '';
    
    if (isGym) {
        activitySummary = (item.muscles || []).map(m => {
            const vars = m.variations.map(v => `${v.name} (${v.sets.length} set)`).join(', ');
            return `<strong>${MUSCLE_LABELS[m.muscle] || m.muscle}</strong>: ${vars}`;
        }).join('<br>');
    } else if (isWorkout) {
        activitySummary = (item.exercises || []).map(ex => `<strong>${ex.name}</strong> (${ex.sets.length} set)`).join('<br>');
    } else if (isCardio) {
        activitySummary = `<strong>Kardio: ${item.name}</strong><br>Durasi: ${item.durationMin} menit${item.distanceKm ? `, Jarak: ${item.distanceKm} km` : ''}<br>Intensitas: ${item.intensity === 'low' ? 'Ringan' : item.intensity === 'medium' ? 'Sedang' : 'Tinggi'}`;
    } else if (isOther) {
        activitySummary = `<strong>Aktivitas Lainnya: ${item.name}</strong><br>Durasi: ${item.durationMin} menit<br>Intensitas: ${item.intensity === 'low' ? 'Ringan' : item.intensity === 'medium' ? 'Sedang' : 'Tinggi'}`;
    }
    
    content.innerHTML = `
        <div style="background:var(--bg3); border-radius:12px; padding:16px; border:1px solid var(--border); margin-bottom:14px;">
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text3); font-weight:700; letter-spacing:0.5px; margin-bottom:6px;">Ringkasan Latihan</div>
            <div style="font-size:0.88rem; color:var(--text1); margin-bottom:12px; line-height:1.4;">${activitySummary}</div>
            
            <div style="font-size:0.75rem; text-transform:uppercase; color:var(--text3); font-weight:700; letter-spacing:0.5px; margin-bottom:6px;">Estimasi Pembakaran Kalori</div>
            <div style="display:flex; align-items:baseline; gap:6px; margin-bottom:14px;">
                <span style="font-size:2rem; font-weight:800; color:var(--accent); line-height:1;">${item.burn.kcal}</span>
                <span style="font-size:0.95rem; font-weight:600; color:var(--text2);">kcal</span>
            </div>
            
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; margin-bottom:12px;">
                <div style="background:rgba(255,59,48,0.08); border-radius:8px; padding:8px; text-align:center;">
                    <div style="font-size:0.68rem; color:#ff453a; font-weight:700; text-transform:uppercase; margin-bottom:2px;">Karbo</div>
                    <div style="font-size:0.95rem; font-weight:700; color:#ff453a;">${item.burn.carbG}g</div>
                </div>
                <div style="background:rgba(255,159,10,0.08); border-radius:8px; padding:8px; text-align:center;">
                    <div style="font-size:0.68rem; color:#ff9f0a; font-weight:700; text-transform:uppercase; margin-bottom:2px;">Lemak</div>
                    <div style="font-size:0.95rem; font-weight:700; color:#ff9f0a;">${item.burn.fatG}g</div>
                </div>
                <div style="background:rgba(10,132,255,0.08); border-radius:8px; padding:8px; text-align:center;">
                    <div style="font-size:0.68rem; color:#0a84ff; font-weight:700; text-transform:uppercase; margin-bottom:2px;">Protein</div>
                    <div style="font-size:0.95rem; font-weight:700; color:#0a84ff;">${item.burn.proteinG}g</div>
                </div>
            </div>
        </div>
        
        <div style="background:rgba(94,92,230,0.05); border-radius:12px; padding:16px; border:1px solid rgba(94,92,230,0.15);">
            <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; text-transform:uppercase; color:#8b8ff0; font-weight:700; letter-spacing:0.5px; margin-bottom:6px;">
                <i data-lucide="sparkles" style="width:14px;height:14px;"></i> Analisis & Tips Recovery
            </div>
            <div style="font-size:0.88rem; color:var(--text1); line-height:1.5; font-style:italic;">
                "${item.aiAnalysis || 'Latihan yang bagus! Jaga hidrasi dan konsumsi protein yang cukup.'}"
            </div>
        </div>
    `;
    
    modal.classList.remove('hidden');
    
    const confirmBtn = document.getElementById('btnConfirmSaveWorkout');
    if (confirmBtn) {
        confirmBtn.onclick = () => {
            executeSaveActivity(item);
            closeWorkoutAiModal();
        };
    }
    
    if (window.lucide) lucide.createIcons();
}

function closeWorkoutAiModal() {
    const modal = document.getElementById('workoutAiModal');
    if (modal) modal.classList.add('hidden');
}

function executeSaveActivity(item) {
    if (_editingActivityId) {
        const acts = getActivities();
        let updated = false;
        for (const key in acts) {
            let dayData = acts[key];
            if (dayData && !Array.isArray(dayData)) {
                dayData = Object.values(dayData);
                acts[key] = dayData;
            }
            if (Array.isArray(dayData)) {
                const idx = dayData.findIndex(a => a.id === _editingActivityId);
                if (idx !== -1) {
                    item.id = _editingActivityId;
                    item.date = key; // Preserve original log date
                    dayData[idx] = item;
                    updated = true;
                    break;
                }
            }
        }
        if (updated) {
            setActivities(acts);
            showToast('Aktivitas berhasil diperbarui!', 'success');
        } else {
            saveActivity(item);
            showToast('Aktivitas berhasil disimpan!', 'success');
        }
        _editingActivityId = null;
    } else {
        saveActivity(item);
        showToast('Aktivitas berhasil disimpan!', 'success');
    }
    
    if (item.type === 'workout') {
        _workoutSession = [];
        _workoutSetCount = 1;
        document.getElementById('workoutSessionList').innerHTML = '';
        document.getElementById('workoutActions').style.setProperty('display', 'none', 'important');
        document.getElementById('workoutSetsContainer').innerHTML = `
            <div class="workout-set-row" id="workoutSet_1">
                <div class="set-label">Set 1</div>
                <div style="display:flex;align-items:center;gap:4px;flex:1;">
                    <input type="number" class="set-input" placeholder="Reps" min="1" id="wReps_1" style="max-width:70px;">
                    <span style="font-size:0.8rem;color:var(--text3);">reps</span>
                </div>
                <div style="display:flex;align-items:center;gap:4px;flex:1;">
                    <input type="number" class="set-input" placeholder="Beban" min="0" id="wWeight_1" style="max-width:75px;">
                    <span style="font-size:0.8rem;color:var(--text3);">kg</span>
                </div>
                <button class="set-remove-btn" onclick="removeWorkoutSet(1)" style="opacity:0;pointer-events:none;"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
            </div>`;
    } else if (item.type === 'gym') {
        _gymSelectedMuscles = {};
        _gymRestTimes = {};
        document.querySelectorAll('.muscle-chip').forEach(c => c.classList.remove('active'));
        document.getElementById('gymMuscleInputs').innerHTML = '';
        document.getElementById('gymActions').style.setProperty('display', 'none', 'important');
    } else if (item.type === 'cardio') {
        document.getElementById('cardioName').value = '';
        document.getElementById('cardioDuration').value = '';
        document.getElementById('cardioDistance').value = '';
        document.getElementById('cardioIntensity').value = 'medium';
    } else if (item.type === 'other') {
        document.getElementById('otherActName').value = '';
        document.getElementById('otherActDuration').value = '';
        document.getElementById('otherActIntensity').value = 'medium';
    }

    _currentActivityAiResult = null;
    clearActivityAiPreview('workout');
    clearActivityAiPreview('gym');
    clearActivityAiPreview('cardio');
    clearActivityAiPreview('other');
    
    renderTodayActivities();
    renderDashboardActivityCard();
    showPage('dashboard');
}

function editActivity(id) {
    const acts = getActivities();
    let act = null;
    for (const key in acts) {
        let dayData = acts[key];
        if (dayData && !Array.isArray(dayData)) {
            dayData = Object.values(dayData);
            acts[key] = dayData;
        }
        if (Array.isArray(dayData)) {
            act = dayData.find(i => i.id === id);
            if (act) break;
        }
    }
    if (!act) return;
    
    _editingActivityId = id;
    
    // Switch page to activity
    showPage('activity');
    
    if (act.type === 'sleep') {
        switchActivityTab('sleep');
        document.getElementById('sleepStart').value = act.startTime || '';
        document.getElementById('sleepEnd').value = act.endTime || '';
        document.getElementById('sleepHoursManual').value = act.hours || '';
        _sleepHours = act.hours || 0;
        if (act.hours) {
            document.getElementById('sleepDurationDisplay').textContent = `⏱ Durasi: ${Math.floor(act.hours)}j ${Math.round((act.hours % 1) * 60)}m`;
        } else {
            document.getElementById('sleepDurationDisplay').textContent = '';
        }
        selectSleepType(act.sleepType || 'malam');
        selectSleepQuality(act.quality || 'lelap');
    } else {
        switchActivityTab('sport');
        switchWorkoutTab(act.type);
        
        if (act.type === 'workout') {
            _workoutSession = [...(act.exercises || [])];
            renderWorkoutSessionList();
        } else if (act.type === 'gym') {
            _gymSelectedMuscles = {};
            _gymRestTimes = {};
            (act.muscles || []).forEach(m => {
                _gymSelectedMuscles[m.muscle] = m.variations || [];
                _gymRestTimes[m.muscle] = m.restTime || 60;
            });
            document.querySelectorAll('.muscle-chip').forEach(chip => {
                const m = chip.getAttribute('data-muscle');
                chip.classList.toggle('active', !!_gymSelectedMuscles[m]);
            });
            renderGymMuscleInputs();
            document.getElementById('gymActions').style.setProperty('display', Object.keys(_gymSelectedMuscles).length > 0 ? 'flex' : 'none', 'important');
        } else if (act.type === 'cardio') {
            document.getElementById('cardioName').value = act.name || '';
            document.getElementById('cardioDuration').value = act.durationMin || '';
            document.getElementById('cardioDistance').value = act.distanceKm || '';
            document.getElementById('cardioIntensity').value = act.intensity || 'medium';
        } else if (act.type === 'other') {
            document.getElementById('otherActName').value = act.name || '';
            document.getElementById('otherActDuration').value = act.durationMin || '';
            document.getElementById('otherActIntensity').value = act.intensity || 'medium';
        }
    }
    
    setTimeout(() => {
        const targetPanel = act.type === 'sleep' ? document.getElementById('actPanelSleep') : document.getElementById('actPanelSport');
        if (targetPanel) {
            targetPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, 120);
}

// --- Gym Functions ---
const MUSCLE_LABELS = { chest:'Chest', back:'Back', shoulder:'Shoulder', bicep:'Bicep', tricep:'Tricep', forearm:'Forearm', abs:'Abs', traps:'Traps', leg:'Leg' };

function toggleGymMuscle(muscle) {
    const chip = document.querySelector(`.muscle-chip[data-muscle="${muscle}"]`);
    if (_gymSelectedMuscles[muscle]) {
        delete _gymSelectedMuscles[muscle];
        if (_gymRestTimes[muscle]) delete _gymRestTimes[muscle];
        if (chip) chip.classList.remove('active');
    } else {
        _gymSelectedMuscles[muscle] = [{ name: '', sets: [{ set: 1, reps: 0, weight: 0 }] }];
        _gymRestTimes[muscle] = 60; // default 60 seconds rest
        if (chip) chip.classList.add('active');
    }
    renderGymMuscleInputs();
    clearActivityAiPreview('gym');
    const hasMuscles = Object.keys(_gymSelectedMuscles).length > 0;
    document.getElementById('gymActions').style.setProperty('display', hasMuscles ? 'flex' : 'none', 'important');
}

function renderGymMuscleInputs() {
    const container = document.getElementById('gymMuscleInputs');
    const muscles = Object.keys(_gymSelectedMuscles);
    if (muscles.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = muscles.map(muscle => {
        const variations = _gymSelectedMuscles[muscle];
        return `<div class="gym-muscle-section" id="gymSection_${muscle}">
            <div class="gym-muscle-title">${MUSCLE_LABELS[muscle] || muscle}</div>
            
            <div class="gym-rest-time-row" style="margin-bottom:12px; display:flex; align-items:center; gap:8px;">
                <label style="font-size:0.8rem; color:var(--text2); font-weight:600; display:inline-flex; align-items:center; gap:4px;">
                  <i data-lucide="timer" style="width:14px;height:14px;"></i> Istirahat per Set (detik):
                </label>
                <input type="number" class="set-input" style="max-width:80px; padding: 4px 8px; font-size:0.82rem;" placeholder="Detik" value="${_gymRestTimes[muscle] || ''}" min="0" oninput="updateGymRestTime('${muscle}', this.value)">
            </div>

            ${variations.map((v, vi) => `
                <div class="gym-variation-row" id="gymVar_${muscle}_${vi}">
                    <input type="text" id="gymVarName_${muscle}_${vi}" class="gym-variation-input" placeholder="Nama gerakan (mis: Bench Press)" value="${v.name}" oninput="updateGymVarName('${muscle}',${vi},this.value)">
                    <button class="gym-remove-var" onclick="removeGymVariation('${muscle}',${vi})" title="Hapus variasi">✕</button>
                </div>
                <div class="gym-sets-per-var">
                    ${v.sets.map((s, si) => `
                    <div class="gym-per-set-row" style="margin-bottom: 4px; display:flex; align-items:center; gap:8px;">
                        <span class="gym-per-set-label" style="min-width:40px; font-size:0.78rem; font-weight:700; color:var(--accent2);">Set ${si + 1}</span>
                        <div style="display:flex;align-items:center;gap:4px;">
                            <input type="number" id="gymReps_${muscle}_${vi}_${si}" class="set-input" style="max-width:70px;" placeholder="Reps" value="${s.reps || ''}" min="1" oninput="updateGymSetReps('${muscle}',${vi},${si},this.value)">
                            <span style="font-size:0.8rem;color:var(--text3);">reps</span>
                        </div>
                        <div style="display:flex;align-items:center;gap:4px;">
                            <input type="number" id="gymWeight_${muscle}_${vi}_${si}" class="set-input" style="max-width:75px;" placeholder="Beban" value="${s.weight || ''}" min="0" oninput="updateGymSetWeight('${muscle}',${vi},${si},this.value)">
                            <span style="font-size:0.8rem;color:var(--text3);">kg</span>
                        </div>
                        ${si > 0 ? `<button class="gym-remove-set" onclick="removeGymSet('${muscle}',${vi},${si})" title="Hapus set" style="background:none; border:none; color:var(--text3); cursor:pointer; padding:4px;">✕</button>` : ''}
                    </div>`).join('')}
                    <button class="gym-add-set-btn" onclick="addGymSet('${muscle}',${vi})">+ Set</button>
                </div>`).join('')}
            <button class="gym-add-var-btn" style="margin-top: 10px;" onclick="addGymVariation('${muscle}')">+ Tambah Variasi Gerakan</button>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

function updateGymVarName(muscle, vi, val) {
    if (_gymSelectedMuscles[muscle] && _gymSelectedMuscles[muscle][vi]) _gymSelectedMuscles[muscle][vi].name = val;
    clearActivityAiPreview('gym');
}
function updateGymRestTime(muscle, val) {
    _gymRestTimes[muscle] = parseInt(val) || 0;
    clearActivityAiPreview('gym');
}
function updateGymSetReps(muscle, vi, si, val) {
    if (_gymSelectedMuscles[muscle]?.[vi]?.sets?.[si]) _gymSelectedMuscles[muscle][vi].sets[si].reps = parseInt(val) || 0;
    clearActivityAiPreview('gym');
}
function updateGymSetWeight(muscle, vi, si, val) {
    if (_gymSelectedMuscles[muscle]?.[vi]?.sets?.[si]) _gymSelectedMuscles[muscle][vi].sets[si].weight = parseFloat(val) || 0;
    clearActivityAiPreview('gym');
}
function addGymVariation(muscle) {
    if (!_gymSelectedMuscles[muscle]) return;
    _gymSelectedMuscles[muscle].push({ name: '', sets: [{ set: 1, reps: 0, weight: 0 }] });
    renderGymMuscleInputs();
    clearActivityAiPreview('gym');
    setTimeout(() => {
        const inputIdx = _gymSelectedMuscles[muscle].length - 1;
        const el = document.getElementById(`gymVarName_${muscle}_${inputIdx}`);
        if (el) {
            el.focus();
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 50);
}
function removeGymVariation(muscle, vi) {
    if (_gymSelectedMuscles[muscle]) _gymSelectedMuscles[muscle].splice(vi, 1);
    if (_gymSelectedMuscles[muscle] && _gymSelectedMuscles[muscle].length === 0) {
        delete _gymSelectedMuscles[muscle];
        if (_gymRestTimes[muscle]) delete _gymRestTimes[muscle];
        document.querySelector(`.muscle-chip[data-muscle="${muscle}"]`)?.classList.remove('active');
    }
    renderGymMuscleInputs();
    clearActivityAiPreview('gym');
    const hasMuscles = Object.keys(_gymSelectedMuscles).length > 0;
    document.getElementById('gymActions').style.setProperty('display', hasMuscles ? 'flex' : 'none', 'important');
}
function addGymSet(muscle, vi) {
    if (!_gymSelectedMuscles[muscle]?.[vi]) return;
    const sets = _gymSelectedMuscles[muscle][vi].sets;
    const setNum = sets.length + 1;
    sets.push({ set: setNum, reps: 0, weight: 0 });
    renderGymMuscleInputs();
    clearActivityAiPreview('gym');
    setTimeout(() => {
        const el = document.getElementById(`gymReps_${muscle}_${vi}_${sets.length - 1}`);
        if (el) {
            el.focus();
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 50);
}
function removeGymSet(muscle, vi, si) {
    if (!_gymSelectedMuscles[muscle]?.[vi]) return;
    _gymSelectedMuscles[muscle][vi].sets.splice(si, 1);
    _gymSelectedMuscles[muscle][vi].sets.forEach((s, i) => s.set = i + 1);
    renderGymMuscleInputs();
    clearActivityAiPreview('gym');
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
    
    let item;
    if (_editingActivityId) {
        const acts = getActivities();
        let origItem = null;
        for (const key in acts) {
            let dayData = acts[key];
            if (dayData && !Array.isArray(dayData)) {
                dayData = Object.values(dayData);
                acts[key] = dayData;
            }
            if (Array.isArray(dayData)) {
                origItem = dayData.find(a => a.id === _editingActivityId);
                if (origItem) break;
            }
        }
        item = {
            id: _editingActivityId,
            date: origItem ? origItem.date : todayKey(),
            type: 'sleep',
            hours,
            sleepType: _sleepType,
            quality: _sleepQuality,
            startTime: document.getElementById('sleepStart').value || '',
            endTime: document.getElementById('sleepEnd').value || '',
            createdAt: origItem ? origItem.createdAt : Date.now()
        };
        
        let updated = false;
        for (const key in acts) {
            let dayData = acts[key];
            if (dayData && !Array.isArray(dayData)) {
                dayData = Object.values(dayData);
                acts[key] = dayData;
            }
            if (Array.isArray(dayData)) {
                const idx = dayData.findIndex(a => a.id === _editingActivityId);
                if (idx !== -1) {
                    dayData[idx] = item;
                    updated = true;
                    break;
                }
            }
        }
        if (updated) {
            setActivities(acts);
            showToast('Data tidur berhasil diperbarui!', 'success');
        } else {
            saveActivity(item);
            showToast('Data tidur berhasil disimpan!', 'success');
        }
        _editingActivityId = null;
    } else {
        item = {
            id: uid(), date: todayKey(), type: 'sleep',
            hours, sleepType: _sleepType, quality: _sleepQuality,
            startTime: document.getElementById('sleepStart').value || '',
            endTime: document.getElementById('sleepEnd').value || '',
            createdAt: Date.now()
        };
        saveActivity(item);
        showToast('Data tidur berhasil disimpan!', 'success');
    }
    
    // Reset
    document.getElementById('sleepStart').value = '';
    document.getElementById('sleepEnd').value = '';
    document.getElementById('sleepHoursManual').value = '';
    document.getElementById('sleepDurationDisplay').textContent = '';
    _sleepHours = 0;
    renderTodayActivities();
    renderDashboardActivityCard();
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

        if (act.burn && (act.type === 'workout' || act.type === 'gym' || act.type === 'cardio' || act.type === 'other')) {
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
            detail = act.muscles.map(m => {
                const restLabel = m.restTime ? ` <span style="font-size:0.72rem;color:var(--text3);">⏱ ${m.restTime}s rest</span>` : '';
                const varList = (m.variations || []).map(v => {
                    const setsStr = (v.sets || []).map((s, idx) => `<span style="display:inline-block; white-space:nowrap; padding:4px 8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:6px; font-size:0.75rem; color:var(--text2);">Set ${idx+1}: <b style="color:var(--text);">${s.reps}</b>${s.weight ? `<span style="opacity:0.7;font-size:0.7rem;">×${s.weight}kg</span>` : ''}</span>`).join('');
                    return `<div style="margin-top:12px; padding-left:12px; border-left:2px solid rgba(255,255,255,0.15);">
                              <div style="font-size:0.85rem; margin-bottom:6px;"><b style="color:var(--text);">${v.name || '(tanpa nama)'}</b></div>
                              <div style="display:flex; flex-wrap:wrap; gap:6px;">${setsStr}</div>
                            </div>`;
                }).join('');
                return `<div style="margin-top:16px;"><b style="color:var(--text); font-size:0.9rem; text-transform:uppercase; letter-spacing:1px;">${MUSCLE_LABELS[m.muscle] || m.muscle}</b>${restLabel}</div>${varList}`;
            }).join('<div style="height:12px;"></div>');
            typeLabel = 'Gym';
        } else if (act.type === 'cardio') {
            const intensityText = { low: 'Ringan', medium: 'Sedang', high: 'Tinggi' }[act.intensity] || act.intensity;
            detail = `<b>${act.name}</b> · ${act.durationMin} menit${act.distanceKm ? ` · ${act.distanceKm} km` : ''} · Intensitas: ${intensityText}`;
            typeLabel = 'Kardio';
        } else if (act.type === 'other') {
            const intensityText = { low: 'Ringan', medium: 'Sedang', high: 'Tinggi' }[act.intensity] || act.intensity;
            detail = `<b>${act.name}</b> · ${act.durationMin} menit · Intensitas: ${intensityText}`;
            typeLabel = 'Lainnya';
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
                <div style="display:flex; gap:6px;">
                    <button class="activity-log-edit" onclick="editActivity('${act.id}')" title="Edit">
                        <i data-lucide="edit-2" style="width:14px;height:14px;"></i>
                    </button>
                    <button class="activity-log-delete" onclick="deleteActivity('${act.id}');renderTodayActivities();renderDashboardActivityCard();" title="Hapus">
                        <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                    </button>
                </div>
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
    const from = new Date(fromEl.value.replace(/-/g, '/'));
    const to = new Date(toEl.value.replace(/-/g, '/'));
    const allActs = getActivitiesRange(from, to);
    const summaryEl = document.getElementById('activityHistorySummary');
    const listEl = document.getElementById('activityHistoryList');
    if (!summaryEl || !listEl) return;
    // Compute summary stats
    let totalWorkoutSessions = 0, totalGymSessions = 0, totalCardioSessions = 0, totalOtherSessions = 0;
    let totalSleepEntries = 0, totalSleepHours = 0;
    let totalKcalBurned = 0, totalFatBurned = 0;
    
    const allDates = Object.keys(allActs).sort().reverse();
    allDates.forEach(date => {
        allActs[date].forEach(a => {
            if (a.type === 'workout') totalWorkoutSessions++;
            else if (a.type === 'gym') totalGymSessions++;
            else if (a.type === 'cardio') totalCardioSessions++;
            else if (a.type === 'other') totalOtherSessions++;
            else if (a.type === 'sleep') { totalSleepEntries++; totalSleepHours += a.hours || 0; }
            
            if (a.burn) {
                totalKcalBurned += parseFloat(a.burn.kcal) || 0;
                totalFatBurned += parseFloat(a.burn.fatG) || 0;
            }
        });
    });
    const daysDiff = Math.max(1, Math.round((to - from) / (1000 * 60 * 60 * 24)) + 1);
    const avgSleep = totalSleepEntries > 0 ? (totalSleepHours / totalSleepEntries).toFixed(1) : '--';
    const avgKcalBurned = Math.round(totalKcalBurned / daysDiff);
    const avgFatBurned = (totalFatBurned / daysDiff).toFixed(1);

    summaryEl.innerHTML = `
        <div class="act-stat-card"><div class="act-stat-value">${totalWorkoutSessions}</div><div class="act-stat-label">Sesi Workout</div></div>
        <div class="act-stat-card"><div class="act-stat-value">${totalGymSessions}</div><div class="act-stat-label">Sesi Gym</div></div>
        <div class="act-stat-card"><div class="act-stat-value">${totalCardioSessions}</div><div class="act-stat-label">Sesi Kardio</div></div>
        <div class="act-stat-card"><div class="act-stat-value">${totalOtherSessions}</div><div class="act-stat-label">Sesi Lainnya</div></div>
        <div class="act-stat-card" style="grid-column: span 2; display:flex; gap:12px;">
            <div style="flex:1;"><div class="act-stat-value" style="color:var(--success);text-shadow:0 0 10px rgba(0,255,204,0.3);">${avgKcalBurned}</div><div class="act-stat-label">Rerata Kcal/hari</div></div>
            <div style="flex:1; border-left: 1px solid rgba(255,255,255,0.1); padding-left:12px;"><div class="act-stat-value" style="color:var(--success); font-size:1.1rem;">${Math.round(totalKcalBurned)}</div><div class="act-stat-label">Total Kcal Terbakar</div></div>
        </div>
        <div class="act-stat-card" style="grid-column: span 2; display:flex; gap:12px;">
            <div style="flex:1;"><div class="act-stat-value" style="color:#ffab40;text-shadow:0 0 10px rgba(255,171,64,0.3);">${avgFatBurned}g</div><div class="act-stat-label">Rerata Lemak/hari</div></div>
            <div style="flex:1; border-left: 1px solid rgba(255,255,255,0.1); padding-left:12px;"><div class="act-stat-value" style="color:#ffab40; font-size:1.1rem;">${totalFatBurned.toFixed(1)}g</div><div class="act-stat-label">Total Lemak Terbakar</div></div>
        </div>
        <div class="act-stat-card"><div class="act-stat-value">${totalSleepHours.toFixed(1)}j</div><div class="act-stat-label">Total Tidur</div></div>
        <div class="act-stat-card"><div class="act-stat-value">${avgSleep}j</div><div class="act-stat-label">Rerata Tidur/Hari</div></div>`;
    // Build list by date
    const datesWithActs = allDates.filter(d => allActs[d].length > 0);
    if (datesWithActs.length === 0) {
        listEl.innerHTML = `<p style="color:var(--text2);font-size:0.9rem;padding:16px 0;">Tidak ada kegiatan di periode ini.</p>`;
        return;
    }
    const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    listEl.innerHTML = datesWithActs.map((date, index) => {
        const [y, m, d] = date.split('-');
        const acts = allActs[date];
        const actHtml = acts.map(act => {
            let detail = '';
            let badge = act.type;
            if (act.type === 'workout') {
                detail = (act.exercises || []).map(ex => {
                    const setsStr = (ex.sets || []).map(s => `${s.reps}${s.weight ? `x${s.weight}kg` : ''}`).join('/');
                    const restStr = ex.restTime ? ` · ⏱ ${ex.restTime}s rest` : '';
                    return `<strong>${ex.name}</strong> (${ex.sets.length} set: ${setsStr}${restStr})`;
                }).join('<br>');
                badge = '<i data-lucide="zap" style="width:12px;height:12px;vertical-align:text-bottom;margin-right:3px;"></i> Workout';
            } else if (act.type === 'gym') {
                detail = (act.muscles || []).map(m => {
                    const restLabel = m.restTime ? ` <span style="font-size:0.72rem;color:var(--text3);">⏱ ${m.restTime}s rest</span>` : '';
                    const varList = (m.variations || []).map(v => {
                        const setsStr = (v.sets || []).map((s, idx) => `<span style="display:inline-block; white-space:nowrap; padding:4px 8px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.1); border-radius:6px; font-size:0.75rem; color:var(--text2);">Set ${idx+1}: <b style="color:var(--text);">${s.reps}</b>${s.weight ? `<span style="opacity:0.7;font-size:0.7rem;">×${s.weight}kg</span>` : ''}</span>`).join('');
                        return `<div style="margin-top:12px; padding-left:12px; border-left:2px solid rgba(255,255,255,0.15);">
                                  <div style="font-size:0.85rem; margin-bottom:6px;"><b style="color:var(--text);">${v.name || '(tanpa nama)'}</b></div>
                                  <div style="display:flex; flex-wrap:wrap; gap:6px;">${setsStr}</div>
                                </div>`;
                    }).join('');
                    return `<div style="margin-top:16px;"><b style="color:var(--text); font-size:0.9rem; text-transform:uppercase; letter-spacing:1px;">${MUSCLE_LABELS[m.muscle] || m.muscle}</b>${restLabel}</div>${varList}`;
                }).join('<div style="height:12px;"></div>');
                badge = '<i data-lucide="dumbbell" style="width:12px;height:12px;vertical-align:text-bottom;margin-right:3px;"></i> Gym';
            } else if (act.type === 'cardio') {
                const distanceStr = act.distanceKm ? ` · ${act.distanceKm} km` : '';
                const intensityStr = act.intensity === 'low' ? 'Ringan' : act.intensity === 'medium' ? 'Sedang' : 'Tinggi';
                detail = `<b>${act.name}</b> · ${act.durationMin} menit${distanceStr} · Intensitas: ${intensityStr}`;
                badge = '<i data-lucide="heart" style="width:12px;height:12px;vertical-align:text-bottom;margin-right:3px;"></i> Kardio';
            } else if (act.type === 'other') {
                const intensityStr = act.intensity === 'low' ? 'Ringan' : act.intensity === 'medium' ? 'Sedang' : 'Tinggi';
                detail = `<b>${act.name}</b> · ${act.durationMin} menit · Intensitas: ${intensityStr}`;
                badge = '<i data-lucide="more-horizontal" style="width:12px;height:12px;vertical-align:text-bottom;margin-right:3px;"></i> Lainnya';
            } else if (act.type === 'sleep') {
                const h = parseFloat(act.hours || 0);
                detail = `${Math.floor(h)}j ${Math.round((h%1)*60)}m — ${act.sleepType || 'malam'} — ${act.quality || 'biasa'}`;
                badge = '<i data-lucide="moon" style="width:12px;height:12px;vertical-align:text-bottom;margin-right:3px;"></i> Tidur';
            }
            if (act.burn) {
                detail += `<br><span style="font-size:0.75rem;color:var(--success);font-weight:600;display:inline-flex;align-items:center;gap:3px;margin-top:4px;"><i data-lucide="flame" style="width:11px;height:11px;"></i> ${act.burn.kcal} kcal terbakar</span>`;
                if (act.burn.fatG) {
                    detail += ` <span style="font-size:0.75rem;color:#ffab40;">· Lemak ${act.burn.fatG}g</span>`;
                }
            }
            return `<div style="padding:6px 10px;background:var(--bg);border-radius:6px;margin-top:6px;font-size:0.82rem;">
                <span style="font-size:0.7rem;font-weight:700;color:var(--accent2);text-transform:uppercase;display:inline-flex;align-items:center;gap:3px;">${badge}</span><br>
                <span style="color:var(--text2);">${detail}</span>
            </div>`;
        }).join('');
        const isOpen = index === 0 ? 'open' : '';
        return `<details class="history-details-group" ${isOpen} style="border-bottom:1px solid var(--border); padding: 8px 0;">
            <summary class="history-date-header" style="list-style: none; display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-weight:700; font-size:0.9rem; color: var(--text1); padding: 6px 0; outline: none; user-select: none;">
                <span>${parseInt(d)} ${months[parseInt(m)-1]} ${y}</span>
                <span style="font-size:0.75rem; color:var(--text3); display:inline-flex; align-items:center; gap:4px;">
                    <span>${acts.length} kegiatan</span>
                    <i data-lucide="chevron-down" class="history-chevron" style="width:14px; height:14px; transition: transform 0.2s;"></i>
                </span>
            </summary>
            <div class="history-details-content" style="margin-top: 8px;">
                ${actHtml}
            </div>
        </details>`;
    }).join('');
    
    // Render the dual-axis activity and sleep chart
    renderActivityChart(allDates, allActs);
    
    if (window.lucide) lucide.createIcons();
}

function renderActivityChart(dates, allActs) {
    const canvas = document.getElementById('activityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Sort dates ascending for the chart (past to present)
    const sortedDates = [...dates].sort();
    
    const labels = sortedDates.map(date => {
        const d = new Date(date.replace(/-/g, '/'));
        return `${d.getDate()}/${d.getMonth()+1}`;
    });
    
    const burnedCals = sortedDates.map(date => {
        const dayActs = allActs[date] || [];
        return dayActs.reduce((sum, a) => sum + ((a.burn && a.burn.kcal) ? parseFloat(a.burn.kcal) : 0), 0);
    });
    
    const sleepHours = sortedDates.map(date => {
        const dayActs = allActs[date] || [];
        const sleepAct = dayActs.find(a => a.type === 'sleep');
        return sleepAct ? parseFloat(sleepAct.hours || 0) : 0;
    });
    
    if (currentActivityChart) currentActivityChart.destroy();
    
    currentActivityChart = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                {
                    label: 'Kalori Terbakar (kcal)',
                    data: burnedCals,
                    backgroundColor: 'rgba(0, 240, 255, 0.15)',
                    borderColor: '#00f0ff',
                    borderWidth: 2,
                    yAxisID: 'y',
                    type: 'bar',
                    order: 2
                },
                {
                    label: 'Durasi Tidur (jam)',
                    data: sleepHours,
                    borderColor: '#a78bfa',
                    borderWidth: 3,
                    pointBackgroundColor: '#a78bfa',
                    pointBorderColor: '#0b121c',
                    pointBorderWidth: 2,
                    pointRadius: 3,
                    fill: false,
                    yAxisID: 'y1',
                    type: 'line',
                    tension: 0.4,
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#8caebf', font: { family: '"Inter", sans-serif', size: 10 } }
                },
                tooltip: {
                    backgroundColor: 'rgba(11, 18, 28, 0.95)',
                    titleColor: '#e0f7fa',
                    bodyColor: '#e0f7fa',
                    borderColor: 'rgba(0, 240, 255, 0.3)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 12,
                    titleFont: { family: '"Inter", sans-serif', weight: 'bold', size: 12 },
                    bodyFont: { family: '"Inter", sans-serif', size: 12 }
                }
            },
            scales: {
                y: { 
                    type: 'linear',
                    display: true,
                    position: 'left',
                    beginAtZero: true,
                    grid: { 
                        color: 'rgba(255, 255, 255, 0.03)', 
                        drawBorder: false 
                    }, 
                    ticks: { color: '#8caebf', font: { family: '"Inter", sans-serif', size: 10 } },
                    title: { display: true, text: 'Kcal Terbakar', color: '#00f0ff', font: { family: '"Inter", sans-serif', size: 10, weight: 'bold' } }
                },
                y1: { 
                    type: 'linear',
                    display: true,
                    position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false }, 
                    ticks: { color: '#8caebf', font: { family: '"Inter", sans-serif', size: 10 } },
                    title: { display: true, text: 'Tidur (jam)', color: '#a78bfa', font: { family: '"Inter", sans-serif', size: 10, weight: 'bold' } }
                },
                x: { 
                    grid: { display: false }, 
                    ticks: { color: '#8caebf', font: { family: '"Inter", sans-serif', size: 10 } } 
                }
            }
        }
    });
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
        Menganalisis data komprehensif dengan LebihFit Tools AI...
    </div>`;

    // Gather activity data for the period
    const allActs = getActivitiesRange(new Date(fromDate.replace(/-/g, '/')), new Date(toDate.replace(/-/g, '/')));
    let workoutCount = 0, gymCount = 0, cardioCount = 0, otherCount = 0, sleepData = [], musclesTrained = {}, cardioDetails = [];
    Object.values(allActs).forEach(dayActs => {
        dayActs.forEach(a => {
            if (a.type === 'workout') { workoutCount++; }
            else if (a.type === 'gym') {
                gymCount++;
                a.muscles?.forEach(m => { musclesTrained[m.muscle] = (musclesTrained[m.muscle] || 0) + 1; });
            }
            else if (a.type === 'cardio') {
                cardioCount++;
                cardioDetails.push(`${a.name} (${a.durationMin}m)`);
            }
            else if (a.type === 'other') {
                otherCount++;
            }
            else if (a.type === 'sleep') sleepData.push({ hours: a.hours, quality: a.quality, type: a.sleepType });
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
Sesi kardio: ${cardioCount} kali ${cardioDetails.length ? `(${cardioDetails.join(', ')})` : ''}
Sesi aktivitas lainnya: ${otherCount} kali
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
                <b>Analisis LebihFit Tools AI</b> · Makanan + Olahraga + Tidur · ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} WIB
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
    const totalFatBurned = todayActs.reduce((acc, act) => acc + ((act.burn && act.burn.fatG) ? parseFloat(act.burn.fatG) : 0), 0);
    const elBurned = document.getElementById('calBurned');
    if (elBurned) elBurned.textContent = Math.round(totalBurned);
    
    const elCalBurnedToday = document.getElementById('totalCalBurnedToday');
    if (elCalBurnedToday) elCalBurnedToday.textContent = `${Math.round(totalBurned)} kcal`;
    const elFatBurnedToday = document.getElementById('totalFatBurnedToday');
    if (elFatBurnedToday) elFatBurnedToday.textContent = `${totalFatBurned.toFixed(1)} g`;
    
    // Kalori & Lemak masuk (from food logs)
    const elCalIn = document.getElementById('statCalIn');
    if (elCalIn) elCalIn.textContent = `${Math.round(calConsumed)} kcal`;
    const fatIntake = totals.fat || 0;
    const elFatIn = document.getElementById('statFatIn');
    if (elFatIn) elFatIn.textContent = `${fatIntake.toFixed(1)} g`;
    
    document.getElementById('calConsumed').textContent = Math.round(calConsumed);
    document.getElementById('calTarget').textContent = calTarget;
    document.getElementById('calRemaining').textContent = Math.max(0, calTarget - Math.round(calConsumed) + Math.round(totalBurned));
    
    renderEnergyComparisonChart(calConsumed, totalBurned, fatIntake, totalFatBurned);
    
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
                detail = (act.exercises || []).map(e => `${e.name} (${(e.sets || []).length}s)`).join(' · ');
            } else if (act.type === 'gym') {
                badge = '🏋️ Gym';
                detail = (act.muscles || []).map(m => MUSCLE_LABELS[m.muscle] || m.muscle).join(' · ');
            } else if (act.type === 'cardio') {
                badge = '❤️ Kardio';
                detail = `${act.name} · ${act.durationMin}m${act.distanceKm ? ` · ${act.distanceKm}km` : ''}`;
            } else if (act.type === 'other') {
                badge = '🏃 Lainnya';
                detail = `${act.name} · ${act.durationMin}m`;
            } else if (act.type === 'sleep') {
                badge = '😴 Tidur';
                const h = parseFloat(act.hours || 0);
                detail = `${Math.floor(h)}j ${Math.round((h % 1) * 60)}m · ${act.quality === 'lelap' ? '🌙 Lelap' : act.quality === 'biasa' ? '💤 Biasa' : '😵 Kurang'}`;
            }
            // Burn badge for applicable types
            const burnHtml = (act.burn && act.type !== 'sleep')
                ? `<div style="margin-top:3px;display:inline-flex;flex-wrap:wrap;align-items:center;gap:3px;padding:2px 7px;background:rgba(0,255,204,0.08);border:1px solid rgba(0,255,204,0.25);border-radius:10px;font-size:0.7rem;font-weight:700;color:var(--success);"><i data-lucide="flame" style="width:10px;height:10px;"></i>${act.burn.kcal} kcal terbakar · Lemak ${act.burn.fatG}g</div>`
                : '';
            return `<div class="dash-activity-item" style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                <div style="flex:1; min-width:0;">
                    <div class="type-badge" style="margin-bottom:2px;">${badge}</div>
                    <div class="act-detail" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${detail.replace(/"/g, '&quot;')}">${detail}</div>
                    ${burnHtml}
                </div>
                <div style="display:flex; gap:4px; flex-shrink:0;">
                    <button class="activity-log-edit" onclick="editActivity('${act.id}')" title="Edit" style="background:none; border:none; color:var(--text3); cursor:pointer; padding:4px; display:inline-flex; align-items:center; justify-content:center;">
                        <i data-lucide="edit-2" style="width:13px;height:13px;"></i>
                    </button>
                    <button class="activity-log-delete" onclick="deleteActivity('${act.id}');renderTodayActivities();renderDashboardActivityCard();" title="Hapus" style="background:none; border:none; color:var(--text3); cursor:pointer; padding:4px; display:inline-flex; align-items:center; justify-content:center;">
                        <i data-lucide="trash-2" style="width:13px;height:13px;"></i>
                    </button>
                </div>
            </div>`;
        }).join('') + `</div>`;
    if (window.lucide) lucide.createIcons();
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
            <span style="font-size:0.9rem;">✨ LebihFit Tools AI menganalisis gizi + kegiatan harian lu...</span>
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
            const cardios = todayActs.filter(a => a.type === 'cardio');
            const others = todayActs.filter(a => a.type === 'other');
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
            if (cardios.length > 0) {
                cardios.forEach(c => {
                    lines.push(`Kardio: ${c.name} · ${c.durationMin} menit${c.distanceKm ? ` · ${c.distanceKm} km` : ''} · Intensitas: ${c.intensity}`);
                });
            }
            if (others.length > 0) {
                others.forEach(o => {
                    lines.push(`Aktivitas Lainnya: ${o.name} · ${o.durationMin} menit · Intensitas: ${o.intensity}`);
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
                    <b>Dianalisis LebihFit Tools AI</b> · ${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} WIB
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
    
    // Format YYYY-MM-DD in local time
    const formatDateLocal = (d) => {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    
    document.getElementById('dateFrom').value = formatDateLocal(from);
    document.getElementById('dateTo').value = formatDateLocal(to);
    
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
    // updateHistoryAIAnalysis(foodStats, from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)); // Disabled to save tokens
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

    // Render Macro Total Chart
    const ctxTotalMacro = document.getElementById('macroTotalChart');
    if (ctxTotalMacro) {
        const totalProtein = data.reduce((sum, d) => sum + (d.totals.protein || 0), 0);
        const totalCarbs = data.reduce((sum, d) => sum + (d.totals.carbs || 0), 0);
        const totalFat = data.reduce((sum, d) => sum + (d.totals.fat || 0), 0);
        
        if (currentMacroTotalChart) currentMacroTotalChart.destroy();
        
        currentMacroTotalChart = new Chart(ctxTotalMacro, {
            type: 'doughnut',
            data: {
                labels: ['Protein', 'Karbo', 'Lemak'],
                datasets: [{
                    data: [totalProtein, totalCarbs, totalFat],
                    backgroundColor: ['#00f0ff', '#fbbf24', '#ff3366'],
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '78%',
                plugins: { 
                    legend: { display: false },
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
                                return ` ${context.label}: ${val > 1000 ? (val/1000).toFixed(2)+'kg' : val.toFixed(1)+'g'}`;
                            }
                        }
                    }
                }
            },
            plugins: [{
                id: 'centerTextTotal',
                beforeDraw: function(chart) {
                    const { ctx, chartArea: { top, right, bottom, left } } = chart;
                    ctx.save();
                    const dataset = chart.data.datasets[0];
                    const total = dataset.data.reduce((a, b) => a + b, 0);
                    const centerX = (left + right) / 2;
                    const centerY = (top + bottom) / 2;
                    
                    ctx.font = 'bold 22px "Inter", "Plus Jakarta Sans", sans-serif';
                    ctx.fillStyle = '#ffffff';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    let totalTxt = total > 1000 ? (total/1000).toFixed(1) + 'kg' : Math.round(total) + 'g';
                    ctx.fillText(totalTxt, centerX, centerY - 6);
                    
                    ctx.font = 'normal 10px "Inter", "Plus Jakarta Sans", sans-serif';
                    ctx.fillStyle = '#8caebf';
                    ctx.fillText('TOTAL MAKRO', centerX, centerY + 14);
                    
                    ctx.restore();
                }
            }]
        });

        // Render Total Custom HTML Legend
        const totalGramsAll = totalProtein + totalCarbs + totalFat;
        const proteinPctAll = totalGramsAll > 0 ? Math.round((totalProtein / totalGramsAll) * 100) : 0;
        const carbsPctAll = totalGramsAll > 0 ? Math.round((totalCarbs / totalGramsAll) * 100) : 0;
        const fatPctAll = totalGramsAll > 0 ? Math.round((totalFat / totalGramsAll) * 100) : 0;

        const legendContainerTotal = document.getElementById('macroTotalLegend');
        if (legendContainerTotal) {
            legendContainerTotal.innerHTML = `
                <div class="macro-legend-item" style="color: #00f0ff;">
                    <div class="macro-legend-dot" style="background-color: #00f0ff;"></div>
                    <div class="macro-legend-info">
                        <span class="macro-legend-val">${totalProtein > 1000 ? (totalProtein/1000).toFixed(2)+'kg' : totalProtein.toFixed(1)+'g'}</span>
                        <span class="macro-legend-lbl">Protein (${proteinPctAll}%)</span>
                    </div>
                </div>
                <div class="macro-legend-item" style="color: #fbbf24;">
                    <div class="macro-legend-dot" style="background-color: #fbbf24;"></div>
                    <div class="macro-legend-info">
                        <span class="macro-legend-val">${totalCarbs > 1000 ? (totalCarbs/1000).toFixed(2)+'kg' : totalCarbs.toFixed(1)+'g'}</span>
                        <span class="macro-legend-lbl">Karbo (${carbsPctAll}%)</span>
                    </div>
                </div>
                <div class="macro-legend-item" style="color: #ff3366;">
                    <div class="macro-legend-dot" style="background-color: #ff3366;"></div>
                    <div class="macro-legend-info">
                        <span class="macro-legend-val">${totalFat > 1000 ? (totalFat/1000).toFixed(2)+'kg' : totalFat.toFixed(1)+'g'}</span>
                        <span class="macro-legend-lbl">Lemak (${fatPctAll}%)</span>
                    </div>
                </div>
            `;
        }
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
        <div class="avg-item" style="grid-column: span 2; display:flex; gap:12px;">
            <div style="flex:1;"><div class="val">${Math.round(totals.cal/count)}</div><div class="lbl">Kalori/hari</div></div>
            <div style="flex:1; border-left: 1px solid var(--border); padding-left:12px;"><div class="val" style="color:var(--text2); font-size:1.1rem;">${Math.round(totals.cal)}</div><div class="lbl">Total Kalori</div></div>
        </div>
        <div class="avg-item" style="grid-column: span 2; display:flex; gap:12px;">
            <div style="flex:1;"><div class="val">${Math.round(totals.protein/count)}g</div><div class="lbl">Protein/hari</div></div>
            <div style="flex:1; border-left: 1px solid var(--border); padding-left:12px;"><div class="val" style="color:var(--text2); font-size:1.1rem;">${Math.round(totals.protein)}g</div><div class="lbl">Total Protein</div></div>
        </div>
        <div class="avg-item" style="grid-column: span 2; display:flex; gap:12px;">
            <div style="flex:1;"><div class="val">${Math.round(totals.carbs/count)}g</div><div class="lbl">Karbo/hari</div></div>
            <div style="flex:1; border-left: 1px solid var(--border); padding-left:12px;"><div class="val" style="color:var(--text2); font-size:1.1rem;">${Math.round(totals.carbs)}g</div><div class="lbl">Total Karbo</div></div>
        </div>
        <div class="avg-item" style="grid-column: span 2; display:flex; gap:12px;">
            <div style="flex:1;"><div class="val">${Math.round(totals.fat/count)}g</div><div class="lbl">Lemak/hari</div></div>
            <div style="flex:1; border-left: 1px solid var(--border); padding-left:12px;"><div class="val" style="color:var(--text2); font-size:1.1rem;">${Math.round(totals.fat)}g</div><div class="lbl">Total Lemak</div></div>
        </div>
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
    if (document.getElementById('r_targetBb')) {
        document.getElementById('r_targetBb').value = profile.targetBb || '';
    }
    if (document.getElementById('r_bodyFat')) {
        document.getElementById('r_bodyFat').value = profile.bodyFat || '';
    }
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
        targetBb: document.getElementById('r_targetBb')?.value ? parseFloat(document.getElementById('r_targetBb').value) : null,
        bodyFat: document.getElementById('r_bodyFat')?.value ? parseFloat(document.getElementById('r_bodyFat').value) : null,
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
        // Skip if this div or parent has premium feedback styling class
        if (div.classList.contains('feedback-container') || div.classList.contains('feedback-card') || div.classList.contains('feedback-step') || div.closest('.feedback-container')) {
            return;
        }

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
        div.style.fontSize = '0.9rem';
        div.style.lineHeight = '1.6';
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
        if (ul.classList.contains('feedback-list') || ul.closest('.feedback-container')) return;
        ul.style.paddingLeft = '20px';
        ul.style.marginBottom = '14px';
        ul.style.lineHeight = '1.5';
    });

    const lis = doc.querySelectorAll('li');
    lis.forEach(li => {
        if (li.closest('.feedback-container')) return;
        li.style.fontSize = '0.9rem';
        li.style.color = '#e2e8f0';
        li.style.marginBottom = '6px';
    });
    
    // Style headings if present
    const headings = doc.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(h => {
        if (h.classList.contains('feedback-title') || h.closest('.feedback-container')) return;
        h.style.fontSize = '1.02rem';
        h.style.fontWeight = '700';
        h.style.color = '#fff';
        h.style.marginTop = '18px';
        h.style.marginBottom = '8px';
        h.style.display = 'block';
    });

    return doc.body.innerHTML;
}

function renderEnergyComparisonChart(calIn, calOut, fatIn, fatOut) {
    const canvas = document.getElementById('energyComparisonChart');
    if (!canvas) return;
    if (energyComparisonChart) { energyComparisonChart.destroy(); energyComparisonChart = null; }
    
    energyComparisonChart = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            // Two label groups: Kalori | (gap) | Lemak — achieved via 4 datasets with null values
            labels: ['Kalori (kcal)', 'Lemak (g)'],
            datasets: [
                {
                    // Kalori Masuk — dark blue
                    label: 'Kalori Masuk',
                    data: [Math.round(calIn), null],
                    backgroundColor: 'rgba(108,99,255,0.92)',
                    borderColor: '#6c63ff',
                    borderWidth: 1,
                    borderRadius: 5,
                    yAxisID: 'yCal'
                },
                {
                    // Kalori Keluar — light blue
                    label: 'Kalori Keluar',
                    data: [Math.round(calOut), null],
                    backgroundColor: 'rgba(167,139,250,0.78)',
                    borderColor: '#a78bfa',
                    borderWidth: 1,
                    borderRadius: 5,
                    yAxisID: 'yCal'
                },
                {
                    // Lemak Masuk — dark orange
                    label: 'Lemak Masuk',
                    data: [null, parseFloat(fatIn.toFixed(1))],
                    backgroundColor: 'rgba(249,115,22,0.92)',
                    borderColor: '#f97316',
                    borderWidth: 1,
                    borderRadius: 5,
                    yAxisID: 'yFat'
                },
                {
                    // Lemak Keluar — light orange
                    label: 'Lemak Keluar',
                    data: [null, parseFloat(fatOut.toFixed(1))],
                    backgroundColor: 'rgba(253,186,116,0.78)',
                    borderColor: '#fdba74',
                    borderWidth: 1,
                    borderRadius: 5,
                    yAxisID: 'yFat'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#8caebf',
                        font: { family: '"Inter",sans-serif', size: 10 },
                        usePointStyle: true,
                        pointStyle: 'rect',
                        padding: 12,
                        generateLabels: () => [
                            { text: 'Masuk',  fillStyle: 'rgba(108,99,255,0.92)', strokeStyle: '#6c63ff',  lineWidth:1 },
                            { text: 'Keluar', fillStyle: 'rgba(167,139,250,0.78)', strokeStyle: '#a78bfa', lineWidth:1 }
                        ]
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            if (ctx.raw == null) return null;
                            const unit = ctx.dataIndex === 0 ? 'kcal' : 'g';
                            return ` ${ctx.dataset.label}: ${ctx.raw} ${unit}`;
                        }
                    }
                }
            },
            scales: {
                yCal: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#8caebf', font: { family: '"Inter",sans-serif', size: 9 } }
                },
                yFat: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#8caebf', font: { family: '"Inter",sans-serif', size: 9 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#8caebf', font: { family: '"Inter",sans-serif', size: 11 } }
                }
            }
        }
    });
}

// ============================================================
// ANALISIS PROGRESS — Progress Analysis Page
// ============================================================

function initProgressPage() {
    document.getElementById('progressTypeFood').checked = true;
    document.getElementById('progressTypeAct').checked = true;
    document.getElementById('progressTypeSleep').checked = true;
    
    const defaultRadio = document.querySelector('input[name="progressPeriod"][value="7"]');
    if (defaultRadio) defaultRadio.checked = true;
    
    document.getElementById('progressCustomDates').classList.add('hidden');
    document.getElementById('progressResultCard').style.display = 'none';
    
    const today = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(today.getDate() - 7);
    
    const formatDateLocal = (d) => {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    
    document.getElementById('progressDateFrom').value = formatDateLocal(sevenDaysAgo);
    document.getElementById('progressDateTo').value = formatDateLocal(today);
    
    // Reset Physical Evaluation Inputs
    removePhysicalPhoto();
    document.getElementById('physicalDescInput').value = '';
    document.getElementById('physicalDataPeriod').value = '7';
    document.getElementById('physicalResultCard').style.display = 'none';
    
    // Default Tab
    switchProgressTab('trend');
    
    // Initialize Drag and Drop for Physical Photo Upload
    const area = document.getElementById('physicalUploadArea');
    if (area && !area.dataset.dragInitialized) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            area.addEventListener(eventName, e => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            area.addEventListener(eventName, () => {
                area.style.borderColor = 'var(--accent)';
            }, false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            area.addEventListener(eventName, () => {
                area.style.borderColor = 'var(--border)';
            }, false);
        });
        area.addEventListener('drop', handlePhysicalFileSelect, false);
        area.dataset.dragInitialized = 'true';
    }
    
    onProgressPeriodSelect(); // This will update active classes and call onProgressFilterChange
    if (window.lucide) lucide.createIcons();
}

function onProgressPeriodSelect() {
    const radio = document.querySelector('input[name="progressPeriod"]:checked');
    const period = radio ? radio.value : '7';
    
    // Update active class on period cards
    document.querySelectorAll('.period-card').forEach(card => {
        card.classList.remove('active');
    });
    if (radio) {
        radio.closest('.period-card').classList.add('active');
    }
    
    const customDiv = document.getElementById('progressCustomDates');
    if (period === 'custom') {
        customDiv.classList.remove('hidden');
    } else {
        customDiv.classList.add('hidden');
    }
    onProgressFilterChange();
}

function onProgressFilterChange() {
    const radio = document.querySelector('input[name="progressPeriod"]:checked');
    const period = radio ? radio.value : '7';
    const foodChecked = document.getElementById('progressTypeFood').checked;
    const actChecked = document.getElementById('progressTypeAct').checked;
    const sleepChecked = document.getElementById('progressTypeSleep').checked;
    
    // Toggle active class on card labels
    const foodLabel = document.querySelector('.progress-card.food-card');
    if (foodLabel) {
        if (foodChecked) foodLabel.classList.add('active');
        else foodLabel.classList.remove('active');
    }
    const actLabel = document.querySelector('.progress-card.act-card');
    if (actLabel) {
        if (actChecked) actLabel.classList.add('active');
        else actLabel.classList.remove('active');
    }
    const sleepLabel = document.querySelector('.progress-card.sleep-card');
    if (sleepLabel) {
        if (sleepChecked) sleepLabel.classList.add('active');
        else sleepLabel.classList.remove('active');
    }
    
    const btn = document.getElementById('btnRunProgressAnalysis');
    const msg = document.getElementById('progressValidationMsg');
    
    if (!foodChecked && !actChecked && !sleepChecked) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        msg.style.display = 'block';
        msg.textContent = '⚠️ Silakan centang minimal satu tipe analisis.';
        return;
    }
    
    let fromDate, toDate;
    const today = new Date();
    
    if (period === 'custom') {
        const fromVal = document.getElementById('progressDateFrom').value;
        const toVal = document.getElementById('progressDateTo').value;
        if (!fromVal || !toVal) return;
        fromDate = new Date(fromVal.replace(/-/g, '/'));
        toDate = new Date(toVal.replace(/-/g, '/'));
    } else {
        const days = parseInt(period);
        toDate = new Date();
        fromDate = new Date();
        fromDate.setDate(today.getDate() - days + 1);
    }
    
    const logs = getLogsRange(fromDate, toDate);
    const allActs = getActivitiesRange(fromDate, toDate);
    
    let hasData = false;
    if (foodChecked && logs.length > 0) {
        hasData = true;
    }
    
    if (actChecked) {
        let actCount = 0;
        Object.values(allActs).forEach(dayActs => {
            dayActs.forEach(a => { if (a.type !== 'sleep') actCount++; });
        });
        if (actCount > 0) hasData = true;
    }
    
    if (sleepChecked) {
        let sleepCount = 0;
        Object.values(allActs).forEach(dayActs => {
            dayActs.forEach(a => { if (a.type === 'sleep') sleepCount++; });
        });
        if (sleepCount > 0) hasData = true;
    }
    
    if (!hasData) {
        btn.disabled = true;
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
        msg.style.display = 'block';
        msg.textContent = '⚠️ Tidak ada data makanan/kegiatan/tidur pada periode ini.';
    } else {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        msg.style.display = 'none';
    }
}

async function startProgressAnalysis() {
    const apiKey = localStorage.getItem('lf_apikey');
    const resultTextEl = document.getElementById('progressAiResultText');
    const resultCard = document.getElementById('progressResultCard');
    
    if (!apiKey) {
        alert('Set API Key terlebih dahulu di menu Settings!');
        showPage('settings');
        return;
    }
    
    const radio = document.querySelector('input[name="progressPeriod"]:checked');
    const period = radio ? radio.value : '7';
    const foodChecked = document.getElementById('progressTypeFood').checked;
    const actChecked = document.getElementById('progressTypeAct').checked;
    const sleepChecked = document.getElementById('progressTypeSleep').checked;
    
    let fromDate, toDate;
    const today = new Date();
    
    if (period === 'custom') {
        const fromVal = document.getElementById('progressDateFrom').value;
        const toVal = document.getElementById('progressDateTo').value;
        fromDate = new Date(fromVal.replace(/-/g, '/'));
        toDate = new Date(toVal.replace(/-/g, '/'));
    } else {
        const days = parseInt(period);
        toDate = new Date();
        fromDate = new Date();
        fromDate.setDate(today.getDate() - days + 1);
    }
    
    const logs = getLogsRange(fromDate, toDate);
    const allActs = getActivitiesRange(fromDate, toDate);
    
    // Check Cache
    const cacheParams = {
        from: fromDate.getTime(),
        to: toDate.getTime(),
        food: foodChecked,
        act: actChecked,
        sleep: sleepChecked
    };
    const cachedData = typeof DB !== 'undefined' ? DB.get('lf_analysis_cache') : null;
    if (cachedData && cachedData.params) {
        const p = cachedData.params;
        if (p.from === cacheParams.from && p.to === cacheParams.to && 
            p.food === cacheParams.food && p.act === cacheParams.act && p.sleep === cacheParams.sleep) {
            
            resultCard.style.display = 'block';
            resultTextEl.innerHTML = cachedData.html;
            
            const msg = document.getElementById('progressValidationMsg');
            if (msg) {
                msg.style.display = 'block';
                msg.style.color = 'var(--success)';
                msg.textContent = '⚡ Menampilkan hasil analisis terakhir (Cache). Tambah/ubah log untuk analisis ulang.';
                setTimeout(() => { msg.style.display='none'; msg.style.color=''; }, 5000);
            }
            
            const dateSeries = [];
            const tempDate = new Date(fromDate);
            while (tempDate <= toDate) {
                dateSeries.push(new Date(tempDate));
                tempDate.setDate(tempDate.getDate() + 1);
            }
            renderProgressAnalysisChart(foodChecked, actChecked, sleepChecked, dateSeries, logs, allActs);
            return; // Stop here, use cache
        }
    }
    
    resultCard.style.display = 'block';
    resultTextEl.innerHTML = `<div style="display:flex;align-items:center;gap:10px;color:var(--text2);padding:8px 0;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:lfSpin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="19.07"/></svg>
        Menganalisis progress dengan LebihFit Tools AI...
    </div>`;
    
    if (!document.getElementById('lf-spin-style')) {
        const st = document.createElement('style');
        st.id = 'lf-spin-style';
        st.textContent = '@keyframes lfSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
        document.head.appendChild(st);
    }
    
    try {
        const profile = getProfile() || {};
        const totalDays = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
        
        let avgCal = 0, avgProtein = 0, avgCarbs = 0, avgFat = 0, avgFiber = 0, avgSugar = 0;
        let avgSodium = 0, avgCalcium = 0, avgIron = 0, avgVitC = 0, avgVitD = 0, avgZinc = 0;
        
        if (logs.length > 0) {
            avgCal = logs.reduce((s, d) => s + (d.totals ? d.totals.cal || 0 : 0), 0) / totalDays;
            avgProtein = logs.reduce((s, d) => s + (d.totals ? d.totals.protein || 0 : 0), 0) / totalDays;
            avgCarbs = logs.reduce((s, d) => s + (d.totals ? d.totals.carbs || 0 : 0), 0) / totalDays;
            avgFat = logs.reduce((s, d) => s + (d.totals ? d.totals.fat || 0 : 0), 0) / totalDays;
            avgFiber = logs.reduce((s, d) => s + (d.totals ? d.totals.fiber || 0 : 0), 0) / totalDays;
            avgSugar = logs.reduce((s, d) => s + (d.totals ? d.totals.sugar || 0 : 0), 0) / totalDays;
            avgSodium = logs.reduce((s, d) => s + (d.totals ? d.totals.sodium || 0 : 0), 0) / totalDays;
            avgCalcium = logs.reduce((s, d) => s + (d.totals ? d.totals.calcium || 0 : 0), 0) / totalDays;
            avgIron = logs.reduce((s, d) => s + (d.totals ? d.totals.iron || 0 : 0), 0) / totalDays;
            avgVitC = logs.reduce((s, d) => s + (d.totals ? d.totals.vitC || 0 : 0), 0) / totalDays;
            avgVitD = logs.reduce((s, d) => s + (d.totals ? d.totals.vitD || 0 : 0), 0) / totalDays;
            avgZinc = logs.reduce((s, d) => s + (d.totals ? d.totals.zinc || 0 : 0), 0) / totalDays;
        }

        let activitiesSummary = '';
        Object.keys(allActs).sort().forEach(date => {
            const dayActs = allActs[date] || [];
            if (dayActs.length > 0) {
                activitiesSummary += `Tanggal ${date}:\n`;
                dayActs.forEach(a => {
                    if (a.type === 'gym') {
                        activitiesSummary += `- Gym: Otot ${(a.muscles || []).map(m => m.muscle).join(', ')}\n`;
                        (a.muscles || []).forEach(m => {
                            (m.variations || []).forEach(v => {
                                const setsStr = (v.sets || []).map(s => `${s.reps} reps @ ${s.weight}kg`).join(', ');
                                activitiesSummary += `  * ${v.name || 'Gerakan'}: ${setsStr}\n`;
                            });
                        });
                    } else if (a.type === 'workout') {
                        activitiesSummary += `- Workout:\n`;
                        (a.exercises || []).forEach(ex => {
                            const setsStr = (ex.sets || []).map(s => `${s.reps} reps @ ${s.weight}kg`).join(', ');
                            activitiesSummary += `  * ${ex.name}: ${setsStr}\n`;
                        });
                    } else if (a.type === 'cardio') {
                        activitiesSummary += `- Kardio: ${a.name}, ${a.durationMin} m, ${a.distanceKm || '--'} km, Intensitas ${a.intensity}, Burn ${a.burn?.kcal || 0} kcal\n`;
                    } else if (a.type === 'sleep') {
                        activitiesSummary += `- Tidur: ${a.hours} jam, Kualitas ${a.quality}\n`;
                    } else if (a.type === 'other') {
                        activitiesSummary += `- Aktivitas Lain: ${a.name}, ${a.durationMin} m, Intensitas ${a.intensity}, Burn ${a.burn?.kcal || 0} kcal\n`;
                    }
                });
            }
        });

        let prompt = `Kamu adalah AI Personal Coach, ahli gizi, dan pelatih fitness profesional yang asik, cerdas, dan bersahabat.
Analisis data LebihFit berikut selama ${totalDays} hari terakhir dan kembalikan respons dalam format JSON valid (dan HANYA JSON valid).

== PROFIL USER ==
- Gender: ${profile.gender || '?'}, BB: ${profile.bb||'?'} kg, TB: ${profile.tb||'?'} cm, Usia: ${profile.usia||'?'} tahun
- Goal Target: ${profile.target || 'maintenance'}, Level Aktivitas: ${profile.aktivitas || '?'}
- Target Kalori Harian: ${profile.targets?.cal || 2000} kcal
- Target Protein Harian: ${profile.targets?.protein || 120} g
- Target Berat Badan: ${profile.targetBb || profile.bb || '?'} kg
- Body Fat saat ini: ${profile.bodyFat || '?'} %
- Catatan Tambahan Profil: ${profile.catatan || '-'}

== DATA ASUPAN MAKANAN HARIANS (RATA-RATA) ==
- Kalori: ${Math.round(avgCal)} kcal/hari
- Protein: ${avgProtein.toFixed(1)} g/hari
- Karbohidrat: ${avgCarbs.toFixed(1)} g/hari
- Lemak: ${avgFat.toFixed(1)} g/hari
- Serat: ${avgFiber.toFixed(1)} g/hari
- Gula: ${avgSugar.toFixed(1)} g/hari
- Sodium: ${avgSodium.toFixed(1)} mg/hari
- Kalsium: ${avgCalcium.toFixed(1)} mg/hari
- Besi: ${avgIron.toFixed(1)} mg/hari
- Vitamin C: ${avgVitC.toFixed(1)} mg/hari
- Vitamin D: ${avgVitD.toFixed(1)} mcg/hari
- Zinc: ${avgZinc.toFixed(1)} mg/hari

== DATA KEGIATAN & ISTIRAHAT ==
${activitiesSummary}

== INSTRUKSI KALKULASI & ATURAN ANALISIS ==
1. Hitung skorHarian (0-100) untuk nutrisi, protein, recovery (tidur vs intensitas latihan), aktivitas, dan konsistensi. Berikan status: "Sangat Baik" (85-100), "Perlu Perbaikan" (70-84), "Bermasalah" (<70).
2. Tentukan statusGoal sesuai goal target (misal: "Cutting Agresif"). Tandai checklist yang sudah atau belum tercapai (defisit kalori, protein, aktivitas, tidur). Estimasi probabilitas keberhasilan besok.
3. Hitung prediksiBerat: hitung rata-rata surplus/defisit harian (TDEE - Kalori makan + Kalori bakar olahraga). Estimasi penurunan/kenaikan lemak per minggu (Defisit/Surplus * 7 / 7700). Berikan prediksi perubahan berat badan dalam 30 hari dan 60 hari.
4. Tentukan bodyFatEstimation: jika user tidak memasukkan Body Fat %, estimasikan secara ilmiah. Hitung Lean Mass dan Fat Mass (kg). Estimasi berapa minggu lagi untuk mencapai body fat target tertentu (misal: target 15%, 12%, 10% untuk pria; 24%, 20%, 18% untuk wanita).
5. Lakukan analisisMakro secara pintar. Berikan peringatan jika lemak < 0.6g/kg BB, karbohidrat terlalu rendah untuk latihan beban, protein optimal, atau protein berlebih.
6. Lakukan analisisMikro secara presisi. Bandingkan asupan harian dengan kebutuhan standar (Vit C: 90mg, Kalium: 4700mg, Magnesium: 350mg, Kalsium: 1000mg). Berikan gap (kekurangan) dan sebutkan rekomendasi makanan Indonesia yang kaya zat gizi tersebut.
7. Hitung recovery score (0-100) berdasarkan durasi tidur (idealnya 7-9 jam), frekuensi latihan, intensitas, dan defisit kalori. Tuliskan penyebab pemulihan kurang maksimal.
8. Lakukan analisisLatihan secara mendalam: hitung total volume latihan beban minggu ini (set * reps * weight) dan bandingkan dengan data sesi sebelumnya jika ada, hitung perubahan persen (progressive overload), dan hitung distribusi set per kelompok otot (misal: Back 12 set, Biceps 8 set).
9. Buat actionPlan harian yang konkret dan mudah dilakukan (3-5 poin).
10. Berikan progressAlert jika berat badan stag (plateau) atau turun terlalu cepat (risiko otot susut), beserta solusi kalorinya (misal: "Turunkan 150 kcal" atau "Naikkan 200 kcal").
11. Hitung progressMeter: persentase progres menuju target berat badan, sisa kg, dan estimasi tanggal selesai secara logis.

Kembalikan respons dalam JSON dengan format persis seperti ini:
{
  "skorHarian": {
    "nutrisi": 92,
    "protein": 100,
    "recovery": 75,
    "aktivitas": 88,
    "konsistensi": 95,
    "overallScore": 90,
    "status": "Sangat Baik",
    "statusColor": "green"
  },
  "statusGoal": {
    "targetName": "Cutting Aggressive",
    "checklist": [
      { "label": "Defisit kalori tercapai", "achieved": true },
      { "label": "Protein tercapai", "achieved": true },
      { "label": "Aktivitas tercapai", "achieved": true },
      { "label": "Tidur kurang 1 jam", "achieved": false }
    ],
    "tomorrowProbability": 90
  },
  "prediksiBerat": {
    "weeklyDeficit": 4200,
    "estFatLossPerWeek": 0.55,
    "forecast30Days": -2.2,
    "forecast60Days": -4.4
  },
  "bodyFatEstimation": {
    "currentWeight": 82,
    "currentBF": 18.0,
    "leanMass": 67.2,
    "fatMass": 14.8,
    "targets": [
      { "bf": 15, "estWeeks": 4 },
      { "bf": 12, "estWeeks": 9 }
    ]
  },
  "analisisMakro": [
    { "label": "Protein Optimal", "status": "success", "desc": "Asupan protein lu cukup untuk mempertahankan massa otot." }
  ],
  "analisisMikro": [
    { "name": "Vitamin C", "current": 78, "target": 90, "unit": "mg", "gap": 12, "foods": ["Jeruk", "Brokoli"] }
  ],
  "recovery": {
    "score": 68,
    "status": "Cukup Pemulihan",
    "causes": ["Defisit kalori terlalu besar", "Tidur harian kurang dari 7 jam"]
  },
  "analisisLatihan": {
    "summary": "Volume latihan meningkat, progres overload berjalan.",
    "muscles": [
      { "muscle": "Back", "sets": 12 }
    ],
    "volumeThisWeek": 4200,
    "volumeLastWeek": 3800,
    "volumeChangePercent": 10.5
  },
  "actionPlan": [
    { "label": "Target protein minimal 170g", "done": false }
  ],
  "alerts": [
    { "title": "Berat Badan Plateau", "type": "warning", "cause": "Kalori under-reporting atau retensi air", "recommendation": "Turunkan asupan kalori 150 kcal untuk minggu depan." }
  ],
  "progressMeter": {
    "targetWeight": 75,
    "currentWeight": 82,
    "percent": 54,
    "remaining": 7.0,
    "estCompletion": "12 September 2026"
  }
}`;

        const rawJson = await callAI([{ role: 'user', content: prompt }], true, 'llama-3.3-70b-versatile');
        let data = null;
        try {
            let cleanJson = rawJson.trim();
            const match = cleanJson.match(/\{[\s\S]*\}/);
            data = match ? JSON.parse(match[0]) : JSON.parse(cleanJson);
        } catch (e) {
            console.error("Failed to parse progress analysis JSON:", rawJson, e);
            throw new Error("Format analisis dari AI tidak valid. Silakan coba lagi.");
        }
        
        if (data) {
            const finalHtml = renderProgressAnalysisUI(data);
            resultTextEl.innerHTML = finalHtml;
            
            if (typeof DB !== 'undefined') {
                DB.set('lf_analysis_cache', {
                    params: cacheParams,
                    html: finalHtml
                });
            }
            
            const dateSeries = [];
            const tempDate = new Date(fromDate);
            while (tempDate <= toDate) {
                dateSeries.push(new Date(tempDate));
                tempDate.setDate(tempDate.getDate() + 1);
            }
            
            renderProgressAnalysisChart(foodChecked, actChecked, sleepChecked, dateSeries, logs, allActs);
        } else {
            resultTextEl.innerHTML = `<p style="color:var(--danger);">Gagal mendapatkan analisis dari AI. Silakan coba lagi.</p>`;
        }
    } catch (err) {
        console.error('startProgressAnalysis error:', err);
        resultTextEl.innerHTML = `<p style="color:var(--danger);">Error: ${err.message}</p>`;
    }
}

function renderProgressAnalysisUI(data) {
    if (!data) return '<p style="color:var(--danger)">Gagal memuat analisis.</p>';
    
    // 1. Score Harian
    const sh = data.skorHarian || {};
    const scoreColorMap = {
        green: 'var(--success)',
        yellow: '#ff9f0a',
        red: 'var(--danger)'
    };
    const scoreColor = scoreColorMap[sh.statusColor] || 'var(--accent)';
    
    let scoresHtml = '';
    const scoreFields = [
        { label: 'Nutrisi', val: sh.nutrisi },
        { label: 'Protein', val: sh.protein },
        { label: 'Recovery', val: sh.recovery },
        { label: 'Aktivitas', val: sh.aktivitas },
        { label: 'Konsistensi', val: sh.konsistensi }
    ];
    scoreFields.forEach(f => {
        const val = f.val !== undefined ? f.val : 0;
        let pctColor = 'var(--success)';
        if (val < 70) pctColor = 'var(--danger)';
        else if (val < 85) pctColor = '#ff9f0a';
        
        scoresHtml += `
            <div style="flex:1; min-width:80px; text-align:center; padding:10px; background:var(--surface2); border:1px solid var(--border);">
                <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase; margin-bottom:4px;">${f.label}</div>
                <div style="font-size:1.4rem; font-weight:800; color:${pctColor};">${val}</div>
            </div>
        `;
    });

    // 2. Goal Status Checklist
    const sg = data.statusGoal || {};
    let checklistHtml = '';
    (sg.checklist || []).forEach(item => {
        const icon = item.achieved ? '✅' : '❌';
        const color = item.achieved ? 'var(--text)' : 'var(--text3)';
        checklistHtml += `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; color:${color}; font-size:0.9rem;">
                <span>${icon}</span>
                <span>${item.label}</span>
            </div>
        `;
    });

    // 3. Weight Prediction
    const pb = data.prediksiBerat || {};
    const fatLossDir = pb.estFatLossPerWeek >= 0 ? 'turun' : 'naik';
    const absFatLoss = Math.abs(pb.estFatLossPerWeek || 0).toFixed(2);
    
    // 4. Body Fat Estimation
    const bf = data.bodyFatEstimation || {};
    let bfTimelineHtml = '';
    (bf.targets || []).forEach(t => {
        bfTimelineHtml += `
            <div style="display:flex; justify-content:space-between; font-size:0.85rem; padding:4px 0; border-bottom:1px dashed var(--border);">
                <span style="color:var(--text2);">Target BF ${t.bf}%</span>
                <span style="font-weight:700; color:var(--accent);">${t.estWeeks} minggu lagi</span>
            </div>
        `;
    });

    // 5. Smart Macro Analysis
    let macroAnalysisHtml = '';
    (data.analisisMakro || []).forEach(item => {
        const icon = item.status === 'success' ? '🟢' : item.status === 'warning' ? '⚠️' : '🚨';
        macroAnalysisHtml += `
            <div style="margin-bottom:10px; padding:10px; background:var(--surface2); border-left:3px solid ${item.status === 'success' ? 'var(--success)' : item.status === 'warning' ? '#ff9f0a' : 'var(--danger)'};">
                <div style="font-weight:700; font-size:0.85rem; color:var(--text); display:flex; align-items:center; gap:6px;">
                    <span>${icon}</span> <span>${item.label}</span>
                </div>
                <div style="font-size:0.82rem; color:var(--text2); margin-top:2px;">${item.desc}</div>
            </div>
        `;
    });

    // 6. Micro Nutrient Breakdown
    let microHtml = '';
    (data.analisisMikro || []).forEach(m => {
        const gapColor = m.gap > 0 ? '#ff9f0a' : 'var(--success)';
        const pct = Math.min(100, Math.round((m.current / m.target) * 100));
        microHtml += `
            <div style="margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:4px;">
                    <span style="font-weight:600; color:var(--text);">${m.name}</span>
                    <span style="color:var(--text2);">${m.current}/${m.target} ${m.unit} ${m.gap > 0 ? `<span style="color:#ff3366;">(Kurang ${m.gap} ${m.unit})</span>` : '<span style="color:var(--success);">(Cukup)</span>'}</span>
                </div>
                <div style="width:100%; height:6px; background:var(--border); overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:${gapColor};"></div>
                </div>
                <div style="font-size:0.75rem; color:var(--text3); margin-top:2px;">Sumber makanan: ${(m.foods || []).join(', ')}</div>
            </div>
        `;
    });

    // 7. Recovery Score
    const rec = data.recovery || {};
    let recCausesHtml = '';
    (rec.causes || []).forEach(c => {
        recCausesHtml += `<li style="font-size:0.82rem; color:var(--text2); margin-left:14px; margin-bottom:2px;">${c}</li>`;
    });

    // 8. Deep Training Analysis
    const ex = data.analisisLatihan || {};
    let musclesHtml = '';
    (ex.muscles || []).forEach(m => {
        musclesHtml += `
            <div style="background:var(--surface); border:1px solid var(--border); padding:6px 10px; text-align:center;">
                <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase;">${m.muscle}</div>
                <div style="font-size:1.1rem; font-weight:700; color:var(--accent);">${m.sets} Set</div>
            </div>
        `;
    });
    const volDiff = (ex.volumeThisWeek || 0) - (ex.volumeLastWeek || 0);
    const volDir = volDiff >= 0 ? '+' : '-';
    const volPct = ex.volumeChangePercent || 0;

    // 9. Daily Action Plan
    let actionPlanHtml = '';
    (data.actionPlan || []).forEach(item => {
        actionPlanHtml += `
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; font-size:0.88rem;">
                <span style="color:var(--accent);">🎯</span>
                <span style="color:var(--text);">${item.label}</span>
            </div>
        `;
    });

    // 10. Progress Alert
    let alertHtml = '';
    if (data.alerts && data.alerts.length > 0) {
        data.alerts.forEach(a => {
            alertHtml += `
                <div style="background:rgba(255,51,102,0.08); border:1px solid var(--danger); padding:12px 14px; margin-bottom:16px; position:relative;">
                    <div style="font-weight:700; color:var(--danger); font-size:0.9rem; display:flex; align-items:center; gap:6px;">
                        <span>🚨</span> <span>${a.title}</span>
                    </div>
                    <div style="font-size:0.82rem; color:var(--text2); margin-top:4px;"><b>Penyebab:</b> ${a.cause}</div>
                    <div style="font-size:0.82rem; color:var(--success); margin-top:2px;"><b>Saran Coach:</b> ${a.recommendation}</div>
                </div>
            `;
        });
    }

    // 11. Goal Progress Meter
    const pm = data.progressMeter || {};
    const remainingText = pm.remaining !== undefined ? `${Math.abs(pm.remaining).toFixed(1)} kg lagi` : '--';
    const completionText = pm.estCompletion || '--';
    const pmPercent = pm.percent !== undefined ? pm.percent : 0;
    
    let html = `
        <div style="display:flex; flex-direction:column; gap:16px; font-family:var(--font); color:var(--text);">
            
            <!-- Overall Score & Status -->
            <div style="background:linear-gradient(135deg, var(--surface2), var(--surface)); border:1px solid var(--border); padding:20px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:16px;">
                <div>
                    <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Skor Progress Harian</div>
                    <div style="display:flex; align-items:baseline; gap:8px;">
                        <span style="font-size:2.8rem; font-weight:900; color:${scoreColor}; line-height:1;">${sh.overallScore || 0}</span>
                        <span style="font-size:1rem; color:var(--text3);">/100</span>
                    </div>
                    <div style="margin-top:6px; display:inline-flex; align-items:center; gap:6px; padding:3px 10px; background:rgba(0,240,255,0.05); border:1px solid var(--border); font-size:0.8rem; font-weight:700; color:${scoreColor}; text-transform:uppercase;">
                        ${sh.status || 'Sedang'}
                    </div>
                </div>
                <div style="flex:1; min-width:300px; display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end;">
                    ${scoresHtml}
                </div>
            </div>

            <!-- Alerts ( Plateaus / Warnings ) -->
            ${alertHtml}

            <!-- 2-Column Dashboard Grid -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
                
                <!-- Left Column -->
                <div style="display:flex; flex-direction:column; gap:16px;">
                    
                    <!-- Goal Status Checklist -->
                    <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                        <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">🎯 Status Goal: ${sg.targetName || 'Maintenance'}</h4>
                        <div style="margin-bottom:12px;">
                            ${checklistHtml}
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; border-top:1px solid var(--border); padding-top:10px; color:var(--text2);">
                            <span>Probabilitas progress besok:</span>
                            <span style="font-weight:700; color:var(--success); font-size:1rem;">${sg.tomorrowProbability || 0}%</span>
                        </div>
                    </div>

                    <!-- Progress Meter Goal -->
                    <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                        <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">⚖️ Progress Meter Goal</h4>
                        <div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:6px; color:var(--text2);">
                            <span>Target: ${pm.targetWeight || '--'} kg</span>
                            <span>Saat ini: ${pm.currentWeight || '--'} kg</span>
                        </div>
                        <div style="width:100%; height:10px; background:var(--surface2); border:1px solid var(--border); overflow:hidden; margin-bottom:10px;">
                            <div style="width:${pmPercent}%; height:100%; background:linear-gradient(90deg, var(--accent2), var(--accent));"></div>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.8rem;">
                            <span style="color:var(--text2);">Progres: <b style="color:var(--text);">${pmPercent}%</b></span>
                            <span style="color:var(--text2);">Sisa: <b style="color:var(--accent);">${remainingText}</b></span>
                        </div>
                        <div style="font-size:0.75rem; color:var(--text3); border-top:1px solid var(--border); padding-top:8px; margin-top:8px; text-align:center;">
                            📅 Estimasi selesai target: <b>${completionText}</b>
                        </div>
                    </div>

                    <!-- Weight Prediction & Body Composition -->
                    <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                        <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">📈 Prediksi & Komposisi Tubuh</h4>
                        <div style="background:var(--surface2); padding:10px; margin-bottom:12px; font-size:0.82rem; color:var(--text2); line-height:1.4;">
                            • Rata-rata defisit mingguan: <b>${pb.weeklyDeficit || 0} kcal</b><br>
                            • Estimasi lemak ${fatLossDir}: <b>${absFatLoss} kg/minggu</b><br>
                            • Prediksi 30 hari: <b style="color:${pb.forecast30Days <= 0 ? 'var(--success)' : 'var(--danger)'};">${pb.forecast30Days > 0 ? '+' : ''}${pb.forecast30Days} kg</b><br>
                            • Prediksi 60 hari: <b style="color:${pb.forecast60Days <= 0 ? 'var(--success)' : 'var(--danger)'};">${pb.forecast60Days > 0 ? '+' : ''}${pb.forecast60Days} kg</b>
                        </div>
                        <div style="font-size:0.82rem; margin-bottom:8px;">
                            • BF saat ini: <b>${bf.currentBF || '--'}%</b> (Lean: <b>${bf.leanMass || '--'} kg</b> | Fat: <b>${bf.fatMass || '--'} kg</b>)
                        </div>
                        <div>
                            ${bfTimelineHtml}
                        </div>
                    </div>

                </div>

                <!-- Right Column -->
                <div style="display:flex; flex-direction:column; gap:16px;">
                    
                    <!-- Smart Macro Analysis -->
                    <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                        <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">🔥 Analisis Makro Pintar</h4>
                        <div>
                            ${macroAnalysisHtml}
                        </div>
                    </div>

                    <!-- Micro Nutrient Breakdown -->
                    <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                        <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">🥛 Analisis Gizi Mikro</h4>
                        <div>
                            ${microHtml}
                        </div>
                    </div>

                </div>

            </div>

            <!-- Recovery & Deep Training Analysis & Daily Action Plan -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
                
                <!-- Recovery Card -->
                <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                    <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                    <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">😴 Recovery & Pemulihan</h4>
                    <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:8px;">
                        <span style="font-size:2rem; font-weight:900; color:${rec.score >= 80 ? 'var(--success)' : rec.score >= 60 ? '#ff9f0a' : 'var(--danger)'};">${rec.score || 0}</span>
                        <span style="font-size:0.85rem; color:var(--text2);">/100 (${rec.status || 'Cukup'})</span>
                    </div>
                    <ul style="padding-left:0; list-style:none;">
                        ${recCausesHtml}
                    </ul>
                </div>

                <!-- Deep Training Analysis -->
                <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                    <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                    <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">🏋️ Deep Training Analysis</h4>
                    <div style="font-size:0.82rem; color:var(--text2); margin-bottom:10px; line-height:1.4;">
                        • ${ex.summary || 'Latihan tercatat.'}
                    </div>
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap:8px; margin-bottom:12px;">
                        ${musclesHtml}
                    </div>
                    <div style="font-size:0.8rem; color:var(--text3); border-top:1px solid var(--border); padding-top:8px;">
                        • Volume beban: <b>${ex.volumeThisWeek || 0} kg</b> vs <b>${ex.volumeLastWeek || 0} kg</b> (Progressive Overload: <b style="color:${volDiff >= 0 ? 'var(--success)' : 'var(--danger)'};">${volDir}${volPct}%</b>)
                    </div>
                </div>

                <!-- Daily Action Plan -->
                <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                    <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                    <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">📝 Daily Action Plan</h4>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        ${actionPlanHtml}
                    </div>
                </div>

            </div>

        </div>
    `;
    
    return html;
}

function renderProgressAnalysisChart(foodChecked, actChecked, sleepChecked, dateSeries, logs, allActs) {
    const canvas = document.getElementById('progressAnalysisChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (progressAnalysisChart) {
        progressAnalysisChart.destroy();
    }
    
    const labels = dateSeries.map(d => `${d.getDate()}/${d.getMonth()+1}`);
    
    const formatDateLocal = (d) => {
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    
    const logsByDate = {};
    logs.forEach(l => {
        const key = l.date;
        if (!logsByDate[key]) logsByDate[key] = [];
        logsByDate[key].push(l);
    });
    
    const datasets = [];
    
    if (foodChecked) {
        const calorieData = dateSeries.map(d => {
            const key = formatDateLocal(d);
            const dayLogs = logsByDate[key] || [];
            return dayLogs.reduce((sum, item) => sum + (item.totals ? item.totals.cal || 0 : 0), 0);
        });
        
        const proteinData = dateSeries.map(d => {
            const key = formatDateLocal(d);
            const dayLogs = logsByDate[key] || [];
            return dayLogs.reduce((sum, item) => sum + (item.totals ? item.totals.protein || 0 : 0), 0);
        });
        
        datasets.push({
            label: 'Asupan Kalori (kcal)',
            data: calorieData,
            borderColor: '#6c63ff',
            backgroundColor: 'rgba(108, 99, 255, 0.1)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: labels.length === 1 ? 0 : 3,
            yAxisID: 'y'
        });
        
        datasets.push({
            label: 'Protein (g)',
            data: proteinData,
            borderColor: '#00d9a6',
            backgroundColor: labels.length === 1 ? 'rgba(0, 217, 166, 0.5)' : 'transparent',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: labels.length === 1 ? 0 : 3,
            yAxisID: 'y1'
        });
    }
    
    if (actChecked) {
        const burnData = dateSeries.map(d => {
            const key = formatDateLocal(d);
            const dayActs = allActs[key] || [];
            return dayActs.reduce((sum, item) => sum + ((item.burn && item.burn.kcal) ? parseFloat(item.burn.kcal) : 0), 0);
        });
        
        datasets.push({
            label: 'Kalori Terbakar (kcal)',
            data: burnData,
            borderColor: '#ff4d6d',
            backgroundColor: 'rgba(255, 77, 109, 0.15)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: labels.length === 1 ? 0 : 3,
            yAxisID: 'y'
        });
    }
    
    if (sleepChecked) {
        const sleepData = dateSeries.map(d => {
            const key = formatDateLocal(d);
            const dayActs = allActs[key] || [];
            const sleepAct = dayActs.find(a => a.type === 'sleep');
            return sleepAct ? parseFloat(sleepAct.hours || 0) : 0;
        });
        
        datasets.push({
            label: 'Tidur (jam)',
            data: sleepData,
            borderColor: '#a78bfa',
            backgroundColor: labels.length === 1 ? 'rgba(167, 139, 250, 0.5)' : 'transparent',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: labels.length === 1 ? 0 : 3,
            yAxisID: 'y1'
        });
    }
    
    const scales = {
        x: {
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#8caebf', font: { family: '"Inter", sans-serif', size: 10 } }
        },
        y: {
            type: 'linear',
            display: true,
            position: 'left',
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#8caebf', font: { family: '"Inter", sans-serif', size: 10 } }
        }
    };
    
    if (foodChecked || sleepChecked) {
        scales.y1 = {
            type: 'linear',
            display: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#8caebf', font: { family: '"Inter", sans-serif', size: 10 } },
            title: { display: true, text: 'Protein (g) / Tidur (jam)', color: '#00d9a6' }
        };
    }
    
    const chartType = labels.length === 1 ? 'bar' : 'line';
    
    progressAnalysisChart = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { color: '#8caebf', font: { family: '"Inter", sans-serif', size: 11 } }
                }
            },
            scales: scales
        }
    });
}

// ===== PHYSICAL EVALUATION VIA PHOTO AND AI =====
function switchProgressTab(tab) {
    const btnTrend = document.getElementById('btnProgressTabTrend');
    const btnPhysical = document.getElementById('btnProgressTabPhysical');
    const contentData = document.getElementById('progress-data-content');
    const contentPhysical = document.getElementById('progress-physical-content');
    
    if (tab === 'trend') {
        btnTrend.classList.add('active');
        btnPhysical.classList.remove('active');
        contentData.classList.remove('hidden');
        contentPhysical.classList.add('hidden');
    } else {
        btnTrend.classList.remove('active');
        btnPhysical.classList.add('active');
        contentData.classList.add('hidden');
        contentPhysical.classList.remove('hidden');
    }
    
    if (window.lucide) lucide.createIcons();
}

function handlePhysicalFileSelect(event) {
    event.stopPropagation();
    event.preventDefault();
    
    const files = event.target.files || event.dataTransfer.files;
    if (!files || files.length === 0) return;
    
    const file = files[0];
    if (!file.type.startsWith('image/')) {
        showToast('File harus berupa gambar!', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('physicalImagePreview').src = e.target.result;
        document.getElementById('physicalUploadPlaceholder').classList.add('hidden');
        document.getElementById('physicalPreviewContainer').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function removePhysicalPhoto(event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    document.getElementById('physicalFileInput').value = '';
    document.getElementById('physicalImagePreview').src = '';
    document.getElementById('physicalPreviewContainer').classList.add('hidden');
    document.getElementById('physicalUploadPlaceholder').classList.remove('hidden');
}

async function startPhysicalAnalysis() {
    const apiKey = getVisionKey() || localStorage.getItem('lf_visionkey');
    const resultTextEl = document.getElementById('physicalAiResultText');
    const resultCard = document.getElementById('physicalResultCard');
    
    if (!apiKey) {
        alert('Set Secret Token (Vision) terlebih dahulu di menu Settings!');
        showPage('settings');
        return;
    }
    
    const imgPreview = document.getElementById('physicalImagePreview');
    if (!imgPreview.src || imgPreview.src.includes('localhost') || imgPreview.src === '') {
        alert('Harap unggah foto kondisi badan terlebih dahulu!');
        return;
    }
    
    resultCard.style.display = 'block';
    resultTextEl.innerHTML = `<div style="display:flex;align-items:center;gap:10px;color:var(--text2);padding:8px 0;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:lfSpin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="19.07"/></svg>
        Menganalisis kondisi fisik dengan LebihFit Tools AI...
    </div>`;
    
    try {
        const profile = getProfile() || {};
        const days = parseInt(document.getElementById('physicalDataPeriod').value) || 7;
        const customDesc = document.getElementById('physicalDescInput').value.trim();
        
        const today = new Date();
        const fromDate = new Date();
        fromDate.setDate(today.getDate() - days + 1);
        
        const logs = getLogsRange(fromDate, today);
        const allActs = getActivitiesRange(fromDate, today);
        
        // Calculate food metrics
        const dataLen = logs.length || 1;
        const avgCal = logs.reduce((s, d) => s + (d.totals ? d.totals.cal || 0 : 0), 0) / dataLen;
        const avgProtein = logs.reduce((s, d) => s + (d.totals ? d.totals.protein || 0 : 0), 0) / dataLen;
        const avgCarbs = logs.reduce((s, d) => s + (d.totals ? d.totals.carbs || 0 : 0), 0) / dataLen;
        const avgFat = logs.reduce((s, d) => s + (d.totals ? d.totals.fat || 0 : 0), 0) / dataLen;
        const avgFiber = logs.reduce((s, d) => s + (d.totals ? d.totals.fiber || 0 : 0), 0) / dataLen;
        
        // Calculate activities
        let workoutCount = 0, gymCount = 0, cardioCount = 0, sleepData = [], totalBurnedKcal = 0;
        Object.values(allActs).forEach(dayActs => {
            dayActs.forEach(a => {
                if (a.type === 'workout') workoutCount++;
                else if (a.type === 'gym') gymCount++;
                else if (a.type === 'cardio') cardioCount++;
                else if (a.type === 'sleep') sleepData.push(a.hours);
                if (a.burn && a.burn.kcal) totalBurnedKcal += parseFloat(a.burn.kcal);
            });
        });
        const avgSleep = sleepData.length > 0 ? (sleepData.reduce((s,x)=>s+x, 0) / sleepData.length).toFixed(1) : 'tidak tercatat';
        const avgBurn = (totalBurnedKcal / days).toFixed(0);
        
        // Prepare base64 image details
        const base64Data = imgPreview.src.split(',')[1];
        const mimeType = imgPreview.src.split(',')[0].split(':')[1].split(';')[0];

        // Cache system to save Gemini tokens
        function hashString(str) {
            let hash = 0x811c9dc5;
            for (let i = 0; i < str.length; i++) {
                hash ^= str.charCodeAt(i);
                hash = Math.imul(hash, 0x01000193);
            }
            return (hash >>> 0).toString(16);
        }

        const inputString = [
            base64Data,
            days.toString(),
            customDesc || '',
            JSON.stringify(profile),
            avgCal.toFixed(0),
            avgProtein.toFixed(1),
            avgCarbs.toFixed(1),
            avgFat.toFixed(1),
            avgFiber.toFixed(1),
            workoutCount.toString(),
            gymCount.toString(),
            cardioCount.toString(),
            avgSleep.toString(),
            avgBurn.toString()
        ].join('|');
        const currentHash = hashString(inputString);

        let cached = null;
        if (typeof fbDb !== 'undefined' && fbDb) {
            const email = localStorage.getItem('lf_user_email');
            if (email) {
                const safeEmail = email.replace(/\"/g, '').replace(/[\.\#\$\[\]]/g, '_');
                try {
                    const snapshot = await fbDb.ref(`users/${safeEmail}/lf_physical_analysis_cache`).once('value');
                    cached = snapshot.val();
                } catch (e) {
                    console.error("Firebase read error:", e);
                }
            }
        }
        if (!cached) {
            cached = DB.get('lf_physical_analysis_cache');
        }

        if (cached && cached.hash === currentHash) {
            console.log("[lebihfit] Loading physical analysis from cache");
            resultTextEl.innerHTML = renderPhysicalAnalysisUI(cached.data);
            return;
        }
        
        // Build the prompt for Gemini Flash requesting JSON
        let promptText = `Kamu adalah AI Personal Coach, pelatih fitness personal, dan ahli gizi klinis profesional.
Tugas kamu adalah menganalisis foto kondisi fisik tubuh user ini secara visual (otot, lemak, proporsi tubuh) dan mengaitkannya dengan data profil serta riwayat asupan/olahraga selama ${days} hari terakhir.
Kembalikan respons HANYA dalam format JSON valid sesuai dengan skema yang diberikan di bawah ini.

== PROFIL PENGGUNA ==
- Tinggi Badan (TB): ${profile.tb || '?'} cm
- Berat Badan (BB): ${profile.bb || '?'} kg
- Usia: ${profile.usia || '?'} tahun
- Jenis Kelamin: ${profile.gender || 'pria'}
- Level Aktivitas Harian: ${profile.aktivitas || 'sedentary'}
- Target / Goal Kebugaran: ${profile.target || 'maintenance'} (${profile.catatan || 'tanpa catatan khusus'})

== RIWAYAT ${days} HARI TERAKHIR ==
- Rata-rata Kalori Asupan: ${Math.round(avgCal)} kcal/hari (target: ${profile.targets?.cal || 2000} kcal)
- Rata-rata Protein: ${avgProtein.toFixed(1)} g/hari (target: ${profile.targets?.protein || 120} g)
- Rata-rata Karbohidrat: ${avgCarbs.toFixed(1)} g/hari
- Rata-rata Lemak: ${avgFat.toFixed(1)} g/hari
- Rata-rata Serat: ${avgFiber.toFixed(1)} g/hari
- Total Latihan: ${workoutCount + gymCount} sesi latihan beban (Gym: ${gymCount}, Workout: ${workoutCount}), serta ${cardioCount} sesi kardio
- Estimasi Kalori Terbakar Olahraga: ${avgBurn} kcal/hari
- Rata-rata Tidur/Istirahat: ${avgSleep} jam/hari

Catatan Tambahan User: "${customDesc || '-'}"

== SKEMA JSON RESPONS (WAJIB PERSIS SEPERTI INI) ==
{
  "ringkasanSederhana": {
    "pros": ["Asupan protein optimal", "Defisit kalori sudah tepat"],
    "cons": ["Tidur terlalu rendah", "Lemak terlalu rendah", "Serat terlalu rendah"],
    "focus": "Tidur + Lemak + Serat"
  },
  "targetMakro": {
    "cal": 2000,
    "protein": 170,
    "carbs": 180,
    "fat": 60,
    "fiber": "25-35g",
    "water": "3 Liter"
  },
  "makananRekomendasi": {
    "category": "Sumber Lemak yang Direkomendasikan",
    "foods": ["Telur utuh", "Alpukat", "Kacang tanah", "Kacang almond", "Ikan salmon", "Minyak zaitun"]
  },
  "prioritasPerbaikan": [
    { "label": "Tidur", "impact": "Sangat Tinggi", "desc": "Tidur rata-rata hanya 5.7 jam. Sangat mengganggu recovery otot." },
    { "label": "Serat", "impact": "Tinggi", "desc": "Tambahkan brokoli, bayam, wortel, apel, atau pisang." },
    { "label": "Lemak", "impact": "Tinggi", "desc": "Asupan lemak terlalu rendah untuk produksi hormon sehat." }
  ],
  "perkiraanGoal": {
    "currentBF": "16-18%",
    "targetBF": "10-12%",
    "weeks": "8-12 minggu",
    "desc": "Dengan konsistensi tinggi pada defisit kalori dan latihan beban."
  },
  "kesalahanTerbesar": [
    "Tidur hanya 5.7 jam",
    "Lemak terlalu rendah",
    "Serat terlalu rendah"
  ],
  "analisisRisiko": {
    "muscleLoss": "Rendah",
    "plateau": "Sedang",
    "recoveryDisruption": "Tinggi",
    "notes": "Risiko pemulihan terganggu tinggi karena kurang tidur."
  },
  "estimasiFisik30Hari": {
    "waist": "turun 2-4 cm",
    "weight": "turun 1.5-3 kg",
    "bodyFat": "turun 1-2%",
    "desc": "Otot perut bagian atas akan terlihat lebih jelas."
  },
  "nutrisiBerpotensiKurang": [
    { "name": "Vitamin D", "sources": ["Salmon", "Susu", "Telur"] },
    { "name": "Magnesium", "sources": ["Bayam", "Cokelat hitam", "Kacang-kacangan"] }
  ],
  "recoveryScore": {
    "sleep": 45,
    "protein": 95,
    "calorie": 90,
    "training": 85,
    "total": 79
  }
}`;
                      
        const rawJson = await analyzePhysicalPhotoAI(base64Data, mimeType, promptText, true);
        let data = null;
        try {
            let cleanJson = rawJson.trim();
            const match = cleanJson.match(/\{[\s\S]*\}/);
            data = match ? JSON.parse(match[0]) : JSON.parse(cleanJson);
        } catch (e) {
            console.error("Failed to parse physical analysis JSON:", rawJson, e);
            throw new Error("Format evaluasi dari AI tidak valid. Silakan coba lagi.");
        }

        if (data) {
            const cacheObj = { hash: currentHash, data: data };
            if (typeof fbDb !== 'undefined' && fbDb) {
                const email = localStorage.getItem('lf_user_email');
                if (email) {
                    const safeEmail = email.replace(/\"/g, '').replace(/[\.\#\$\[\]]/g, '_');
                    fbDb.ref(`users/${safeEmail}/lf_physical_analysis_cache`).set(cacheObj).catch(console.error);
                }
            }
            DB.set('lf_physical_analysis_cache', cacheObj);
            resultTextEl.innerHTML = renderPhysicalAnalysisUI(data);
        } else {
            resultTextEl.innerHTML = `<p style="color:var(--danger);">Gagal mendapatkan analisis dari AI. Silakan coba lagi.</p>`;
        }
    } catch (err) {
        console.error('startPhysicalAnalysis error:', err);
        resultTextEl.innerHTML = `<p style="color:var(--danger);">Error: ${err.message}</p>`;
    }
}

function renderPhysicalAnalysisUI(data) {
    if (!data) return '<p style="color:var(--danger)">Gagal memuat analisis fisik.</p>';

    // 1. Ringkasan Super Singkat
    const rs = data.ringkasanSederhana || {};
    let prosHtml = (rs.pros || []).map(p => `<li style="font-size:0.85rem; color:var(--success); margin-bottom:4px; list-style:none;">🟢 ${p}</li>`).join('');
    let consHtml = (rs.cons || []).map(c => `<li style="font-size:0.85rem; color:#ff3366; margin-bottom:4px; list-style:none;">⚠️ ${c}</li>`).join('');
    
    // 2. Recovery Score
    const rec = data.recoveryScore || {};
    const recTotal = rec.total || 0;
    let recColor = 'var(--success)';
    if (recTotal < 70) recColor = 'var(--danger)';
    else if (recTotal < 85) recColor = '#ff9f0a';
    
    let recSplitHtml = '';
    const recFields = [
        { label: 'Tidur', val: rec.sleep },
        { label: 'Protein', val: rec.protein },
        { label: 'Kalori', val: rec.calorie },
        { label: 'Latihan', val: rec.training }
    ];
    recFields.forEach(f => {
        recSplitHtml += `
            <div style="flex:1; min-width:65px; text-align:center; padding:6px; background:var(--surface2); border:1px solid var(--border);">
                <div style="font-size:0.7rem; color:var(--text2); text-transform:uppercase; margin-bottom:2px;">${f.label}</div>
                <div style="font-weight:700; font-size:1.1rem; color:var(--accent);">${f.val || 0}</div>
            </div>
        `;
    });

    // 3. Target Makro Ideal
    const tm = data.targetMakro || {};
    
    // 4. Makanan yang Direkomendasikan
    const mr = data.makananRekomendasi || {};
    let foodsHtml = (mr.foods || []).map(f => `
        <div style="background:var(--surface2); border:1px solid var(--border); padding:6px 12px; font-size:0.85rem; color:var(--text); text-align:center;">
            ${f}
        </div>
    `).join('');

    // 5. Prioritas Perbaikan
    let prioritasHtml = '';
    (data.prioritasPerbaikan || []).forEach((p, idx) => {
        const impactColors = {
            'Sangat Tinggi': 'var(--danger)',
            'Tinggi': '#ff9f0a',
            'Sedang': 'var(--warning)',
            'Rendah': 'var(--success)'
        };
        const badgeColor = impactColors[p.impact] || 'var(--accent)';
        
        prioritasHtml += `
            <div style="display:flex; align-items:flex-start; gap:12px; padding:12px; background:var(--surface2); border-left:3px solid ${badgeColor}; margin-bottom:8px;">
                <div style="font-weight:900; font-size:1.2rem; color:${badgeColor}; line-height:1; width:20px;">#${idx+1}</div>
                <div style="flex:1;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:2px;">
                        <span style="font-weight:700; font-size:0.9rem; color:var(--text);">${p.label}</span>
                        <span style="font-size:0.7rem; font-weight:700; color:${badgeColor}; text-transform:uppercase; background:rgba(255,255,255,0.03); padding:2px 6px; border:1px solid ${badgeColor};">Impact: ${p.impact}</span>
                    </div>
                    <div style="font-size:0.82rem; color:var(--text2);">${p.desc}</div>
                </div>
            </div>
        `;
    });

    // 6. Perkiraan Goal & 7. Estimasi Fisik 30 Hari
    const pg = data.perkiraanGoal || {};
    const ef = data.estimasiFisik30Hari || {};

    // 8. Kesalahan Terbesar
    let kesalahanHtml = (data.kesalahanTerbesar || []).map(k => `
        <div style="display:flex; align-items:center; gap:8px; font-size:0.85rem; color:var(--text2); margin-bottom:4px;">
            <span style="color:var(--danger);">❌</span>
            <span>${k}</span>
        </div>
    `).join('');

    // 9. Analisis Risiko
    const ar = data.analisisRisiko || {};
    const getRiskColor = (level) => {
        if (level === 'Tinggi') return 'var(--danger)';
        if (level === 'Sedang') return '#ff9f0a';
        return 'var(--success)';
    };

    // 10. Nutrisi Potensial Kurang
    let nutrisiKurangHtml = '';
    (data.nutrisiBerpotensiKurang || []).forEach(n => {
        nutrisiKurangHtml += `
            <div style="margin-bottom:8px; padding-bottom:6px; border-bottom:1px dashed var(--border);">
                <div style="font-weight:700; font-size:0.85rem; color:var(--accent2); margin-bottom:2px;">⚠️ Potensi Kurang: ${n.name}</div>
                <div style="font-size:0.78rem; color:var(--text3);">Saran Makanan: ${(n.sources || []).join(', ')}</div>
            </div>
        `;
    });

    let html = `
        <div style="display:flex; flex-direction:column; gap:16px; font-family:var(--font); color:var(--text);">
            
            <!-- Ringkasan Super Singkat & Recovery Score -->
            <div style="background:linear-gradient(135deg, var(--surface2), var(--surface)); border:1px solid var(--border); padding:16px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:stretch; gap:16px;">
                
                <!-- 3-Second Summary -->
                <div style="flex:1; min-width:260px; display:flex; flex-direction:column; justify-content:space-between;">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; font-weight:700;">⚡ Ringkasan AI (3 Detik Baca)</div>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                            <div>
                                <div style="font-size:0.7rem; color:var(--text3); text-transform:uppercase; margin-bottom:4px; font-weight:700;">Kelebihan</div>
                                <ul style="padding:0; margin:0;">${prosHtml}</ul>
                            </div>
                            <div>
                                <div style="font-size:0.7rem; color:var(--text3); text-transform:uppercase; margin-bottom:4px; font-weight:700;">Kekurangan</div>
                                <ul style="padding:0; margin:0;">${consHtml}</ul>
                            </div>
                        </div>
                    </div>
                    <div style="background:rgba(0,240,255,0.05); border:1px solid var(--border); padding:8px 12px; font-size:0.82rem; font-weight:700; color:var(--accent); text-align:center;">
                        🎯 Fokus Minggu Ini: ${rs.focus || '--'}
                    </div>
                </div>

                <!-- Recovery Score split -->
                <div style="width:240px; display:flex; flex-direction:column; justify-content:space-between; border-left:1px solid var(--border); padding-left:16px;">
                    <div>
                        <div style="font-size:0.75rem; color:var(--text2); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px; font-weight:700;">Recovery Score</div>
                        <div style="display:flex; align-items:baseline; gap:6px;">
                            <span style="font-size:2.4rem; font-weight:900; color:${recColor}; line-height:1;">${recTotal}</span>
                            <span style="font-size:0.85rem; color:var(--text3);">/100</span>
                        </div>
                    </div>
                    <div style="display:flex; gap:6px; margin-top:8px;">
                        ${recSplitHtml}
                    </div>
                </div>
            </div>

            <!-- Target Makro Ideal Harian -->
            <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">⚖️ Target Makro Ideal Harian</h4>
                <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:8px; margin-bottom:10px;">
                    <div style="background:var(--surface2); border:1px solid var(--border); padding:8px; text-align:center;">
                        <div style="font-size:0.7rem; color:var(--text2); text-transform:uppercase;">Kalori</div>
                        <div style="font-size:1.1rem; font-weight:800; color:var(--accent);">${tm.cal || 0} kcal</div>
                    </div>
                    <div style="background:var(--surface2); border:1px solid var(--border); padding:8px; text-align:center;">
                        <div style="font-size:0.7rem; color:var(--text2); text-transform:uppercase;">Protein</div>
                        <div style="font-size:1.1rem; font-weight:800; color:var(--accent);">${tm.protein || 0}g</div>
                    </div>
                    <div style="background:var(--surface2); border:1px solid var(--border); padding:8px; text-align:center;">
                        <div style="font-size:0.7rem; color:var(--text2); text-transform:uppercase;">Karbo</div>
                        <div style="font-size:1.1rem; font-weight:800; color:var(--accent);">${tm.carbs || 0}g</div>
                    </div>
                    <div style="background:var(--surface2); border:1px solid var(--border); padding:8px; text-align:center;">
                        <div style="font-size:0.7rem; color:var(--text2); text-transform:uppercase;">Lemak</div>
                        <div style="font-size:1.1rem; font-weight:800; color:var(--accent);">${tm.fat || 0}g</div>
                    </div>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text2); border-top:1px solid var(--border); padding-top:8px;">
                    <span>Target Serat: <b>${tm.fiber || '--'}</b></span>
                    <span>Target Air: <b>${tm.water || '--'}</b></span>
                </div>
            </div>

            <!-- Two Column Layout -->
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:16px;">
                
                <!-- Left Column -->
                <div style="display:flex; flex-direction:column; gap:16px;">
                    
                    <!-- Prioritas Perbaikan -->
                    <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                        <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">🛠️ Prioritas Perbaikan</h4>
                        <div>
                            ${prioritasHtml}
                        </div>
                    </div>

                    <!-- Makanan yang Direkomendasikan -->
                    <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                        <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">🥑 Makanan yang Direkomendasikan</h4>
                        <div style="font-size:0.8rem; color:var(--text2); margin-bottom:8px; font-weight:700;">
                            Kategori: ${mr.category || 'Belanjaan Sehat'}
                        </div>
                        <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap:8px;">
                            ${foodsHtml}
                        </div>
                    </div>

                </div>

                <!-- Right Column -->
                <div style="display:flex; flex-direction:column; gap:16px;">
                    
                    <!-- Perkiraan Waktu & Estimasi Fisik 30 Hari -->
                    <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                        <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">🔮 Perkiraan Goal & Estimasi Fisik</h4>
                        <div style="background:var(--surface2); padding:12px; margin-bottom:12px; font-size:0.82rem; line-height:1.4;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px; border-bottom:1px solid var(--border); padding-bottom:4px;">
                                <span style="color:var(--text2);">Body Fat Saat Ini:</span>
                                <span style="font-weight:700; color:var(--text);">${pg.currentBF || '--'}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px; border-bottom:1px solid var(--border); padding-bottom:4px;">
                                <span style="color:var(--text2);">Target Body Fat:</span>
                                <span style="font-weight:700; color:var(--text);">${pg.targetBF || '--'}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px; border-bottom:1px solid var(--border); padding-bottom:4px;">
                                <span style="color:var(--text2);">Estimasi Waktu:</span>
                                <span style="font-weight:700; color:var(--accent);">${pg.weeks || '--'}</span>
                            </div>
                            <div style="font-size:0.78rem; color:var(--text3); margin-top:4px;">
                                ${pg.desc || ''}
                            </div>
                        </div>
                        <div style="background:rgba(0,240,255,0.03); border:1px dashed var(--accent2); padding:10px; font-size:0.82rem; line-height:1.4;">
                            <div style="font-weight:700; color:var(--accent2); margin-bottom:4px; font-size:0.85rem;">Jika Konsisten 30 Hari:</div>
                            • Lingkar Pinggang: <b style="color:var(--success);">${ef.waist || '--'}</b><br>
                            • Berat Badan: <b style="color:var(--success);">${ef.weight || '--'}</b><br>
                            • Body Fat %: <b style="color:var(--success);">${ef.bodyFat || '--'}</b><br>
                            <span style="font-size:0.75rem; color:var(--text3); display:block; margin-top:4px;">${ef.desc || ''}</span>
                        </div>
                    </div>

                    <!-- Kesalahan Terbesar & Analisis Risiko -->
                    <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                        <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">⚠️ Kesalahan & Analisis Risiko</h4>
                        <div style="margin-bottom:12px;">
                            ${kesalahanHtml}
                        </div>
                        <div style="background:var(--surface2); padding:10px; font-size:0.8rem; line-height:1.4;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                                <span style="color:var(--text2);">Risiko Susut Otot:</span>
                                <span style="font-weight:700; color:${getRiskColor(ar.muscleLoss)};">${ar.muscleLoss || 'Rendah'}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                                <span style="color:var(--text2);">Risiko Plateau:</span>
                                <span style="font-weight:700; color:${getRiskColor(ar.plateau)};">${ar.plateau || 'Rendah'}</span>
                            </div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:3px;">
                                <span style="color:var(--text2);">Gangguan Recovery:</span>
                                <span style="font-weight:700; color:${getRiskColor(ar.recoveryDisruption)};">${ar.recoveryDisruption || 'Rendah'}</span>
                            </div>
                            <div style="font-size:0.75rem; color:var(--text3); border-top:1px solid var(--border); padding-top:4px; margin-top:4px;">
                                💡 ${ar.notes || ''}
                            </div>
                        </div>
                    </div>

                    <!-- Nutrisi Potensial Kurang -->
                    <div style="background:var(--surface); border:1px solid var(--border); padding:16px; position:relative;">
                        <div style="position:absolute; top:0; left:0; width:2px; height:100%; background:var(--accent);"></div>
                        <h4 style="font-size:0.85rem; font-weight:800; color:var(--accent); text-transform:uppercase; margin-bottom:12px; letter-spacing:0.5px;">🥛 Nutrisi Potensial Kurang</h4>
                        <div>
                            ${nutrisiKurangHtml}
                        </div>
                    </div>

                </div>

            </div>

        </div>
    `;

    return html;
}