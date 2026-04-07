// ============================================================
// profile.js - Hồ sơ cầu thủ + chỉnh sửa chỉ số
// ============================================================

async function renderProfile(container) {
  showLoading(true);
  let profileData = null;
  let history = [];

  try {
    const [profileRes, historyRes] = await Promise.all([
      API.getProfile(),
      API.getRatingHistory(null, 10)
    ]);
    if (profileRes.success) profileData = profileRes.user;
    if (historyRes.success) history = historyRes.history || [];
  } catch (e) {
    showToast('Lỗi tải dữ liệu', 'error');
  } finally {
    showLoading(false);
  }

  const user = profileData || getStoredUser();

  const stats = [
    { key: 'pace', label: 'PAC', name: 'Tốc độ', color: '#4ade80' },
    { key: 'shooting', label: 'SHO', name: 'Sút bóng', color: '#f97316' },
    { key: 'passing', label: 'PAS', name: 'Chuyền bóng', color: '#60a5fa' },
    { key: 'dribbling', label: 'DRI', name: 'Rê bóng', color: '#a78bfa' },
    { key: 'defending', label: 'DEF', name: 'Phòng thủ', color: '#34d399' },
    { key: 'physical', label: 'PHY', name: 'Thể lực', color: '#fb923c' }
  ];

  const positions = String(user.positions || '').split(',').map(p => p.trim()).filter(Boolean);
  const isGK = positions.includes('GK');

  container.innerHTML = `
    <div class="space-y-6">
      <h1 class="text-2xl font-bold text-white">Hồ sơ cầu thủ</h1>

      <!-- Profile card (FIFA style) -->
      <div class="card relative overflow-hidden">
        <div class="absolute top-0 left-0 right-0 h-24 bg-gradient-to-r from-green-900 to-green-700 opacity-40 rounded-t-2xl"></div>
        <div class="relative">
          <div class="flex items-start gap-4">
            <!-- Avatar -->
            <div class="w-20 h-20 rounded-2xl bg-green-700 flex items-center justify-center text-3xl font-bold text-white flex-shrink-0 border-2 border-green-400">
              ${(user.full_name || user.username || '?')[0]}
            </div>

            <div class="flex-1">
              <div class="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <h2 class="text-white font-bold text-xl">${user.full_name}</h2>
                  <p class="text-gray-400 text-sm">@${user.username}</p>
                  <div class="flex items-center gap-2 mt-1 flex-wrap">
                    ${positionBadge(user.positions)}
                    ${user.is_admin ? '<span class="badge bg-amber-600 text-white">Admin</span>' : ''}
                  </div>
                </div>
                <!-- Overall -->
                <div class="text-center">
                  <div class="text-5xl font-black leading-none" style="color:${overallColor(user.overall_rating)}">${user.overall_rating || 0}</div>
                  <div class="text-gray-400 text-xs mt-0.5">OVERALL</div>
                </div>
              </div>

              <!-- Rating info -->
              <div class="flex items-center gap-4 mt-3 text-sm">
                <div class="text-center">
                  <div class="text-amber-400 font-bold text-lg">${user.rating_points || 1000}</div>
                  <div class="text-gray-500 text-xs">ELO</div>
                </div>
                <div class="text-center">
                  <div class="text-white font-bold">${user.total_matches || 0}</div>
                  <div class="text-gray-500 text-xs">Trận</div>
                </div>
                <div class="text-center">
                  <div class="text-green-400 font-bold">${user.total_wins || 0}</div>
                  <div class="text-gray-500 text-xs">Thắng</div>
                </div>
                <div class="text-center">
                  <div class="text-orange-400 font-bold">${user.total_goals || 0}</div>
                  <div class="text-gray-500 text-xs">Bàn</div>
                </div>
                <div class="text-center">
                  <div class="text-blue-400 font-bold">${user.total_assists || 0}</div>
                  <div class="text-gray-500 text-xs">Kiến tạo</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Stats visualization -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <!-- Field stats -->
        <div class="card">
          <h3 class="text-white font-semibold mb-4">📊 Chỉ số</h3>
          <div class="space-y-3">
            ${stats.map(s => `
              <div>
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-gray-400 font-medium">${s.label}</span>
                  <span class="text-white font-bold">${user[s.key] || 0}</span>
                </div>
                <div class="stat-bar">
                  <div class="stat-bar-fill" style="width:${user[s.key] || 0}%;background:${s.color}"></div>
                </div>
              </div>
            `).join('')}
          </div>
          ${isGK ? `
            <div class="mt-4 pt-4 border-t border-gray-700">
              <p class="text-amber-400 text-xs font-medium mb-3">🧤 Thủ môn</p>
              ${[['gk_diving','DIV'],['gk_handling','HAN'],['gk_reflexes','REF']].map(([f,l]) => `
                <div class="mb-2">
                  <div class="flex justify-between text-sm mb-1">
                    <span class="text-gray-400">${l}</span>
                    <span class="text-white font-bold">${user[f] || 0}</span>
                  </div>
                  <div class="stat-bar"><div class="stat-bar-fill" style="width:${user[f] || 0}%;background:#facc15"></div></div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Win/Loss chart -->
        <div class="card">
          <h3 class="text-white font-semibold mb-4">📈 Thống kê trận</h3>
          ${user.total_matches > 0 ? `
            <div class="space-y-3">
              ${[
                { label: 'Thắng', value: user.total_wins || 0, color: '#4ade80', total: user.total_matches },
                { label: 'Hòa', value: user.total_draws || 0, color: '#facc15', total: user.total_matches },
                { label: 'Thua', value: user.total_losses || 0, color: '#f87171', total: user.total_matches }
              ].map(item => `
                <div>
                  <div class="flex justify-between text-sm mb-1">
                    <span class="text-gray-400">${item.label}</span>
                    <span style="color:${item.color}" class="font-bold">${item.value} trận</span>
                  </div>
                  <div class="stat-bar">
                    <div style="width:${Math.round((item.value/item.total)*100)}%;background:${item.color};height:100%;border-radius:3px;transition:width 0.5s"></div>
                  </div>
                </div>
              `).join('')}
            </div>
            <div class="mt-4 grid grid-cols-2 gap-3 text-center">
              <div class="bg-gray-700 rounded-xl p-3">
                <div class="text-2xl font-bold" style="color:${(user.win_rate||0) >= 50 ? '#4ade80' : '#f87171'}">${
                  user.total_matches > 0 ? Math.round(((user.total_wins||0)/user.total_matches)*100) : 0
                }%</div>
                <div class="text-gray-400 text-xs">Tỉ lệ thắng</div>
              </div>
              <div class="bg-gray-700 rounded-xl p-3">
                <div class="text-2xl font-bold text-orange-400">${user.total_goals || 0}</div>
                <div class="text-gray-400 text-xs">Tổng bàn thắng</div>
              </div>
            </div>
          ` : emptyState('📊', 'Chưa có trận đấu nào', '')}
        </div>
      </div>

      <!-- Edit profile -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-white font-semibold">✏️ Chỉnh sửa hồ sơ</h3>
        </div>
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="form-group mb-0">
              <label class="form-label">Họ tên</label>
              <input type="text" id="profile-fullname" value="${user.full_name || ''}" class="form-input" />
            </div>
            <div class="form-group mb-0">
              <label class="form-label">Phone</label>
              <input type="text" id="profile-phone" value="${user.phone || ''}" class="form-input" />
            </div>
          </div>
          <div class="form-group mb-0">
            <label class="form-label">Email</label>
            <input type="email" id="profile-email" value="${user.email || ''}" class="form-input" />
          </div>
          <button onclick="saveProfile()" class="btn btn-primary btn-sm">
            <i class="fas fa-save mr-1"></i> Lưu thay đổi
          </button>
        </div>
      </div>

      <!-- Edit stats (user tự set) -->
      <div class="card">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-white font-semibold">🎮 Cập nhật chỉ số của bạn</h3>
          <span class="text-gray-500 text-xs">Admin có thể ghi đè</span>
        </div>
        <div class="grid grid-cols-3 gap-3 mb-3">
          ${stats.map(s => `
            <div>
              <label class="form-label">${s.label} - ${s.name}</label>
              <input type="number" min="1" max="99" id="my-stat-${s.key}"
                value="${user[s.key] || 60}" class="form-input text-center" />
            </div>
          `).join('')}
        </div>
        ${isGK ? `
          <div class="grid grid-cols-3 gap-3 mb-3 pt-3 border-t border-gray-700">
            ${[['gk_diving','DIV'],['gk_handling','HAN'],['gk_reflexes','REF']].map(([f,l]) => `
              <div>
                <label class="form-label">${l} (GK)</label>
                <input type="number" min="1" max="99" id="my-stat-${f}"
                  value="${user[f] || 60}" class="form-input text-center" />
              </div>
            `).join('')}
          </div>
        ` : ''}
        <button onclick="saveMyStats(${JSON.stringify(positions).replace(/"/g, '&quot;')}, ${isGK})" class="btn btn-secondary btn-sm">
          <i class="fas fa-save mr-1"></i> Cập nhật chỉ số
        </button>
      </div>

      <!-- Rating History -->
      ${history.length > 0 ? `
        <div class="card">
          <h3 class="text-white font-semibold mb-4">📜 Lịch sử ELO gần đây</h3>
          <div class="space-y-2">
            ${history.map(h => `
              <div class="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                <div>
                  <span class="text-white text-sm">${h.description || h.change_type}</span>
                  <div class="text-gray-500 text-xs">${formatDateTime(h.created_at)}</div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-bold ${Number(h.points_change) >= 0 ? 'text-green-400' : 'text-red-400'}">
                    ${Number(h.points_change) >= 0 ? '+' : ''}${h.points_change}
                  </span>
                  <span class="text-amber-400 text-sm">${h.rating_after}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

async function saveProfile() {
  const updates = {
    full_name: document.getElementById('profile-fullname')?.value.trim(),
    email: document.getElementById('profile-email')?.value.trim(),
    phone: document.getElementById('profile-phone')?.value.trim()
  };

  showLoading(true);
  try {
    const res = await API.updateProfile(updates);
    if (res.success) {
      // Update stored user
      const user = getStoredUser();
      Object.assign(user, updates);
      localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(user));
      document.getElementById('sidebar-name').textContent = updates.full_name || user.full_name;
      showToast('Đã cập nhật hồ sơ!', 'success');
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

async function saveMyStats(positions, isGK) {
  const fields = ['pace','shooting','passing','dribbling','defending','physical'];
  if (isGK) fields.push('gk_diving','gk_handling','gk_reflexes');

  const stats = {};
  fields.forEach(f => {
    const el = document.getElementById(`my-stat-${f}`);
    if (el) stats[f] = Math.min(99, Math.max(1, parseInt(el.value) || 60));
  });

  showLoading(true);
  try {
    const res = await API.updateUserStats({ stats, positions });
    if (res.success) {
      showToast(`Đã cập nhật! Overall: ${res.overall}`, 'success');
      renderProfile(document.getElementById('page-content'));
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}
