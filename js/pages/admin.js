// ============================================================
// admin.js - Trang quản trị: quản lý user, chỉnh số, award
// ============================================================

async function renderAdmin(container) {
  const user = getStoredUser();
  if (!user.is_admin) {
    container.innerHTML = `<div class="card">${emptyState('🔒', 'Không có quyền truy cập')}</div>`;
    return;
  }

  showLoading(true);
  let users = [];
  try {
    const res = await API.getUsers();
    if (res.success) users = res.users || [];
  } catch (e) {
    showToast('Lỗi tải dữ liệu', 'error');
  } finally {
    showLoading(false);
  }

  const activePlayers = users.filter(u => u.status === 'active' && !u.is_admin);
  const adminUsers = users.filter(u => u.is_admin);

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-white">⚙️ Admin Panel</h1>
        <div class="flex gap-2">
          <button onclick="openCreateMatchModal()" class="btn btn-primary btn-sm">
            <i class="fas fa-calendar-plus mr-1"></i> Tạo trận
          </button>
        </div>
      </div>

      <!-- Quick stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="card text-center">
          <div class="text-2xl font-bold text-green-400">${activePlayers.length}</div>
          <div class="text-gray-400 text-xs">Cầu thủ</div>
        </div>
        <div class="card text-center">
          <div class="text-2xl font-bold text-blue-400">${users.filter(u => u.status === 'inactive').length}</div>
          <div class="text-gray-400 text-xs">Inactive</div>
        </div>
        <div class="card text-center cursor-pointer hover:border-green-600" onclick="navigateTo('matches')">
          <div class="text-2xl font-bold text-amber-400">→</div>
          <div class="text-gray-400 text-xs">Lịch thi đấu</div>
        </div>
        <div class="card text-center cursor-pointer hover:border-green-600" onclick="navigateTo('leaderboard')">
          <div class="text-2xl font-bold text-purple-400">→</div>
          <div class="text-gray-400 text-xs">Bảng xếp hạng</div>
        </div>
      </div>

      <!-- User Management -->
      <div>
        <h2 class="section-heading"><i class="fas fa-users text-green-400"></i> Quản lý cầu thủ (${activePlayers.length})</h2>
        <div class="mb-3">
          <input type="text" id="user-search" placeholder="🔍 Tìm kiếm theo tên..." class="form-input"
            oninput="filterUsers(this.value)" />
        </div>
        <div class="space-y-3" id="users-list">
          ${activePlayers.map(u => renderAdminUserCard(u)).join('')}
          ${activePlayers.length === 0 ? emptyState('👥', 'Chưa có cầu thủ nào') : ''}
        </div>
      </div>

      <!-- Admin users -->
      ${adminUsers.length > 0 ? `
        <div>
          <h2 class="section-heading"><i class="fas fa-shield-alt text-amber-400"></i> Tài khoản Admin (${adminUsers.length})</h2>
          <div class="space-y-2">
            ${adminUsers.map(u => `
              <div class="card py-3 px-4 flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-full bg-amber-800 flex items-center justify-center text-sm font-bold text-white">
                    ${(u.full_name || '?')[0]}
                  </div>
                  <div>
                    <span class="text-white font-semibold">${u.full_name}</span>
                    <span class="text-gray-400 text-sm ml-2">@${u.username}</span>
                    <span class="badge badge-yes text-xs ml-1">Admin</span>
                  </div>
                </div>
                <button onclick="confirmRevokeAdmin('${u.user_id}', '${u.full_name}')" class="btn btn-danger btn-sm">
                  <i class="fas fa-shield-alt mr-1"></i> Thu hồi
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Inactive users -->
      ${users.filter(u => !u.is_admin && u.status === 'inactive').length > 0 ? `
        <div>
          <h2 class="section-heading"><i class="fas fa-user-slash text-red-400"></i> Tài khoản bị khóa</h2>
          <div class="space-y-2">
            ${users.filter(u => !u.is_admin && u.status === 'inactive').map(u => `
              <div class="card py-3 px-4 flex items-center justify-between opacity-60">
                <span class="text-white">${u.full_name} <span class="text-gray-400 text-sm">@${u.username}</span></span>
                <button onclick="toggleUserStatus('${u.user_id}', 'active')" class="btn btn-secondary btn-sm">Kích hoạt</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  // Store users data for filtering
  window._adminUsers = activePlayers;
}

function renderAdminUserCard(u) {
  const stats = [
    { k: 'PAC', v: u.pace }, { k: 'SHO', v: u.shooting }, { k: 'PAS', v: u.passing },
    { k: 'DRI', v: u.dribbling }, { k: 'DEF', v: u.defending }, { k: 'PHY', v: u.physical }
  ];

  return `
    <div class="card user-card" data-name="${(u.full_name || '').toLowerCase()}">
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-full bg-green-800 flex items-center justify-center text-lg font-bold text-white">
            ${(u.full_name || '?')[0]}
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-white font-semibold">${u.full_name}</span>
              <span class="text-gray-500 text-xs">@${u.username}</span>
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              ${positionBadge(u.positions)}
              <span class="text-amber-400 text-xs font-bold">ELO: ${u.rating_points}</span>
            </div>
          </div>
        </div>
        <div class="text-right flex-shrink-0">
          <div class="text-2xl font-bold" style="color:${overallColor(u.overall_rating)}">${u.overall_rating}</div>
          <div class="text-gray-500 text-xs">OVR</div>
        </div>
      </div>

      <!-- Stats bars -->
      <div class="grid grid-cols-3 gap-2 mt-3">
        ${stats.map(s => `
          <div>
            <div class="flex justify-between text-xs mb-0.5">
              <span class="text-gray-500">${s.k}</span>
              <span class="text-gray-300 font-medium">${s.v || 0}</span>
            </div>
            <div class="stat-bar">
              <div class="stat-bar-fill" style="width:${s.v || 0}%"></div>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Match stats -->
      <div class="flex items-center gap-4 mt-3 text-xs text-gray-400">
        <span>🏟️ ${u.total_matches || 0} trận</span>
        <span class="text-green-400">✅ ${u.total_wins || 0}T</span>
        <span class="text-gray-400">${u.total_draws || 0}H</span>
        <span class="text-red-400">❌ ${u.total_losses || 0}B</span>
        <span class="text-orange-400">⚽ ${u.total_goals || 0}</span>
      </div>

      <!-- Actions -->
      <div class="flex gap-2 mt-3 flex-wrap">
        <button onclick="openEditStatsModal('${u.user_id}', ${JSON.stringify(u).replace(/"/g, '&quot;')})"
          class="btn btn-secondary btn-sm">
          <i class="fas fa-sliders-h mr-1"></i> Chỉnh chỉ số
        </button>
        <button onclick="openAdjustRatingModal('${u.user_id}', '${u.full_name}', ${u.rating_points})"
          class="btn btn-gold btn-sm">
          <i class="fas fa-star mr-1"></i> ELO
        </button>
        <button onclick="openAwardMVPModal('${u.user_id}', '${u.full_name}')"
          class="btn btn-secondary btn-sm">
          🏅 MVP
        </button>
        <button onclick="openGrantAdminModal('${u.user_id}', '${u.full_name}')"
          class="btn btn-secondary btn-sm">
          <i class="fas fa-shield-alt mr-1"></i> Admin
        </button>
        <button onclick="toggleUserStatus('${u.user_id}', 'inactive')"
          class="btn btn-danger btn-sm">
          <i class="fas fa-ban"></i>
        </button>
      </div>
    </div>
  `;
}

function filterUsers(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.user-card').forEach(card => {
    const name = card.dataset.name || '';
    card.style.display = name.includes(q) ? '' : 'none';
  });
}

// ---- Edit Stats Modal ----

function openEditStatsModal(userId, userData) {
  const stats = [
    { field: 'pace', label: 'PAC - Tốc độ' },
    { field: 'shooting', label: 'SHO - Sút bóng' },
    { field: 'passing', label: 'PAS - Chuyền bóng' },
    { field: 'dribbling', label: 'DRI - Rê bóng' },
    { field: 'defending', label: 'DEF - Phòng thủ' },
    { field: 'physical', label: 'PHY - Thể lực' }
  ];

  const isGK = String(userData.positions || '').includes('GK');

  openModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-white font-bold text-lg">Chỉnh chỉ số: ${userData.full_name}</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
      </div>

      <div class="mb-4">
        <label class="form-label">Vị trí</label>
        <div class="grid grid-cols-4 gap-2">
          ${['FW','MF','DF','GK'].map(pos => `
            <label class="block">
              <input type="checkbox" class="pos-edit-cb mr-1" value="${pos}"
                ${String(userData.positions || '').includes(pos) ? 'checked' : ''}
                onchange="toggleGKStats()" />
              <span class="text-white text-sm font-medium">${pos}</span>
            </label>
          `).join('')}
        </div>
      </div>

      <div class="space-y-3">
        ${stats.map(s => `
          <div class="flex items-center gap-3">
            <label class="text-gray-400 text-sm w-32">${s.label}</label>
            <input type="range" min="1" max="99" value="${userData[s.field] || 60}"
              id="edit-stat-${s.field}"
              oninput="document.getElementById('edit-val-${s.field}').textContent = this.value"
              class="flex-1" />
            <span id="edit-val-${s.field}" class="text-white font-bold w-8 text-center">${userData[s.field] || 60}</span>
          </div>
        `).join('')}
      </div>

      <div id="gk-stats-admin" class="${isGK ? '' : 'hidden'} mt-3 space-y-3 pt-3 border-t border-gray-700">
        <p class="text-amber-400 text-xs font-medium">⚽ Chỉ số Thủ môn</p>
        ${[['gk_diving','DIV - Bắt bóng'],['gk_handling','HAN - Cầm bóng'],['gk_reflexes','REF - Phản xạ']].map(([f,l]) => `
          <div class="flex items-center gap-3">
            <label class="text-gray-400 text-sm w-32">${l}</label>
            <input type="range" min="1" max="99" value="${userData[f] || 60}"
              id="edit-stat-${f}"
              oninput="document.getElementById('edit-val-${f}').textContent = this.value"
              class="flex-1" />
            <span id="edit-val-${f}" class="text-white font-bold w-8 text-center">${userData[f] || 60}</span>
          </div>
        `).join('')}
      </div>

      <button onclick="submitEditStats('${userId}')" class="btn btn-primary w-full justify-center mt-5">
        <i class="fas fa-save mr-2"></i> Lưu chỉ số
      </button>
    </div>
  `);
}

