// ============================================================
// app.js - Main App Router + UI Helpers
// ============================================================

// ---- UI Helpers ----

function showLoading(show) {
  document.getElementById('loading-overlay').classList.toggle('hidden', !show);
}

let toastTimer = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const content = document.getElementById('toast-content');

  const styles = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    warning: 'bg-amber-500',
    info: 'bg-blue-600'
  };

  const icons = {
    success: '<i class="fas fa-check-circle"></i>',
    error: '<i class="fas fa-times-circle"></i>',
    warning: '<i class="fas fa-exclamation-triangle"></i>',
    info: '<i class="fas fa-info-circle"></i>'
  };

  content.className = `px-5 py-3 rounded-xl shadow-lg text-white text-sm font-medium flex items-center gap-2 ${styles[type] || styles.info} toast-in`;
  content.innerHTML = `${icons[type] || icons.info} ${message}`;
  toast.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    content.classList.remove('toast-in');
    content.classList.add('toast-out');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 3000);
}

function openModal(bodyHtml) {
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal(event) {
  if (!event || event.target === document.getElementById('modal-overlay')) {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
  }
}

function confirmDialog(message, onConfirm) {
  openModal(`
    <div class="p-6 text-center">
      <div class="text-4xl mb-4">⚠️</div>
      <h3 class="text-white font-semibold text-lg mb-2">Xác nhận</h3>
      <p class="text-gray-400 mb-6">${message}</p>
      <div class="flex gap-3 justify-center">
        <button onclick="closeModal()" class="btn btn-secondary">Hủy</button>
        <button onclick="closeModal(); (${onConfirm.toString()})()" class="btn btn-danger">Xác nhận</button>
      </div>
    </div>
  `);
}

// ---- Router ----

const PAGES = {
  dashboard:   { render: renderDashboard,   title: 'Dashboard' },
  matches:     { render: renderMatches,     title: 'Lịch thi đấu' },
  history:     { render: renderHistory,     title: 'Lịch sử' },
  formation:   { render: renderFormation,   title: 'Đội hình' },
  live:        { render: renderLiveMatch,   title: 'Live thi đấu' },
  leaderboard: { render: renderLeaderboard, title: 'Bảng xếp hạng' },
  profile:     { render: renderProfile,     title: 'Hồ sơ' },
  admin:       { render: renderAdmin,       title: 'Admin', requireAdmin: true }
};

let currentPage = null;

function navigateTo(page, params = {}) {
  // Strip leading / or #
  page = page.replace(/^[/#]+/, '').split('/')[0] || 'dashboard';

  const pageConfig = PAGES[page];
  if (!pageConfig) { navigateTo('dashboard'); return; }

  const user = getStoredUser();
  if (pageConfig.requireAdmin && !user?.is_admin) {
    showToast('Bạn không có quyền truy cập trang này', 'error');
    navigateTo('dashboard');
    return;
  }

  currentPage = page;

  // Update nav active state
  document.querySelectorAll('.nav-link, .mobile-nav').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // Update URL hash
  if (window.location.hash.replace('#', '') !== page) {
    history.pushState(null, '', '#' + page);
  }

  // Render page
  const content = document.getElementById('page-content');
  content.innerHTML = '<div class="flex items-center justify-center h-40"><div class="w-8 h-8 border-4 border-green-400 border-t-transparent rounded-full animate-spin"></div></div>';

  pageConfig.render(content, params).catch(err => {
    content.innerHTML = `
      <div class="card text-center py-12">
        <div class="text-4xl mb-3">❌</div>
        <p class="text-red-400 font-semibold">Lỗi tải trang</p>
        <p class="text-gray-500 text-sm mt-1">${err.message}</p>
        <button onclick="navigateTo('${page}')" class="btn btn-secondary mt-4 btn-sm">Thử lại</button>
      </div>`;
  });
}

// ---- Utility formatters ----

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return dateStr; }
}

function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  } catch { return dateStr; }
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const str = String(timeStr).trim();

  // Đã đúng format HH:MM
  if (/^\d{1,2}:\d{2}/.test(str)) return str.substring(0, 5);

  // Google Sheets trả về Date serial dạng "1899-12-30T18:00:00.000Z"
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const h = d.getUTCHours().toString().padStart(2, '0');
      const m = d.getUTCMinutes().toString().padStart(2, '0');
      return `${h}:${m}`;
    }
  } catch {}

  // Số thập phân (fraction of day, ví dụ 0.75 = 18:00)
  const num = parseFloat(str);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMin = Math.round(num * 1440);
    return `${Math.floor(totalMin / 60).toString().padStart(2, '0')}:${(totalMin % 60).toString().padStart(2, '0')}`;
  }

  return str.substring(0, 5);
}

function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  try {
    return new Date(isoStr).toLocaleString('vi-VN');
  } catch { return isoStr; }
}

function positionBadge(posStr) {
  const positions = String(posStr || '').split(',').map(p => p.trim()).filter(Boolean);
  return positions.map(pos => {
    const cfg = CONFIG.POSITIONS[pos] || { color: '', label: pos };
    return `<span class="pos-badge ${cfg.color}">${pos}</span>`;
  }).join(' ');
}

function matchStatusBadge(status) {
  const cfg = CONFIG.MATCH_STATUS[status] || { label: status, class: 'badge-scheduled', icon: '•' };
  return `<span class="badge ${cfg.class}">${cfg.icon} ${cfg.label}</span>`;
}

function overallColor(rating) {
  if (rating >= 80) return '#facc15';
  if (rating >= 70) return '#4ade80';
  if (rating >= 60) return '#60a5fa';
  return '#9ca3af';
}

// ---- Stat bar ----
function statBar(value, maxVal = 99) {
  const pct = Math.round((value / maxVal) * 100);
  const color = value >= 80 ? '#facc15' : value >= 65 ? '#4ade80' : value >= 50 ? '#60a5fa' : '#6b7280';
  return `
    <div class="flex items-center gap-2">
      <div class="flex-1 stat-bar">
        <div class="stat-bar-fill" style="width:${pct}%;background:${color};"></div>
      </div>
      <span class="text-xs font-bold w-6 text-right" style="color:${color}">${value}</span>
    </div>`;
}

// ---- Empty state ----
function emptyState(icon, message, subMessage = '') {
  return `
    <div class="text-center py-16">
      <div class="text-5xl mb-3">${icon}</div>
      <p class="text-gray-400 font-medium">${message}</p>
      ${subMessage ? `<p class="text-gray-600 text-sm mt-1">${subMessage}</p>` : ''}
    </div>`;
}

// ---- Init ----

document.addEventListener('DOMContentLoaded', () => {
  // Build register form stats inputs
  buildStatInputs();
  initPositionCheckboxes();

  // Check auth state
  if (isLoggedIn()) {
    showApp();
  } else {
    showAuth();
  }

  // Handle keyboard enter on login
  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('login-username').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    if (isLoggedIn()) {
      const page = window.location.hash.replace('#', '') || 'dashboard';
      navigateTo(page);
    }
  });
});
