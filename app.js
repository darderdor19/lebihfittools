// State and Initialization
let currentChart = null;
let currentMacroChart = null;

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

const GAS_URL = "https://script.google.com/macros/s/AKfycbwc-dizRUMCBGBS61h96Znw3QLslZBnRmSA52JQB0TizZ0TsruV65mJpL_wmyBS5RAI/exec"; // Ganti dengan Web App URL dari Google Apps Script
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
            showPage('dashboard');
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
        const res = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'requestOTP', email: email, name: name })
        });
        const data = await res.json();
        
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
        const res = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'verifyOTP', email: tempAuthEmail, otp: otp })
        });
        const data = await res.json();
        
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
        setPeriod('week');
    }
    if (pageId === 'calculator') {
        prefillRecalcForm();
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
    document.getElementById('calConsumed').textContent = Math.round(calConsumed);
    document.getElementById('calTarget').textContent = calTarget;
    document.getElementById('calRemaining').textContent = Math.max(0, calTarget - Math.round(calConsumed));
    
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
                <div class="micro-label">${m.label}</div>
                <div class="micro-val">${Math.round(val)}${m.unit} <small style="font-size:0.7em;color:var(--text2)">/ ${target}</small></div>
                <div class="micro-bar"><div class="micro-bar-fill ${over}" style="width:${pct}%"></div></div>
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
                    <button class="food-action-btn" onclick="openEditModal('${item.id}')" title="Edit">✏️</button>
                    <button class="food-action-btn" onclick="confirmDeleteFood('${item.id}')" title="Hapus">🗑️</button>
                </div>
            </div>
        `).join('');
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
            document.getElementById('photoPreview').src = e.target.result;
            document.getElementById('photoPreviewWrap').classList.remove('hidden');
            document.getElementById('photoUploadArea').classList.add('hidden');
            
            const base64Data = e.target.result.split(',')[1];
            currentPhotoBase64 = base64Data;
            currentPhotoMime = file.type;
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
        btn.innerHTML = '🤖 Analisis AI';
        btn.disabled = false;
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
    document.getElementById('editMealTime').value = item.mealTime || 'makan_siang';
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
    
    document.getElementById('editModal').classList.remove('hidden');
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
    showToast('Makanan berhasil diupdate', 'success');
});

function confirmDeleteFood(id) {
    if (confirm('Yakin ingin menghapus makanan ini?')) {
        deleteFoodItem(id);
        renderDashboard();
        showToast('Makanan dihapus', 'info');
    }
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
}

function loadHistory() {
    const fromVal = document.getElementById('dateFrom').value;
    const toVal = document.getElementById('dateTo').value;
    if (fromVal && toVal) {
        loadHistoryData(new Date(fromVal), new Date(toVal));
    }
}

function renderHistoryChart(data) {
    const ctx = document.getElementById('historyChart');
    if (!ctx) return;
    
    const labels = data.map(d => {
        const date = new Date(d.date);
        return `${date.getDate()}/${date.getMonth()+1}`;
    });
    const cals = data.map(d => d.totals.cal);
    
    if (currentChart) currentChart.destroy();
    
    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Kalori',
                data: cals,
                borderColor: '#6c63ff',
                backgroundColor: 'rgba(108, 99, 255, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#2a2a3d' }, ticks: { color: '#9999b3' } },
                x: { grid: { color: '#2a2a3d' }, ticks: { color: '#9999b3' } }
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
                backgroundColor: ['#a78bfa', '#ffcc02', '#ff4d6d'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'bottom', labels: { color: '#9999b3' } } 
            }
        }
    });
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
        <div style="background: var(--surface2); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border); margin-bottom: 12px;">
            <div style="font-weight: 700; color: var(--text1); font-size: 0.95rem;">${authUser.name || 'Bro'}</div>
            <div style="font-size: 0.75rem; color: var(--text2); margin-bottom: 12px; word-break: break-all;">${authUser.email || ''}</div>
            
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
            <div style="color:var(--success);margin-bottom:12px;font-weight:600">✅ Profil Berhasil Diupdate!</div>
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
        btn.innerHTML = '🤖 Update Target dengan AI';
        btn.disabled = false;
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
        div.className = 'api-status ok';
        div.innerHTML = '✅ API Key tersimpan. Fitur siap digunakan.';
    } else {
        div.className = 'api-status err';
        div.innerHTML = '⚠️ API Key belum diset. Fitur AI tidak bisa digunakan.';
    }
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
    if (confirm('⚠️ PERINGATAN BAAHAYA! ⚠️\n\nApakah kamu YAKIN ingin menghapus SEMUA data nutrisi dan profil kamu? Data yang dihapus tidak bisa dikembalikan!')) {
        DB.del('lf_profile');
        DB.del('lf_logs');
        showToast('Semua data telah dihapus. Reloading...', 'error');
        setTimeout(() => location.reload(), 1500);
    }
}

function logout() {
    if (confirm("Yakin ingin log out bro?")) {
        clearAuthUser();
        window.location.reload();
    }
}