// ============================================================
// formation.js - Xếp đội hình (kéo thả) + Nhập kết quả
// ============================================================

let formationState = {
  matchId: null,
  match: null,
  teams: [],
  suggestedTeams: null,
  attendance: [],
  results: [],
  guestTeams: [],
  isAdmin: false
};

async function renderFormation(container, params = {}) {
  const matchId = params.match_id || window._formationMatchId;
  if (!matchId) {
    container.innerHTML = `<div class="card">${emptyState('❌', 'Không tìm thấy trận đấu')}</div>`;
    return;
  }

  formationState.matchId = matchId;
  formationState.isAdmin = getStoredUser().is_admin;
  formationState.teams = [];
  formationState.attendance = [];
  formationState.results = [];
  formationState.guestTeams = [];

  showLoading(true);
  try {
    const [detailRes, teamsRes] = await Promise.all([
      API.getMatchDetail(matchId),
      API.getTeams(matchId)
    ]);

    if (detailRes.success) {
      formationState.match = detailRes.match;
      formationState.attendance = detailRes.attendance || [];
      formationState.results = detailRes.results || [];
      formationState.guestTeams = detailRes.guestTeams || [];
    }

    if (teamsRes.success && teamsRes.teams.length > 0) {
      formationState.teams = teamsRes.teams;
    }

    renderFormationUI(container);
  } catch (e) {
    container.innerHTML = `<div class="card">${emptyState('❌', 'Lỗi tải dữ liệu')}</div>`;
  } finally {
    showLoading(false);
  }
}

