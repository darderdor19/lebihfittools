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
        setPeriod('week');
    }
    if (pageId === 'settings') checkTelegramStatus();
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
    
    // Call daily AI Analysis
    updateDailyAIAnalysis(logs, profile, authUser ? authUser.email : null);
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
    const cacheKey = `ai_daily_v2_${email}_${today}`;
    const cached = localStorage.getItem(cacheKey);
    let cacheData = null;
    try { if (cached) cacheData = JSON.parse(cached); } catch(e){}

    // Use cache only if food count matches
    if (cacheData && cacheData.logCount === logs.length && cacheData.html) {
        aiContent.innerHTML = cacheData.html;
        return;
    }

    // Show loading spinner
    aiContent.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;padding:10px 0;color:var(--text2);">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:lfSpin 1s linear infinite;flex-shrink:0;">
                <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>
            </svg>
            <span style="font-size:0.9rem;">✨ AI Groq menganalisis gizi harian lu...</span>
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

        const prompt = `Kamu adalah ahli gizi dan pelatih fitness profesional. Evaluasi asupan gizi HARI INI untuk user LebihFit berikut, dan berikan analisis yang mendalam, personal, serta actionable dalam bahasa Indonesia gaul yang ramah (pakai "lu/kamu"):

== DATA HARI INI ==
Profil: ${profile.gender || '?'}, ${profile.bb || '?'}kg/${profile.tb || '?'}cm, Usia: ${profile.usia || '?'}th, Aktivitas: ${profile.aktivitas || '?'}, Goal: ${profile.target || 'maintenance'}

Makanan tercatat (${logs.length} item):
${foodList}

Total aktual vs Target harian:
- Kalori: ${Math.round(totals.cal)} kcal vs ${calTarget} kcal → ${calStatus}
- Protein: ${totals.protein.toFixed(1)}g vs ${targetProtein}g (${Math.round((totals.protein/targetProtein)*100)}%)
- Karbohidrat: ${totals.carbs.toFixed(1)}g vs ${targetCarbs}g (${Math.round((totals.carbs/targetCarbs)*100)}%)
- Lemak: ${totals.fat.toFixed(1)}g vs ${targetFat}g (${Math.round((totals.fat/targetFat)*100)}%)
- Serat: ${totals.fiber.toFixed(1)}g (ideal ≥25g)
- Gula: ${totals.sugar.toFixed(1)}g (batas <50g)
- Sodium: ${Math.round(totals.sodium)}mg (batas <2300mg)

== FORMAT RESPONS ==
Tulis evaluasi dalam HTML VALID (TANPA markdown, TANPA code block). Wajib ada bagian:

1. Status Kalori → <div style="padding:12px 14px;border-left:4px solid [WARNA];border-radius:8px;margin-bottom:10px;background:[BG]"> — isi: status, dampak ke goal, saran konkret untuk sisa hari ini atau besok

2. Analisis Makronutrisi → heading + 3 div (protein, karbo, lemak) masing2 dengan:
   - Status (KURANG/OK/BERLEBIH)
   - Dampak spesifik ke tubuh/performa latihan  
   - Saran makanan konkret untuk melengkapi hari ini / besok

3. Mikronutrisi (jika serat<25 atau gula>50 atau sodium>2300) → ringkas dalam 1 div

4. Saran Aktivitas → berdasarkan sisa kalori dan goal user, sarankan latihan/aktivitas yang tepat hari ini

5. Prioritas Besok → 2-3 hal terpenting yang harus diperbaiki besok (format <ul><li>)

Gunakan warna: hijau (bg:rgba(50,215,75,0.08) border:#32d74b) = OK/cukup, merah (bg:rgba(255,59,48,0.08) border:#ff3b30) = kurang/berlebih bahaya, kuning (bg:rgba(255,214,10,0.08) border:#ffd60a) = perlu perhatian, biru (bg:rgba(0,122,255,0.08) border:#007AFF) = cutting/defisit. Gunakan emoji relevan. JAWAB HANYA HTML, tanpa teks di luar tag HTML.`;

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

            aiContent.innerHTML = aiHtml;

            // Cache the result
            const newCache = { html: aiHtml, logCount: logs.length, timestamp: Date.now() };
            localStorage.setItem(cacheKey, JSON.stringify(newCache));
            syncToFirebase('lf_analysis_' + today, { text: 'AI HTML analysis', logCount: logs.length, timestamp: Date.now() });
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
}

function loadHistory() {
    const fromVal = document.getElementById('dateFrom').value;
    const toVal = document.getElementById('dateTo').value;
    if (fromVal && toVal) {
        loadHistoryData(new Date(fromVal), new Date(toVal));
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