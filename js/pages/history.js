// ============================================================
// history.js - Lịch sử trận đấu
// ============================================================

let historyState = {
  matches: [],
  expandedMatchId: null,
  detailCache: {}  // matchId -> { teams, results, attendance, guestTeams }
};

async function renderHistory(container) {
  showLoading(true);
  try {
    const res = await API.getMatches();
    if (!res.success) throw new Error(res.error);

    // Lọc các trận đã qua (theo ngày)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    historyState.matches = (res.matches || []).filter(m => {
      return new Date(m.match_date) < today;
    }).sort((a, b) => new Date(b.match_date) - new Date(a.match_date));

    renderHistoryUI(container);
  } catch (e) {
    container.innerHTML = `<div class="card">${emptyState('❌', 'Lỗi tải dữ liệu')}</div>`;
  } finally {
    showLoading(false);
  }
}

function renderHistoryUI(container) {
  const { matches } = historyState;

  if (matches.length === 0) {
    container.innerHTML = `
      <div class="space-y-5">
        <h1 class="text-2xl font-bold text-white">📅 Lịch sử trận đấu</h1>
        <div class="card text-center py-12">
          <div class="text-5xl mb-3">🏟️</div>
          <p class="text-white font-semibold">Chưa có trận đấu nào</p>
          <p class="text-gray-400 text-sm mt-1">Các trận đã diễn ra sẽ xuất hiện ở đây</p>
        </div>
      </div>`;
    return;
  }

  // Nhóm theo tháng
  const groups = {};
  matches.forEach(m => {
    const d = new Date(m.match_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
    if (!groups[key]) groups[key] = { label, matches: [] };
    groups[key].matches.push(m);
  });

  const groupKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  container.innerHTML = `
    <div class="space-y-5">
      <h1 class="text-2xl font-bold text-white">📅 Lịch sử trận đấu</h1>
      ${groupKeys.map(key => `
        <div>
          <h2 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">${groups[key].label}</h2>
          <div class="space-y-3">
            ${groups[key].matches.map(m => renderHistoryMatchCard(m)).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderHistoryMatchCard(match) {
  const isExpanded = historyState.expandedMatchId === match.match_id;
  const detail = historyState.detailCache[match.match_id];

  return `
    <div class="card overflow-hidden" id="history-card-${match.match_id}">
      <!-- Header -->
      <button onclick="toggleHistoryMatch('${match.match_id}')"
        class="w-full text-left p-4 flex items-center justify-between hover:bg-gray-700/50 transition">
        <div class="flex items-center gap-3">
          <div class="text-2xl">⚽</div>
          <div>
            <div class="font-semibold text-white">${formatDate(match.match_date)}</div>
            <div class="text-gray-400 text-sm">${match.venue_name || ''} · ${formatTime(match.start_time)}</div>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="text-right hidden sm:block">
            <div class="text-xs text-gray-500">${match.num_teams || 2} đội · ${match.num_players_per_team || 5} người/đội</div>
          </div>
          <i class="fas fa-chevron-${isExpanded ? 'up' : 'down'} text-gray-400 text-sm transition-transform"></i>
        </div>
      </button>

      <!-- Detail (expanded) -->
      ${isExpanded ? `
        <div class="border-t border-gray-700 p-4 space-y-4" id="history-detail-${match.match_id}">
          ${detail ? renderHistoryDetail(detail) : `
            <div class="text-center py-6">
              <div class="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <p class="text-gray-400 text-sm mt-2">Đang tải...</p>
            </div>
          `}
        </div>
      ` : ''}
    </div>
  `;
}

async function toggleHistoryMatch(matchId) {
  if (historyState.expandedMatchId === matchId) {
    historyState.expandedMatchId = null;
    refreshHistoryCard(matchId);
    return;
  }

  historyState.expandedMatchId = matchId;
  refreshHistoryCard(matchId);

  // Nếu chưa có cache, load detail
  if (!historyState.detailCache[matchId]) {
    try {
      const res = await API.getMatchDetail(matchId);
      if (res.success) {
        historyState.detailCache[matchId] = {
          teams: res.teams || [],
          results: res.results || [],
          attendance: res.attendance || [],
          guestTeams: res.guestTeams || []
        };
        // Chỉ cập nhật nếu vẫn còn expanded
        if (historyState.expandedMatchId === matchId) {
          const detailEl = document.getElementById(`history-detail-${matchId}`);
          if (detailEl) detailEl.innerHTML = renderHistoryDetail(historyState.detailCache[matchId]);
        }
      }
    } catch (e) {
      const detailEl = document.getElementById(`history-detail-${matchId}`);
      if (detailEl) detailEl.innerHTML = `<p class="text-red-400 text-sm text-center">Lỗi tải dữ liệu</p>`;
    }
  }
}

function refreshHistoryCard(matchId) {
  const match = historyState.matches.find(m => m.match_id === matchId);
  if (!match) return;
  const card = document.getElementById(`history-card-${matchId}`);
  if (card) card.outerHTML = renderHistoryMatchCard(match);
}

function renderHistoryDetail(detail) {
  const { teams, results, attendance, guestTeams } = detail;

  // Build teamMap (internal + guest)
  const teamMap = {};
  teams.forEach(t => { teamMap[t.team_id] = t; });
  guestTeams.forEach(g => {
    teamMap[g.guest_team_id] = { team_id: g.guest_team_id, team_name: g.team_name, team_color: '#9CA3AF' };
  });

  const yesCount = attendance.filter(a => a.vote_status === 'YES').length;
  const completedResults = results.filter(r => r.status === 'completed');

  // Nhóm kết quả theo lượt
  const legs = {};
  completedResults.forEach(r => {
    const leg = r.round_number || 1;
    if (!legs[leg]) legs[leg] = [];
    legs[leg].push(r);
  });
  const legKeys = Object.keys(legs).map(Number).sort((a, b) => a - b);

  return `
    <!-- Tóm tắt -->
    <div class="flex gap-4 text-sm flex-wrap">
      <span class="text-green-400">✅ ${yesCount} tham gia</span>
      <span class="text-gray-400">${teams.length} đội thi đấu</span>
      <span class="text-amber-400">${completedResults.length} trận hoàn thành</span>
    </div>

    <!-- Kết quả theo lượt -->
    ${completedResults.length === 0
      ? `<p class="text-gray-500 text-sm text-center py-4">Chưa có kết quả nào được ghi lại</p>`
      : legKeys.map(leg => `
          <div>
            <p class="text-xs font-semibold text-amber-400 mb-2">
              ${leg === 1 ? '🏃 Lượt đi' : leg === 2 ? '🔄 Lượt về' : `🔁 Lượt ${leg}`}
            </p>
            <div class="space-y-2">
              ${legs[leg].map(r => renderHistoryResultRow(r, teamMap)).join('')}
            </div>
          </div>
        `).join('')
    }

    <!-- Danh sách đội (nếu có) -->
    ${teams.length > 0 ? `
      <div>
        <p class="text-xs font-semibold text-gray-400 mb-2">Đội hình</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${teams.map(t => renderHistoryTeamCard(t)).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

function renderHistoryResultRow(result, teamMap) {
  const home = teamMap[result.team_home_id] || {};
  const away = teamMap[result.team_away_id] || {};

  const homeWin = Number(result.score_home) > Number(result.score_away);
  const awayWin = Number(result.score_away) > Number(result.score_home);

  return `
    <div class="bg-gray-700/50 rounded-xl py-2 px-4 flex items-center gap-2">
      <div class="flex-1 text-right">
        <span class="font-semibold text-sm ${homeWin ? 'text-white' : 'text-gray-400'}"
          style="${homeWin ? `color:${home.team_color || '#fff'}` : ''}">${home.team_name || 'Đội 1'}</span>
      </div>
      <div class="text-white font-bold text-lg mx-3 min-w-[60px] text-center">
        ${result.score_home} - ${result.score_away}
      </div>
      <div class="flex-1">
        <span class="font-semibold text-sm ${awayWin ? 'text-white' : 'text-gray-400'}"
          style="${awayWin ? `color:${away.team_color || '#fff'}` : ''}">${away.team_name || 'Đội 2'}</span>
      </div>
    </div>
  `;
}

function renderHistoryTeamCard(team) {
  const players = team.players || [];
  return `
    <div class="bg-gray-700/50 rounded-xl p-3">
      <div class="flex items-center gap-2 mb-2">
        <div class="w-3 h-3 rounded-full" style="background:${team.team_color || '#666'}"></div>
        <span class="font-semibold text-sm" style="color:${team.team_color || '#fff'}">${team.team_name}</span>
        <span class="text-gray-500 text-xs ml-auto">${players.length} người</span>
      </div>
      ${players.length > 0 ? `
        <div class="space-y-1">
          ${players.map(p => `
            <div class="flex items-center gap-2 text-xs text-gray-300">
              <span class="text-gray-500 w-6 text-center">${p.assigned_position || ''}</span>
              <span>${p.full_name || p.guest_player_name || '?'}</span>
              ${p.goals_scored > 0 ? `<span class="text-amber-400 ml-auto">⚽${p.goals_scored}</span>` : ''}
              ${p.assists > 0 ? `<span class="text-blue-400 ${p.goals_scored > 0 ? '' : 'ml-auto'}">🎯${p.assists}</span>` : ''}
            </div>
          `).join('')}
        </div>
      ` : '<p class="text-gray-500 text-xs">Không có dữ liệu cầu thủ</p>'}
    </div>
  `;
}