function renderFormationUI(container) {
  const { match, teams, attendance, isAdmin } = formationState;
  const yesPlayers = attendance.filter(a => a.vote_status === 'YES');
  const yesUserIds = new Set(yesPlayers.map(a => a.user_id));

  // Lọc đội hình đã lưu: chỉ giữ cầu thủ đã vote YES (guest player không có user_id thì giữ)
  formationState.teams = teams.map(t => ({
    ...t,
    players: t.players.filter(p => !p.user_id || yesUserIds.has(p.user_id))
  }));

  const hasTeams = formationState.teams.length > 0;

  container.innerHTML = `
    <div class="space-y-5">

      <!-- Back + Title -->
      <div>
        <button onclick="navigateTo('matches')" class="text-gray-400 hover:text-white text-sm mb-3 flex items-center gap-1">
          <i class="fas fa-arrow-left"></i> Quay lại Lịch thi đấu
        </button>
        <div class="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 class="text-2xl font-bold text-white">⚽ Đội hình thi đấu</h1>
            <p class="text-gray-400 text-sm mt-0.5">${match?.venue_name || ''} · ${formatDate(match?.match_date)} · ${formatTime(match?.start_time)}</p>
          </div>
          <div class="flex gap-2 flex-wrap" id="formation-header-btns">
            ${isAdmin && yesPlayers.length > 0 ? `
              <button onclick="runSuggestTeams()" class="btn btn-gold">
                <i class="fas fa-magic"></i> Auto xếp đội
              </button>
            ` : ''}
            ${isAdmin && hasTeams ? `
              <button onclick="saveCurrentTeams()" class="btn btn-primary" id="btn-save-teams">
                <i class="fas fa-save"></i> Lưu đội hình
              </button>
            ` : ''}
            ${hasTeams ? `
              <button onclick="openLiveMatch()" class="btn btn-live" id="btn-live-match">
                <i class="fas fa-circle" style="color:#ef4444;animation:pulse 1.5s infinite"></i> Live thi đấu
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Step guide (admin only) -->
      ${isAdmin ? `
        <div class="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <p class="text-gray-300 text-sm font-semibold mb-2">📋 Hướng dẫn:</p>
          <div class="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
            <span class="${hasTeams ? 'text-green-400' : ''}">
              ${hasTeams ? '✅' : '①'} Xem đội hình bên dưới
            </span>
            <span>② <strong class="text-amber-300">Kéo thả</strong> card cầu thủ giữa các cột để đổi đội</span>
            <span>③ Nhấn <strong class="text-white/80 cursor-pointer">tên đội</strong> để đổi tên</span>
            <span>④ Nhấn <strong class="text-green-400">Lưu đội hình</strong> sau khi điều chỉnh xong</span>
            <span>⑤ Nhấn <strong class="text-red-400">Live thi đấu</strong> để ghi tỉ số trực tiếp</span>
          </div>
        </div>
      ` : ''}

      <!-- Attendance - chỉ YES và NO -->
      <div class="card py-3 px-4">
        <div class="flex items-center gap-4 text-sm flex-wrap">
          <span class="text-green-400 font-semibold">✅ ${yesPlayers.length} tham gia</span>
          <span class="text-red-400">❌ ${attendance.filter(a => a.vote_status === 'NO').length} không tham gia</span>
          <span class="text-gray-500">|</span>
          <span class="text-gray-400">${match?.num_teams || 2} đội · ${match?.num_players_per_team || 5} người/đội</span>
        </div>
      </div>

      <!-- Guest teams -->
      <div id="guest-section">${renderGuestSection()}</div>

      <!-- Teams area -->
      <div id="teams-container">
        ${hasTeams
          ? renderTeamsGrid(formationState.teams)
          : isAdmin && yesPlayers.length > 0
            ? `<div class="card text-center py-10">
                <div class="text-5xl mb-3">⚙️</div>
                <p class="text-white font-semibold text-lg">Chưa có đội hình</p>
                <p class="text-gray-400 text-sm mt-1 mb-5">Nhấn nút bên dưới để AI tự động chia đội cân bằng</p>
                <button onclick="runSuggestTeams()" class="btn btn-gold text-base px-6 py-3">
                  <i class="fas fa-magic mr-2"></i> Auto xếp đội ngay
                </button>
              </div>`
            : `<div class="card">${emptyState('👥', 'Chưa có đội hình', isAdmin ? 'Cần ít nhất 1 người vote YES để xếp đội' : 'Admin chưa xếp đội hình')}</div>`
        }
      </div>

      <!-- Results section - hiện mặc định khi có đội hình -->
      ${hasTeams ? `<div id="results-section">${renderResultsSection()}</div>` : ''}
    </div>
  `;

  if (hasTeams && formationState.isAdmin) {
    initSortable();
  }
}

// ---- Guest Teams ----

function renderGuestSection() {
  const { matchId, guestTeams, isAdmin } = formationState;
  if (!isAdmin && guestTeams.length === 0) return '';
  return `
    <div class="flex items-center justify-between mb-2">
      <h2 class="section-heading mb-0"><i class="fas fa-shield-alt text-gray-400"></i> Đội khách mời</h2>
      ${isAdmin ? `
        <button onclick="openAddGuestModal('${matchId}')" class="btn btn-secondary btn-sm">
          <i class="fas fa-plus mr-1"></i> Thêm đội khách
        </button>
      ` : ''}
    </div>
    <div id="guest-teams-list" class="flex gap-2 flex-wrap min-h-[2rem]">
      ${guestTeams.length > 0
        ? guestTeams.map(g => `
            <div class="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-2">
              <i class="fas fa-shield-alt text-gray-400 text-xs"></i>
              <div>
                <span class="text-white text-sm font-medium">${g.team_name}</span>
                ${g.representative_name ? `<span class="text-gray-400 text-xs ml-1">(${g.representative_name})</span>` : ''}
              </div>
              ${isAdmin ? `
                <button onclick="removeGuestTeam('${g.guest_team_id}')" class="text-red-400 hover:text-red-300 text-xs ml-1">
                  <i class="fas fa-times"></i>
                </button>
              ` : ''}
            </div>
          `).join('')
        : '<p class="text-gray-500 text-xs py-1">Chưa có đội khách</p>'
      }
    </div>
  `;
}

async function removeGuestTeam(guestTeamId) {
  showLoading(true);
  try {
    const res = await API.deleteGuestTeam(guestTeamId);
    if (res.success) {
      formationState.guestTeams = formationState.guestTeams.filter(g => g.guest_team_id !== guestTeamId);
      document.getElementById('guest-section').innerHTML = renderGuestSection();
      showToast('Đã xóa đội khách', 'success');
    } else { showToast(res.error, 'error'); }
  } catch(e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

// ---- Teams Grid ----

function renderTeamsGrid(teams) {
  const numTeams = teams.length;
  const gridCols = numTeams <= 2 ? 'md:grid-cols-2' : numTeams === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4';

  return `
    <div>
      <div class="flex items-center justify-between mb-3">
        <h2 class="section-heading mb-0"><i class="fas fa-users text-green-400"></i> Đội hình</h2>
        <div class="text-sm text-gray-400 hidden sm:block">
          ${teams.map(t => `<span style="color:${t.team_color}">${t.team_name}: avg ${calcAvgRating(t.players)}</span>`).join(' · ')}
        </div>
      </div>
      ${formationState.isAdmin ? `
        <div class="bg-blue-900/30 border border-blue-800 rounded-xl px-4 py-2 mb-3 text-xs text-blue-300 flex items-center gap-2">
          <i class="fas fa-hand-pointer text-blue-400"></i>
          <span><strong>Kéo thả</strong> card cầu thủ để đổi đội · Nhấn <strong>tên đội</strong> để đổi tên · Rating trung bình tự cập nhật</span>
        </div>
      ` : ''}
      <div class="grid grid-cols-1 ${gridCols} gap-4">
        ${teams.map((team, i) => renderTeamColumn(team, i)).join('')}
      </div>
    </div>
  `;
}

function renderTeamColumn(team, idx) {
  const avgRating = calcAvgRating(team.players || []);
  const isGuest = team.team_type === 'guest';

  if (isGuest) {
    // Đội khách: hiển thị đơn giản, không drag-drop
    return `
      <div class="team-column" style="opacity:0.9">
        <div class="team-header" style="background:${team.team_color}22; border-bottom: 2px dashed ${team.team_color}">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="w-4 h-4 rounded-full flex-shrink-0" style="background:${team.team_color}"></div>
              <span style="color:${team.team_color}" class="font-bold">${team.team_name}</span>
              <span class="text-xs px-1.5 py-0.5 rounded" style="background:${team.team_color}33;color:${team.team_color}">Khách</span>
            </div>
          </div>
        </div>
        <div class="px-3 py-4 text-center text-gray-500 text-xs">
          <i class="fas fa-shield-alt text-2xl mb-2 block" style="color:${team.team_color}55"></i>
          Đội khách tham gia vòng tròn<br/>
          <span class="text-gray-600">(không xếp cầu thủ)</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="team-column">
      <div class="team-header" style="background:${team.team_color}22; border-bottom: 2px solid ${team.team_color}">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-4 h-4 rounded-full flex-shrink-0" style="background:${team.team_color}"></div>
            <span id="team-name-${idx}" style="color:${team.team_color}" class="${formationState.isAdmin ? 'cursor-pointer hover:opacity-80' : ''} font-bold"
              ${formationState.isAdmin ? `onclick="startEditTeamName(${idx})" title="Nhấn để đổi tên"` : ''}
              >${team.team_name}</span>
            ${formationState.isAdmin ? `<i class="fas fa-pencil-alt text-xs opacity-30 cursor-pointer" onclick="startEditTeamName(${idx})"></i>` : ''}
          </div>
          <div class="text-gray-400 text-sm font-normal">OVR avg: <span style="color:${team.team_color}" class="font-bold">${avgRating}</span></div>
        </div>
      </div>
      <div class="team-players-list ${formationState.isAdmin ? 'sortable-list' : ''}" data-team-idx="${idx}" id="team-list-${idx}">
        ${(team.players || []).map(p => renderPlayerCard(p)).join('')}
        ${(team.players || []).length === 0 ? `<div class="text-center text-gray-600 text-xs py-4">Kéo cầu thủ vào đây</div>` : ''}
      </div>
      <div class="px-3 pb-3 flex items-center justify-between">
        <div class="text-gray-500 text-xs">${(team.players || []).length} cầu thủ</div>
        <div class="text-xs" style="color:${team.team_color}">avg OVR: <strong id="avg-${idx}">${avgRating}</strong></div>
      </div>
      ${formationState.isAdmin ? `
        <div class="px-3 pb-3 pt-0">
          <button onclick="showAddPlayerModal(${idx})"
            class="w-full text-xs text-gray-600 hover:text-gray-300 border border-dashed border-gray-700 hover:border-gray-500 rounded-lg py-2 transition-colors">
            <i class="fas fa-plus mr-1"></i> Thêm cầu thủ
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function startEditTeamName(idx) {
  const el = document.getElementById(`team-name-${idx}`);
  if (!el) return;
  const currentName = formationState.teams[idx]?.team_name || '';
  const color = formationState.teams[idx]?.team_color || '#fff';
  el.outerHTML = `<input type="text" id="team-name-${idx}"
    value="${currentName}"
    style="color:${color};background:transparent;border:none;border-bottom:1px solid ${color};outline:none;font-weight:700;width:120px;font-size:15px;"
    onblur="saveTeamName(${idx}, this.value)"
    onkeydown="if(event.key==='Enter')this.blur()"
    autofocus />`;
  document.getElementById(`team-name-${idx}`)?.select();
}

function saveTeamName(idx, newName) {
  const name = newName.trim() || formationState.teams[idx]?.team_name || 'Đội';
  if (formationState.teams[idx]) {
    formationState.teams[idx].team_name = name;
  }
  const color = formationState.teams[idx]?.team_color || '#fff';
  const el = document.getElementById(`team-name-${idx}`);
  if (el) {
    el.outerHTML = `<span id="team-name-${idx}" style="color:${color}" class="cursor-pointer hover:opacity-80 font-bold"
      onclick="startEditTeamName(${idx})" title="Nhấn để đổi tên">${name}</span>`;
  }
  // Cập nhật lại results section để hiển thị tên mới
  const section = document.getElementById('results-section');
  if (section) section.innerHTML = renderResultsSection();
}

function renderPlayerCard(player) {
  const posClass = (player.assigned_position || player.position_played || 'MF').toLowerCase();
  const overall = player.overall_rating || 50;
  return `
    <div class="player-card mb-2"
      data-user-id="${player.user_id || ''}"
      data-name="${player.full_name || player.guest_player_name || ''}"
      data-position="${player.assigned_position || player.position_played || 'MF'}"
      data-overall="${overall}">
      <div class="flex items-center gap-3">
        <div class="text-center w-10 flex-shrink-0">
          <div class="overall" style="color:${overallColor(overall)}">${overall}</div>
          <span class="pos-badge pos-${posClass}">${player.assigned_position || player.position_played || 'MF'}</span>
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-white text-sm font-semibold truncate">${player.full_name || player.guest_player_name || 'Unknown'}</div>
          <div class="text-gray-400 text-xs">${positionBadge(player.positions || player.assigned_position || '')}</div>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          ${formationState.isAdmin ? `
            <button onclick="removePlayerFromTeam(this)"
              class="text-gray-600 hover:text-red-400 transition-colors text-base leading-none px-1 py-0.5 rounded"
              title="Xóa khỏi đội">×</button>
          ` : `
            <div class="text-gray-600 text-xs hidden sm:block"><i class="fas fa-grip-vertical"></i></div>
          `}
        </div>
      </div>
    </div>
  `;
}

function calcAvgRating(players) {
  if (!players || players.length === 0) return 0;
  const sum = players.reduce((s, p) => s + (Number(p.overall_rating) || 50), 0);
  return Math.round(sum / players.length);
}

function initSortable() {
  document.querySelectorAll('.sortable-list').forEach(list => {
    if (list._sortable) { list._sortable.destroy(); }
    list._sortable = new Sortable(list, {
      group: 'formation-teams',
      animation: 150,
      ghostClass: 'opacity-30',
      chosenClass: 'opacity-75',
      onEnd: onPlayerMoved
    });
  });
}

function onPlayerMoved() {
  document.querySelectorAll('.sortable-list').forEach((list, idx) => {
    const cards = list.querySelectorAll('.player-card');
    let total = 0;
    cards.forEach(card => { total += Number(card.dataset.overall) || 0; });
    const avg = cards.length > 0 ? Math.round(total / cards.length) : 0;

    const avgEl = document.getElementById(`avg-${idx}`);
    if (avgEl) avgEl.textContent = avg;

    const col = list.closest('.team-column');
    if (col) {
      const countEl = col.querySelector('.text-gray-500.text-xs');
      if (countEl) countEl.textContent = `${cards.length} cầu thủ`;
    }
  });
}

// ---- Thêm / Xóa cầu thủ thủ công ----

let _addPlayerTargetIdx = null;

function removePlayerFromTeam(btn) {
  const card = btn.closest('.player-card');
  if (!card) return;
  card.remove();
  onPlayerMoved();
}

function showAddPlayerModal(teamIdx) {
  _addPlayerTargetIdx = teamIdx;
  const existing = document.getElementById('add-player-modal');
  if (existing) existing.remove();

  document.body.insertAdjacentHTML('beforeend', `
    <div id="add-player-modal"
      class="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div class="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl"
        onclick="event.stopPropagation()">
        <h3 class="text-white font-bold text-lg mb-4">➕ Thêm cầu thủ vào đội</h3>
        <div class="space-y-3">
          <div>
            <label class="text-gray-400 text-xs mb-1 block">Tên cầu thủ</label>
            <input id="adhoc-name" type="text" placeholder="Nhập tên..."
              class="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              onkeydown="if(event.key==='Enter')confirmAddAdhocPlayer()" />
          </div>
          <div>
            <label class="text-gray-400 text-xs mb-1 block">Vị trí</label>
            <select id="adhoc-pos"
              class="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
              <option value="GK">GK – Thủ môn</option>
              <option value="DF">DF – Hậu vệ</option>
              <option value="MF" selected>MF – Tiền vệ</option>
              <option value="FW">FW – Tiền đạo</option>
            </select>
          </div>
          <div>
            <label class="text-gray-400 text-xs mb-1 block">Chỉ số (1–99)</label>
            <input id="adhoc-rating" type="number" value="60" min="1" max="99"
              class="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
        </div>
        <div class="flex gap-2 mt-5">
          <button onclick="confirmAddAdhocPlayer()" class="flex-1 btn btn-primary">Thêm vào đội</button>
          <button onclick="document.getElementById('add-player-modal').remove()" class="flex-1 btn btn-secondary">Hủy</button>
        </div>
      </div>
    </div>
  `);
  setTimeout(() => document.getElementById('adhoc-name')?.focus(), 50);
}

function confirmAddAdhocPlayer() {
  const name = document.getElementById('adhoc-name')?.value.trim();
  if (!name) { document.getElementById('adhoc-name')?.focus(); return; }

  const pos = document.getElementById('adhoc-pos')?.value || 'MF';
  const rating = Math.min(99, Math.max(1, Number(document.getElementById('adhoc-rating')?.value) || 60));

  const list = document.getElementById(`team-list-${_addPlayerTargetIdx}`);
  if (!list) return;

  // Xóa placeholder "Kéo cầu thủ vào đây" nếu còn
  const placeholder = list.querySelector('.text-center.text-gray-600');
  if (placeholder) placeholder.remove();

  const fakePlayer = {
    user_id: '',
    full_name: name,
    guest_player_name: name,
    assigned_position: pos,
    positions: pos,
    overall_rating: rating
  };
  list.insertAdjacentHTML('beforeend', renderPlayerCard(fakePlayer));

  document.getElementById('add-player-modal')?.remove();
  onPlayerMoved();
}

// ---- Auto suggest teams ----

async function runSuggestTeams() {
  showLoading(true);
  try {
    const res = await API.suggestTeams(formationState.matchId);
    if (res.success) {
      formationState.teams = res.teams.map((t, i) => ({
        team_id: `temp_${i}`,
        team_name: t.name,
        team_color: t.color,
        team_type: 'internal',
        players: t.players.map(p => ({
          ...p,
          user_id: p.user_id,
          full_name: p.full_name,
          overall_rating: p.overall_rating,
          positions: p.positions.join(','),
          assigned_position: p.assigned_position
        }))
      }));

      document.getElementById('teams-container').innerHTML = renderTeamsGrid(formationState.teams);
      initSortable();

      // Show Lưu đội hình + Live buttons if not already present
      if (!document.getElementById('btn-save-teams')) {
        const btnsDiv = document.getElementById('formation-header-btns');
        if (btnsDiv) {
          btnsDiv.insertAdjacentHTML('beforeend', `
            <button onclick="saveCurrentTeams()" class="btn btn-primary" id="btn-save-teams">
              <i class="fas fa-save"></i> Lưu đội hình
            </button>
            <button onclick="openLiveMatch()" class="btn btn-live" id="btn-live-match">
              <i class="fas fa-circle" style="color:#ef4444;animation:pulse 1.5s infinite"></i> Live thi đấu
            </button>
          `);
        }
      }

      const diff = res.balanceScore !== null ? `(chênh lệch: ${res.balanceScore} điểm)` : '';
      showToast(`Đã xếp ${formationState.teams.length} đội ${diff}`, 'success');
    } else {
      showToast(res.error, 'error');
    }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

// ---- Save Teams ----

async function saveCurrentTeams() {
  const teamsData = [];

  document.querySelectorAll('.team-column').forEach((col, idx) => {
    const team = formationState.teams[idx];
    if (!team) return;
    // Bỏ qua guest teams — họ đã được lưu riêng khi addGuestTeam
    if (team.team_type === 'guest') return;

    const players = [];
    col.querySelectorAll('.player-card').forEach(card => {
      players.push({
        user_id: card.dataset.userId,
        full_name: card.dataset.name,
        assigned_position: card.dataset.position,
        overall_rating: card.dataset.overall
      });
    });

    // Lấy tên từ state (đã được đổi tên nếu user edit)
    const nameEl = document.getElementById(`team-name-${idx}`);
    const teamName = nameEl?.textContent?.trim() || team.team_name;

    teamsData.push({
      name: teamName,
      color: team.team_color,
      team_type: 'internal',
      players
    });
  });

  if (teamsData.length === 0) {
    showToast('Không có đội nào để lưu', 'warning'); return;
  }

  showLoading(true);
  try {
    const res = await API.saveTeams(formationState.matchId, teamsData);
    if (res.success) {
      showToast('Đã lưu đội hình!', 'success');
      renderFormation(document.getElementById('page-content'), { match_id: formationState.matchId });
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

// ---- Results Section ----

function renderResultsSection() {
  const { teams, results, isAdmin, guestTeams } = formationState;
  if (teams.length < 2) return '';

  const teamMap = {};
  teams.forEach(t => { teamMap[t.team_id] = t; });
  guestTeams.forEach(g => {
    teamMap[g.guest_team_id] = { team_id: g.guest_team_id, team_name: g.team_name, team_color: '#9CA3AF' };
  });

  const completedResults = results.filter(r => r.status === 'completed');
  const pendingCount = results.filter(r => r.status !== 'completed').length;

  // Nhóm tất cả kết quả theo lượt (gồm cả pending)
  const legs = {};
  results.forEach(r => {
    const leg = r.round_number || 1;
    if (!legs[leg]) legs[leg] = [];
    legs[leg].push(r);
  });
  const legKeys = Object.keys(legs).map(Number).sort((a, b) => a - b);

  return `
    <div>
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 class="section-heading mb-0"><i class="fas fa-futbol text-green-400"></i> Kết quả vòng tròn
          ${results.length > 0 ? `<span class="text-sm font-normal text-gray-400 ml-2">(${completedResults.length}/${results.length} trận xong)</span>` : ''}
        </h2>
        ${isAdmin ? `
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-gray-400 text-xs">Tạo lịch:</span>
            <button onclick="confirmGenerateSchedule(1)" class="btn btn-secondary btn-sm">1 lượt</button>
            <button onclick="confirmGenerateSchedule(2)" class="btn btn-secondary btn-sm">2 lượt</button>
            <button onclick="confirmGenerateSchedule(3)" class="btn btn-secondary btn-sm">3 lượt</button>
          </div>
        ` : ''}
      </div>

      <!-- Giải thích khi chỉ có 2 đội -->
      ${teams.length === 2 ? `
        <div class="bg-blue-900/20 border border-blue-800/50 rounded-xl px-4 py-2 mb-3 text-xs text-blue-300 flex items-start gap-2">
          <i class="fas fa-info-circle text-blue-400 mt-0.5"></i>
          <span>Có <strong>2 đội</strong> → mỗi lượt chỉ có <strong>1 trận</strong> (Đội Đỏ vs Đội Xanh). Muốn nhiều trận khác nhau → cần ≥ 3 đội.</span>
        </div>
      ` : ''}

      ${results.length === 0
        ? `<div class="card text-center py-8">
            <div class="text-4xl mb-3">📅</div>
            <p class="text-white font-semibold">Chưa có lịch thi đấu</p>
            <p class="text-gray-400 text-sm mt-1">${isAdmin ? 'Nhấn "1 lượt" ... để tạo vòng tròn' : ''}</p>
          </div>`
        : legKeys.map(leg => `
            <div class="mb-4">
              <div class="flex items-center gap-2 mb-2">
                <span class="text-amber-400 font-semibold text-sm">
                  ${leg === 1 ? '🏃 Lượt đi' : leg === 2 ? '🔄 Lượt về' : `🔁 Lượt ${leg}`}
                </span>
                <span class="text-gray-500 text-xs">(${legs[leg].filter(r => r.status === 'completed').length}/${legs[leg].length} xong)</span>
              </div>
              <div class="space-y-2">
                ${legs[leg].map(r => renderResultRow(r, teamMap, isAdmin)).join('')}
              </div>
            </div>
          `).join('')
      }
    </div>
  `;
}

async function refreshResultsSection() {
  try {
    const res = await API.getResults(formationState.matchId);
    if (res.success) {
      formationState.results = res.results || [];
    }
    const section = document.getElementById('results-section');
    if (section) section.innerHTML = renderResultsSection();
  } catch (e) {}
}

async function resetResult(resultId) {
  const result = formationState.results.find(r => r.result_id === resultId);
  if (!result) return;
  showLoading(true);
  try {
    const res = await API.saveMatchResult({
      match_id: result.match_id || formationState.matchId,
      result_id: resultId,
      team_home_id: result.team_home_id,
      team_away_id: result.team_away_id,
      score_home: 0,
      score_away: 0,
      status: 'pending'
    });
    if (res.success) {
      showToast('Đã reset kết quả về chưa đấu', 'success');
      refreshResultsSection();
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

async function resetPendingResults() {
  const pendingCount = formationState.results.filter(r => r.status !== 'completed').length;
  if (pendingCount === 0) return;
  showLoading(true);
  try {
    const res = await API.deleteMatchResults(formationState.matchId, 'pending');
    if (res.success) {
      showToast(`Đã xóa ${res.deleted} trận chưa đấu`, 'success');
      refreshResultsSection();
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

function renderResultRow(result, teamMap, isAdmin = false) {
  const home = teamMap[result.team_home_id] || {};
  const away = teamMap[result.team_away_id] || {};
  const isPending = result.status !== 'completed';

  return `
    <div class="card py-3 px-4 ${isPending ? 'opacity-60' : ''}">
      <div class="flex items-center gap-2">
        <div class="flex-1 text-right">
          <span class="font-semibold text-sm" style="color:${home.team_color || '#fff'}">${home.team_name || 'Đội 1'}</span>
        </div>
        <div class="text-white font-bold text-xl mx-3 min-w-[70px] text-center">
          ${isPending ? '<span class="text-gray-500 text-sm font-normal">vs</span>' : `${result.score_home} - ${result.score_away}`}
        </div>
        <div class="flex-1">
          <span class="font-semibold text-sm" style="color:${away.team_color || '#fff'}">${away.team_name || 'Đội 2'}</span>
        </div>
        ${isAdmin
          ? isPending
            ? `<button onclick="deleteOneResult('${result.result_id}')" class="btn btn-danger btn-sm flex-shrink-0" title="Xóa trận này">
                <i class="fas fa-trash text-xs"></i>
              </button>`
            : `<button onclick="resetResult('${result.result_id}')" class="btn btn-secondary btn-sm flex-shrink-0" title="Reset về chưa đấu">
                <i class="fas fa-undo text-xs"></i>
              </button>`
          : isPending
            ? `<span class="text-gray-500 text-xs">⏳</span>`
            : `<span class="badge badge-completed text-xs">✅</span>`
        }
      </div>
      ${result.scorers_summary && !isPending ? `
        <div class="mt-2 pt-2 border-t border-gray-700 text-gray-500 text-xs">${result.scorers_summary}</div>
      ` : ''}
    </div>
  `;
}

async function deleteOneResult(resultId) {
  showLoading(true);
  try {
    const res = await API.deleteMatchResult(resultId);
    if (res.success) {
      formationState.results = formationState.results.filter(r => r.result_id !== resultId);
      showToast('Đã xóa trận đấu', 'success');
      const section = document.getElementById('results-section');
      if (section) section.innerHTML = renderResultsSection();
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

function confirmGenerateSchedule(numRounds) {
  const hasAny = formationState.results.length > 0;
  if (hasAny) {
    const completedCount = formationState.results.filter(r => r.status === 'completed').length;
    openModal(`
      <div class="p-6 text-center">
        <div class="text-4xl mb-4">⚠️</div>
        <h3 class="text-white font-semibold text-lg mb-2">Tạo lịch ${numRounds} lượt?</h3>
        <p class="text-gray-400 mb-1 text-sm">Hiện có <strong class="text-white">${formationState.results.length} trận</strong> trong lịch
          ${completedCount > 0 ? `(${completedCount} đã xong)` : ''}.
        </p>
        <p class="text-gray-400 mb-5 text-sm">Chọn cách xử lý lịch cũ:</p>
        <div class="flex flex-col gap-2">
          <button onclick="closeModal(); generateRoundRobin(${numRounds}, false)" class="btn btn-secondary w-full justify-center">
            <i class="fas fa-plus mr-2"></i> Giữ lịch cũ, thêm lượt mới
          </button>
          <button onclick="closeModal(); generateRoundRobin(${numRounds}, true)" class="btn btn-danger w-full justify-center">
            <i class="fas fa-trash mr-2"></i> Xóa tất cả & tạo lại từ đầu
          </button>
          <button onclick="closeModal()" class="btn btn-secondary w-full justify-center text-gray-400">Hủy</button>
        </div>
      </div>
    `);
  } else {
    generateRoundRobin(numRounds, false);
  }
}

async function generateRoundRobin(numRounds = 1, resetAll = false) {
  showLoading(true);
  try {
    const res = await API.call('generateSchedule', {
      match_id: formationState.matchId,
      num_rounds: numRounds,
      reset_all: resetAll
    });
    if (res.success) {
      showToast(`Đã tạo ${res.schedule.length} trận (${numRounds} lượt)`, 'success');
      refreshResultsSection();
    } else { showToast(res.error || 'Lỗi tạo lịch', 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

async function submitResult(resultId, matchId, homeId, awayId) {
  const scoreHome = parseInt(document.getElementById(`score-home-${resultId}`)?.value) || 0;
  const scoreAway = parseInt(document.getElementById(`score-away-${resultId}`)?.value) || 0;

  showLoading(true);
  try {
    const res = await API.saveMatchResult({
      match_id: matchId,
      result_id: resultId,
      team_home_id: homeId,
      team_away_id: awayId,
      score_home: scoreHome,
      score_away: scoreAway,
      status: 'completed',
      scorers: []
    });
    if (res.success) {
      showToast('Đã lưu kết quả & cập nhật ELO!', 'success');
      // Mở modal nhập cầu thủ ghi bàn ngay
      openScorerModal(resultId, matchId, homeId, awayId);
      refreshResultsSection();
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

function openScorerModal(resultId, matchId, homeId, awayId) {
  const { teams } = formationState;
  const homeTeam = teams.find(t => t.team_id === homeId) || {};
  const awayTeam = teams.find(t => t.team_id === awayId) || {};
  const homePlayers = (homeTeam.players || []).filter(p => p.user_id);
  const awayPlayers = (awayTeam.players || []).filter(p => p.user_id);

  openModal(`
    <div class="p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-white font-bold text-lg">⚽ Ghi bàn / Kiến tạo</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
      </div>

      ${homePlayers.length > 0 ? `
        <p class="text-xs font-semibold mb-2" style="color:${homeTeam.team_color || '#fff'}">${homeTeam.team_name || 'Đội nhà'}</p>
        <div class="space-y-2 mb-4">
          ${homePlayers.map(p => renderScorerRow(p)).join('')}
        </div>
      ` : ''}

      ${awayPlayers.length > 0 ? `
        <p class="text-xs font-semibold mb-2" style="color:${awayTeam.team_color || '#fff'}">${awayTeam.team_name || 'Đội khách'}</p>
        <div class="space-y-2 mb-4">
          ${awayPlayers.map(p => renderScorerRow(p)).join('')}
        </div>
      ` : ''}

      <button onclick="submitScorers('${matchId}', [${[...homePlayers, ...awayPlayers].map(p => `'${p.user_id}'`).join(',')}])"
        class="btn btn-primary w-full justify-center mt-2">
        <i class="fas fa-save mr-2"></i> Lưu thống kê
      </button>
    </div>
  `);
}

function renderScorerRow(player) {
  return `
    <div class="flex items-center gap-3 bg-gray-700 rounded-xl p-3">
      <div class="flex-1 text-white font-medium text-sm">${player.full_name}</div>
      <div class="flex items-center gap-2">
        <span class="text-gray-400 text-xs">⚽</span>
        <input type="number" min="0" max="20" value="0" class="score-input" style="width:48px;f