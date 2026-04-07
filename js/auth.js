// ============================================================
// auth.js - Auth state + Login/Register handlers
// ============================================================

// ---- State ----
function getStoredUser() {
  try {
    const u = localStorage.getItem(CONFIG.USER_KEY);
    return u ? JSON.parse(u) : null;
  } catch { return null; }
}

function getToken() {
  return localStorage.getItem(CONFIG.TOKEN_KEY);
}

function saveSession(token, user) {
  localStorage.setItem(CONFIG.TOKEN_KEY, token);
  localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(CONFIG.TOKEN_KEY);
  localStorage.removeItem(CONFIG.USER_KEY);
}

function isLoggedIn() {
  return !!getToken() && !!getStoredUser();
}

// ---- UI helpers ----

function showAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('form-login').classList.toggle('hidden', !isLogin);
  document.getElementById('form-register').classList.toggle('hidden', isLogin);
  document.getElementById('tab-login').className = `flex-1 py-4 text-sm font-semibold transition-colors border-b-2 ${
    isLogin ? 'text-green-400 border-green-400' : 'text-gray-400 border-transparent'
  }`;
  document.getElementById('tab-register').className = `flex-1 py-4 text-sm font-semibold transition-colors border-b-2 ${
    !isLogin ? 'text-green-400 border-green-400' : 'text-gray-400 border-transparent'
  }`;
}

// ---- Build stat input groups ----

function buildStatInputs() {
  document.querySelectorAll('.stat-input-group').forEach(el => {
    const field = el.dataset.field;
    const label = el.dataset.label;
    el.innerHTML = `
      <div style="font-size:10px;font-weight:700;color:#9ca3af;margin-bottom:3px;letter-spacing:0.5px;">${label}</div>
      <input type="number" min="1" max="99" value="60" id="stat-${field}"
        class="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-2 text-white text-center text-sm focus:outline-none focus:border-green-400" />
    `;
  });
}

function initPositionCheckboxes() {
  document.querySelectorAll('.pos-checkbox').forEach(label => {
    label.addEventListener('click', () => {
      const cb = label.querySelector('input[type=checkbox]');
      cb.checked = !cb.checked;
      label.querySelector('span').classList.toggle('selected', cb.checked);

      // Show/hide GK stats
      const hasGK = [...document.querySelectorAll('.pos-checkbox input:checked')]
        .some(c => c.value === 'GK');
      document.getElementById('gk-stats').classList.toggle('hidden', !hasGK);
    });

    const span = label.querySelector('span');
    span.style.transition = 'all 0.2s';
  });

  // Add selected style via CSS class
  const style = document.createElement('style');
  style.textContent = `.pos-checkbox span.selected { background: rgba(74,222,128,0.2); border-color: #4ade80; color: #4ade80; }`;
  document.head.appendChild(style);
}

// ---- Handlers ----

async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');

  errEl.classList.add('hidden');

  if (!username || !password) {
    errEl.textContent = 'Vui lòng nhập username và password';
    errEl.classList.remove('hidden');
    return;
  }

  showLoading(true);
  try {
    const res = await API.login(username, password);
    if (res.success) {
      saveSession(res.token, res.user);
      showApp();
      showToast('Đăng nhập thành công! Chào ' + res.user.full_name, 'success');
    } else {
      errEl.textContent = res.error || 'Đăng nhập thất bại';
      errEl.classList.remove('hidden');
    }
  } catch (err) {
    errEl.textContent = 'Lỗi kết nối. Kiểm tra lại API URL trong config.js';
    errEl.classList.remove('hidden');
  } finally {
    showLoading(false);
  }
}

async function handleRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const full_name = document.getElementById('reg-fullname').value.trim();
  const phone = document.getElementById('reg-phone').value.trim();

  const positions = [...document.querySelectorAll('.pos-checkbox input:checked')].map(c => c.value);
  const errEl = document.getElementById('register-error');
  const sucEl = document.getElementById('register-success');

  errEl.classList.add('hidden');
  sucEl.classList.add('hidden');

  if (!username || !password || !full_name) {
    errEl.textContent = 'Vui lòng điền đầy đủ thông tin bắt buộc (*)';
    errEl.classList.remove('hidden');
    return;
  }

  if (username.length < 3) {
    errEl.textContent = 'Username phải có ít nhất 3 ký tự';
    errEl.classList.remove('hidden');
    return;
  }

  if (password.length < 6) {
    errEl.textContent = 'Password phải có ít nhất 6 ký tự';
    errEl.classList.remove('hidden');
    return;
  }

  if (positions.length === 0) {
    errEl.textContent = 'Phải chọn ít nhất 1 vị trí';
    errEl.classList.remove('hidden');
    return;
  }

  // Collect stats
  const stats = {};
  document.querySelectorAll('.stat-input-group').forEach(el => {
    const field = el.dataset.field;
    const input = document.getElementById('stat-' + field);
    if (input) stats[field] = Math.min(99, Math.max(1, parseInt(input.value) || 60));
  });

  showLoading(true);
  try {
    const res = await API.register({ username, password, full_name, phone, positions, stats });
    if (res.success) {
      sucEl.textContent = res.message || 'Đăng ký thành công!';
      sucEl.classList.remove('hidden');
      setTimeout(() => showAuthTab('login'), 1500);
    } else {
      errEl.textContent = res.error || 'Đăng ký thất bại';
      errEl.classList.remove('hidden');
    }
  } catch (err) {
    errEl.textContent = 'Lỗi kết nối';
    errEl.classList.remove('hidden');
  } finally {
    showLoading(false);
  }
}

async function handleLogout() {
  showLoading(true);
  try { await API.logout(); } catch (e) {}
  clearSession();
  API.clearCache(); // Xóa cache khi logout để tránh data leak giữa các session
  showLoading(false);
  showAuth();
  showToast('Đã đăng xuất', 'info');
}

// ---- Screen switching ----

function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');

  const user = getStoredUser();
  if (user) {
    // Update sidebar
    document.getElementById('sidebar-name').textContent = user.full_name || user.username;
    document.getElementById('sidebar-pos').textContent = user.positions || '-';
    document.getElementById('sidebar-avatar').textContent = (user.full_name || user.username)[0].toUpperCase();

    // Show admin links if admin
    if (user.is_admin) {
      document.getElementById('admin-link').classList.remove('hidden');
      document.getElementById('admin-link').classList.add('flex');
      const mobileAdmin = document.getElementById('admin-mobile-link');
      if (mobileAdmin) {
        mobileAdmin.classList.remove('hidden');
        mobileAdmin.classList.add('flex');
      }
    }
  }

  // Navigate to current hash or dashboard
  const hash = window.location.hash.replace('#', '') || 'dashboard';
  navigateTo(hash);
}
