// admin.js
// Logic untuk Admin Panel

let adminAllUsers = {};
let currentEditEmail = '';
let currentEditSafeEmail = '';

// Listener saat pindah ke page-admin
document.addEventListener('DOMContentLoaded', () => {
    const navAdminBtn = document.getElementById('navAdminBtn');
    if (navAdminBtn) {
        navAdminBtn.addEventListener('click', () => {
            loadAllUsers();
            checkSuperAdmin();
        });
    }
});

function checkSuperAdmin() {
    const authUser = getAuthUser();
    if (authUser && authUser.email === 'jadilebihfit@gmail.com') {
        document.getElementById('superAdminSection').style.display = 'block';
        loadAdmins();
    } else {
        document.getElementById('superAdminSection').style.display = 'none';
    }
}

async function loadAllUsers() {
    if (!fbDb) return;
    const tbody = document.getElementById('adminUsersList');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">Memuat data...</td></tr>';
    
    try {
        const snap = await fbDb.ref('users').once('value');
        const users = snap.val();
        
        if (!users) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">Belum ada user.</td></tr>';
            return;
        }
        
        adminAllUsers = users;
        renderUsersTable();
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:red;">Gagal memuat data.</td></tr>';
    }
}

function renderUsersTable() {
    const tbody = document.getElementById('adminUsersList');
    tbody.innerHTML = '';
    
    // Sort keys
    const keys = Object.keys(adminAllUsers);
    if (keys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">Belum ada user.</td></tr>';
        return;
    }
    
    // Create rows
    keys.forEach(safeEmail => {
        const userObj = adminAllUsers[safeEmail];
        const profile = userObj.lf_profile || {};
        const meta = userObj.lf_user_meta || {};
        const phone = userObj.lf_user_phone || '-';
        
        // Recover original email
        const originalEmail = profile.email || safeEmail.replace(/_/g, '.');
        const name = profile.name || profile.lf_user_name || 'No Name';
        
        // Determine status
        let statusHtml = '';
        if (meta.isBlocked) {
            statusHtml = '<span style="background:rgba(239,68,68,0.1);color:#ef4444;padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">🚫 DIBLOKIR</span>';
        } else if (meta.isPro) {
            statusHtml = '<span style="background:rgba(16,185,129,0.1);color:#10b981;padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">Lifetime</span>';
        } else if (meta.proUntil) {
            const untilDate = new Date(meta.proUntil).getTime();
            if (untilDate > Date.now()) {
                statusHtml = `<span style="background:rgba(16,185,129,0.1);color:#10b981;padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">Pro s.d. ${meta.proUntil}</span>`;
            } else {
                statusHtml = '<span style="background:rgba(239,68,68,0.1);color:#ef4444;padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">Pro Expired</span>';
            }
        } else if (meta.createdAt) {
            const trialEnd = meta.createdAt + (3 * 24 * 60 * 60 * 1000);
            if (Date.now() > trialEnd) {
                statusHtml = '<span style="background:rgba(239,68,68,0.1);color:#ef4444;padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">Trial Habis</span>';
            } else {
                const daysLeft = Math.ceil((trialEnd - Date.now()) / (24 * 60 * 60 * 1000));
                statusHtml = `<span style="background:rgba(245,158,11,0.1);color:#f59e0b;padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">Trial (${daysLeft} hari lagi)</span>`;
            }
        } else {
            statusHtml = '<span style="background:rgba(245,158,11,0.1);color:#f59e0b;padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">Trial / Expired</span>';
        }
        
        // Append limit status tag
        if (meta.unlimitedLimit || meta.isUnlimited) {
            statusHtml += '<br><span style="background:rgba(59,130,246,0.1);color:#3b82f6;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;margin-top:4px;display:inline-block;">🔓 Unlimited Limit</span>';
        } else {
            statusHtml += '<br><span style="background:rgba(107,114,128,0.1);color:#9ca3af;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;margin-top:4px;display:inline-block;">🟢 Default Limit</span>';
        }
        
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid var(--border)';
        tr.innerHTML = `
            <td style="padding:10px;font-size:0.85rem;">${originalEmail}<br><span style="font-size:0.7rem;color:var(--text2);">${phone}</span></td>
            <td style="padding:10px;font-size:0.85rem;">${name}</td>
            <td style="padding:10px;">${statusHtml}</td>
            <td style="padding:10px;">
                <button class="btn-primary" style="padding:6px 12px;font-size:0.75rem;" onclick="openAdminSubModal('${safeEmail}', '${originalEmail}')">Edit</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openAdminSubModal(safeEmail, originalEmail) {
    currentEditSafeEmail = safeEmail;
    currentEditEmail = originalEmail;
    
    document.getElementById('adminSubEmail').value = originalEmail;
    
    const meta = adminAllUsers[safeEmail]?.lf_user_meta || {};
    const select = document.getElementById('adminSubSelect');
    const limitSelect = document.getElementById('adminLimitSelect');
    
    if (meta.isBlocked) {
        select.value = 'revoke';
    } else if (meta.isPro) {
        select.value = 'lifetime';
    } else if (meta.proUntil) {
        select.value = 'month'; // default select
    } else {
        select.value = 'trial';
    }

    if (meta.unlimitedLimit || meta.isUnlimited) {
        limitSelect.value = 'unlimited';
    } else {
        limitSelect.value = 'default';
    }
    
    document.getElementById('adminSubModal').classList.remove('hidden');
}

function closeAdminSubModal() {
    document.getElementById('adminSubModal').classList.add('hidden');
}

async function saveAdminSub() {
    if (!fbDb || !currentEditSafeEmail) return;
    
    const selectValue = document.getElementById('adminSubSelect').value;
    const limitValue = document.getElementById('adminLimitSelect').value;
    const isUnlimited = (limitValue === 'unlimited');
    const metaRef = fbDb.ref(`users/${currentEditSafeEmail}/lf_user_meta`);
    
    let updateData = {
        unlimitedLimit: isUnlimited,
        isUnlimited: isUnlimited
    };
    
    if (selectValue === 'lifetime') {
        updateData.isPro = true;
        updateData.proUntil = null;
        updateData.isBlocked = false;
    } else if (selectValue === 'month') {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        updateData.isPro = false;
        updateData.proUntil = d.toISOString().split('T')[0];
        updateData.isBlocked = false;
    } else if (selectValue === 'year') {
        const d = new Date();
        d.setDate(d.getDate() + 365);
        updateData.isPro = false;
        updateData.proUntil = d.toISOString().split('T')[0];
        updateData.isBlocked = false;
    } else if (selectValue === 'trial') {
        // Reset trial: set createdAt to now so they get a fresh 3-day trial
        updateData.isPro = false;
        updateData.proUntil = null;
        updateData.isBlocked = false;
        updateData.createdAt = Date.now();
    } else if (selectValue === 'revoke') {
        // Block user completely
        updateData.isPro = false;
        updateData.proUntil = null;
        updateData.isBlocked = true;
    }
    
    try {
        await metaRef.update(updateData);
        showToast('Berhasil update langganan & limit user!', 'success');
        closeAdminSubModal();
        loadAllUsers(); 
    } catch (err) {
        console.error(err);
        showToast('Gagal update langganan.', 'error');
    }
}

// Super Admin
async function loadAdmins() {
    if (!fbDb) return;
    const ul = document.getElementById('adminList');
    ul.innerHTML = '<li style="color:var(--text2);font-size:0.85rem;">Memuat daftar admin...</li>';
    
    try {
        const snap = await fbDb.ref('admins').once('value');
        const admins = snap.val() || {};
        ul.innerHTML = '';
        const keys = Object.keys(admins);
        if (keys.length === 0) {
            ul.innerHTML = '<li style="color:var(--text2);font-size:0.85rem;">Belum ada admin tambahan.</li>';
            return;
        }
        
        keys.forEach(safeEmail => {
            const li = document.createElement('li');
            li.style.display = 'flex';
            li.style.justifyContent = 'space-between';
            li.style.alignItems = 'center';
            li.style.padding = '8px 0';
            li.style.borderBottom = '1px solid var(--border)';
            li.style.fontSize = '0.85rem';
            
            li.innerHTML = `
                <span>${safeEmail.replace(/_/g, '.')}</span>
                <button class="btn-primary" style="background:var(--danger);padding:4px 8px;font-size:0.75rem;" onclick="removeAdmin('${safeEmail}')">Hapus</button>
            `;
            ul.appendChild(li);
        });
    } catch (err) {
        ul.innerHTML = '<li style="color:var(--text2);font-size:0.85rem;color:red;">Gagal memuat admin.</li>';
    }
}

async function addAdmin() {
    const input = document.getElementById('newAdminEmail');
    let email = input.value.trim().toLowerCase();
    if (!email.includes('@')) {
        showToast('Email tidak valid', 'error');
        return;
    }
    const safeEmail = email.replace(/"/g, '').replace(/[.#$[\]]/g, '_');
    try {
        await fbDb.ref(`admins/${safeEmail}`).set(true);
        input.value = '';
        showToast(`Admin ${email} ditambahkan!`, 'success');
        loadAdmins();
    } catch (err) {
        showToast('Gagal menambah admin', 'error');
    }
}

async function removeAdmin(safeEmail) {
    if (!confirm('Hapus admin ini?')) return;
    try {
        await fbDb.ref(`admins/${safeEmail}`).remove();
        showToast('Admin dihapus', 'success');
        loadAdmins();
    } catch (err) {
        showToast('Gagal menghapus admin', 'error');
    }
}

// ===== ADMIN RESET/GANTI PASSWORD USER =====
async function adminResetPassword() {
    const newPwd = document.getElementById('adminNewPassword').value.trim();
    if (!newPwd) { showToast('Masukkan password baru dulu', 'error'); return; }
    if (newPwd.length < 6) { showToast('Password minimal 6 karakter', 'error'); return; }
    if (!currentEditEmail) { showToast('Pilih user dulu', 'error'); return; }

    try {
        // Kirim ke Vercel backend untuk update password via Firebase Admin SDK
        const adminUser = getAuthUser();
        const idToken = await adminUser.getIdToken(true);
        const res = await fetch('/api/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
            body: JSON.stringify({ action: 'resetPassword', email: currentEditEmail, newPassword: newPwd })
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ Password berhasil diubah untuk ' + currentEditEmail, 'success');
            document.getElementById('adminNewPassword').value = '';
        } else {
            showToast('❌ Gagal ubah password: ' + (data.error || 'Unknown error'), 'error');
        }
    } catch (err) {
        console.error('[adminResetPassword]', err);
        showToast('❌ Gagal koneksi ke server: ' + err.message, 'error');
    }
}

// ===== ADMIN BUAT USER BARU (EMAIL + PASSWORD) =====
async function adminCreateUser() {
    const name = document.getElementById('createUserName').value.trim();
    const email = document.getElementById('createUserEmail').value.trim().toLowerCase();
    const password = document.getElementById('createUserPassword').value.trim();
    const phone = document.getElementById('createUserPhone').value.trim();
    const subVal = document.getElementById('createUserSub').value;

    if (!name) { showToast('Nama wajib diisi', 'error'); return; }
    if (!email || !email.includes('@')) { showToast('Email tidak valid', 'error'); return; }
    if (!password || password.length < 6) { showToast('Password minimal 6 karakter', 'error'); return; }

    const btn = document.getElementById('btnAdminCreateUser');
    btn.disabled = true;
    btn.innerHTML = '⏳ Mendaftarkan...';

    try {
        const adminUser = getAuthUser();
        const idToken = await adminUser.getIdToken(true);

        const res = await fetch('/api/admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
            body: JSON.stringify({ action: 'createUser', email, password, name, phone, subscription: subVal })
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ User ' + email + ' berhasil didaftarkan! Bisa login pakai Email + Password sekarang.', 'success');
            // Reset form & close modal
            ['createUserName','createUserEmail','createUserPassword','createUserPhone'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            document.getElementById('adminCreateUserModal').classList.add('hidden');
            loadAllUsers();
        } else {
            showToast('❌ Gagal daftarkan user: ' + (data.error || 'Unknown'), 'error');
        }
    } catch (err) {
        console.error('[adminCreateUser]', err);
        showToast('❌ Gagal koneksi ke server: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '✅ Daftarkan User';
    }
}