function toggleGKStats() {
  const hasGK = [...document.querySelectorAll('.pos-edit-cb:checked')].some(c => c.value === 'GK');
  document.getElementById('gk-stats-admin')?.classList.toggle('hidden', !hasGK);
}

async function submitEditStats(userId) {
  const positions = [...document.querySelectorAll('.pos-edit-cb:checked')].map(c => c.value);
  if (positions.length === 0) { showToast('Chọn ít nhất 1 vị trí', 'warning'); return; }

  const fields = ['pace','shooting','passing','dribbling','defending','physical','gk_diving','gk_handling','gk_reflexes'];
  const stats = {};
  fields.forEach(f => {
    const el = document.getElementById(`edit-stat-${f}`);
    if (el) stats[f] = parseInt(el.value);
  });

  showLoading(true);
  try {
    const res = await API.adminUpdateUser(userId, { ...stats, positions: positions.join(',') });
    if (res.success) {
      closeModal();
      showToast('Đã cập nhật chỉ số!', 'success');
      renderAdmin(document.getElementById('page-content'));
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

// ---- Adjust ELO Modal ----

function openAdjustRatingModal(userId, name, currentRating) {
  openModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-white font-bold text-lg">Điều chỉnh ELO: ${name}</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
      </div>
      <div class="bg-gray-700 rounded-xl p-4 text-center mb-4">
        <div class="text-amber-400 text-3xl font-bold">${currentRating}</div>
        <div class="text-gray-400 text-sm">ELO hiện tại</div>
      </div>
      <div class="form-group">
        <label class="form-label">Thay đổi điểm (âm để trừ)</label>
        <input type="number" id="elo-change" placeholder="Ví dụ: +20 hoặc -10" class="form-input" value="0" />
      </div>
      <div class="bg-gray-700 rounded-lg p-3 text-center text-sm text-gray-400 mb-4">
        Kết quả: <span id="elo-preview" class="text-white font-bold">${currentRating}</span>
        <script>
          document.getElementById('elo-change').addEventListener('input', function() {
            const newVal = ${currentRating} + parseInt(this.value || 0);
            document.getElementById('elo-preview').textContent = Math.max(0, newVal);
          });
        </script>
      </div>
      <button onclick="submitAdjustRating('${userId}', '${name}')" class="btn btn-primary w-full justify-center">
        Áp dụng
      </button>
    </div>
  `);
}

async function submitAdjustRating(userId, name) {
  const change = parseInt(document.getElementById('elo-change')?.value) || 0;
  if (change === 0) { showToast('Nhập số điểm cần thay đổi', 'warning'); return; }

  showLoading(true);
  try {
    const res = await API.adminAdjustRating(userId, change);
    if (res.success) {
      closeModal();
      showToast(res.message, 'success');
      renderAdmin(document.getElementById('page-content'));
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

// ---- MVP Award Modal ----

function openAwardMVPModal(userId, name) {
  openModal(`
    <div class="p-6 text-center">
      <div class="text-5xl mb-3">🏅</div>
      <h3 class="text-white font-bold text-lg mb-2">Trao danh hiệu MVP</h3>
      <p class="text-gray-400 mb-2">Trao cho <span class="text-white font-semibold">${name}</span></p>
      <p class="text-green-400 font-bold text-lg mb-5">+10 điểm ELO</p>

      <div class="form-group">
        <label class="form-label text-left">Trận đấu (match ID, tùy chọn)</label>
        <input type="text" id="mvp-match-id" placeholder="Để trống nếu không cụ thể" class="form-input" />
      </div>
      <div class="flex gap-3 justify-center mt-4">
        <button onclick="closeModal()" class="btn btn-secondary">Hủy</button>
        <button onclick="submitAwardMVP('${userId}', '${name}')" class="btn btn-gold">🏅 Trao MVP</button>
      </div>
    </div>
  `);
}

async function submitAwardMVP(userId, name) {
  const matchId = document.getElementById('mvp-match-id')?.value.trim() || '';
  showLoading(true);
  try {
    const res = await API.awardMVP(userId, matchId);
    if (res.success) {
      closeModal();
      showToast(res.message, 'success');
      renderAdmin(document.getElementById('page-content'));
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

// ---- Toggle User Status ----

async function toggleUserStatus(userId, newStatus) {
  const message = newStatus === 'inactive' ? 'Khóa tài khoản này?' : 'Kích hoạt tài khoản này?';
  openModal(`
    <div class="p-6 text-center">
      <div class="text-4xl mb-4">${newStatus === 'inactive' ? '🔒' : '🔓'}</div>
      <h3 class="text-white font-semibold mb-2">${message}</h3>
      <div class="flex gap-3 justify-center mt-4">
        <button onclick="closeModal()" class="btn btn-secondary">Hủy</button>
        <button onclick="submitToggleStatus('${userId}', '${newStatus}')" class="btn ${newStatus === 'inactive' ? 'btn-danger' : 'btn-primary'}">
          Xác nhận
        </button>
      </div>
    </div>
  `);
}

async function submitToggleStatus(userId, status) {
  closeModal();
  showLoading(true);
  try {
    const res = await API.adminUpdateUser(userId, { status });
    if (res.success) {
      showToast(`Đã ${status === 'inactive' ? 'khóa' : 'kích hoạt'} tài khoản`, 'success');
      renderAdmin(document.getElementById('page-content'));
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

// ---- Grant / Revoke Admin ----

function openGrantAdminModal(userId, name) {
  openModal(`
    <div class="p-6 text-center">
      <div class="text-5xl mb-3">🛡️</div>
      <h3 class="text-white font-bold text-lg mb-2">Trao quyền Admin</h3>
      <p class="text-gray-400 mb-1">Người dùng: <span class="text-white font-semibold">${name}</span></p>
      <p class="text-amber-400 text-sm mb-5">Admin có thể tạo trận, xếp đội, chỉnh chỉ số tất cả cầu thủ.</p>
      <div class="flex gap-3 justify-center">
        <button onclick="closeModal()" class="btn btn-secondary">Hủy</button>
        <button onclick="submitGrantAdmin('${userId}', '${name}')" class="btn btn-primary">
          <i class="fas fa-shield-alt mr-1"></i> Trao quyền Admin
        </button>
      </div>
    </div>
  `);
}

async function submitGrantAdmin(userId, name) {
  closeModal();
  showLoading(true);
  try {
    const res = await API.adminUpdateUser(userId, { is_admin: true });
    if (res.success) {
      showToast(`Đã trao quyền Admin cho ${name}`, 'success');
      renderAdmin(document.getElementById('page-content'));
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

function confirmRevokeAdmin(userId, name) {
  openModal(`
    <div class="p-6 text-center">
      <div class="text-5xl mb-3">⚠️</div>
      <h3 class="text-white font-bold text-lg mb-2">Thu hồi quyền Admin</h3>
      <p class="text-gray-400 mb-5">Thu hồi quyền Admin của <span class="text-white font-semibold">${name}</span>?</p>
      <div class="flex gap-3 justify-center">
        <button onclick="closeModal()" class="btn btn-secondary">Hủy</button>
        <button onclick="submitRevokeAdmin('${userId}', '${name}')" class="btn btn-danger">Thu hồi</button>
      </div>
    </div>
  `);
}

async function submitRevokeAdmin(userId, name) {
  closeModal();
  showLoading(true);
  try {
    const res = await API.adminUpdateUser(userId, { is_admin: false });
    if (res.success) {
      showToast(`Đã thu hồi quyền Admin của ${name}`, 'success');
      renderAdmin(document.getElementById('page-content'));
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}
