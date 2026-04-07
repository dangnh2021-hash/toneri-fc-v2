// ============================================================
// live.js - Màn hình Live Record tỉ số trực tiếp
// ============================================================

let liveState = {
  matchId: null,
  match: null,
  teams: [],
  guestTeams: [],
  results: [],
  localScores: {},  // resultId -> { home, away, events: [{time, side, name}] }
  isAdmin: false
};

async function renderLiveMatch(container, params = {}) {
  const matchId = params.match_id || window._liveMatchId;
  if (!matchId) {
    container.innerHTML = `<div class="card">${emptyState('❌', 'Không tìm thấy trận đấu')}</div>`;
    return;
  }

  liveState.matchId = matchId;
  liveState.isAdmin = getStoredUser().is_admin;

  showLoading(true);
  try {
    const [detailRes, teamsRes, resultsRes] = await Promise.all([
      API.getMatchDetail(matchId),
      API.getTeams(matchId),
      API.getResults(matchId)
    ]);

    if (detailRes.success) {
      liveState.match = detailRes.match;
      liveState.guestTeams = detailRes.guestTeams || [];
    }
    if (teamsRes.success) liveState.teams = teamsRes.teams || [];
    if (resultsRes.success) liveState.results = resultsRes.results || [];

    // Khởi tạo local scores
    liveState.results.forEach(r => {
      if (!liveState.localScores[r.result_id]) {
        liveState.localScores[r.result_id] = {
          home: Number(r.score_home) || 0,
          away: Number(r.score_away) || 0,
          events: [],
          saved: r.status === 'completed'
        };
      }
    });

    renderLiveUI(container);
  } catch (e) {
    container.innerHTML = `<div class="card">${emptyState('❌', 'Lỗi tải dữ liệu')}</div>`;
  } finally {
    showLoading(false);
  }
}

function renderLiveUI(container) {
  const { match, teams, guestTeams, results, isAdmin } = liveState;

  // Build teamMap từ cả internal teams và guest teams
  const teamMap = {};
  teams.forEach(t => { teamMap[t.team_id] = t; });
  guestTeams.forEach(g => {
    teamMap[g.guest_team_id] = { team_id: g.guest_team_id, team_name: g.team_name, team_color: '#9CA3AF' };
  });

  // Nhóm theo lượt — lọc bỏ result có team_id không hợp lệ
  const validResults = results.filter(r =>
    teamMap[r.team_home_id] || teamMap[r.team_away_id]
  );
  const staleResults = results.filter(r =>
    !teamMap[r.team_home_id] && !teamMap[r.team_away_id]
  );

  const legs = {};
  validResults.forEach(r => {
    const leg = r.round_number || 1;
    if (!legs[leg]) legs[leg] = [];
    legs[leg].push(r);
  });
  const legKeys = Object.keys(legs).map(Number).sort((a, b) => a - b);

  const pendingCount = validResults.filter(r => r.status !== 'completed').length;
  const totalTeams = teams.length;

  container.innerHTML = `
    <div class="live-page space-y-4">

      <!-- Header -->
      <div class="flex items-start justify-between flex-wrap gap-3">
        <div>
          <button onclick="navigateTo('formation', {match_id: '${liveState.matchId}'})"
            class="text-gray-400 hover:text-white text-sm mb-2 flex items-center gap-1">
            <i class="fas fa-arrow-left"></i> Quay lại đội hình
          </button>
          <h1 class="text-xl font-bold text-white flex items-center gap-2">
            <span class="live-dot"></span> Live thi đấu
          </h1>
          <p class="text-gray-400 text-sm">${match?.venue_name || ''} · ${formatDate(match?.match_date)}</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button onclick="reloadLiveData()" class="btn btn-secondary btn-sm">
            <i class="fas fa-sync"></i> Tải lại
          </button>
          ${isAdmin ? `
            <button onclick="openAddMatchModal()" class="btn btn-secondary btn-sm">
              <i class="fas fa-plus mr-1"></i> Thêm trận
            </button>
          ` : ''}
          ${pendingCount === 0 && validResults.length > 0 ? `
            <span class="badge badge-completed text-sm px-3 py-1">✅ Tất cả đã xong</span>
          ` : ''}
        </div>
      </div>

      <!-- Đội khách mời (informational) -->
      ${guestTeams.length > 0 ? `
        <div class="bg-gray-800 border border-amber-700/40 rounded-xl p-3 flex items-start gap-2">
          <i class="fas fa-shield-alt text-amber-400 mt-0.5 text-sm"></i>
          <div class="flex-1">
            <span class="text-amber-400 text-xs font-semibold">Đội khách mời tham dự:</span>
            <span class="text-gray-300 text-xs ml-2">${guestTeams.map(g => g.team_name).join(', ')}</span>
            ${validResults.length === 0 || !guestTeams.some(g => teams.find(t => t.team_name === g.team_name)) ? `
              <p class="text-gray-500 text-xs mt-1">
                <i class="fas fa-info-circle mr-1"></i>Vào
                <button onclick="navigateTo('formation', {match_id: '${liveState.matchId}'})"
                  class="text-amber-400 underline">trang Đội hình</button>
                → tạo lại lịch vòng tròn để đội khách xuất hiện trong kết quả.
              </p>
            ` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Cảnh báo data cũ bị lỗi -->
      ${staleResults.length > 0 ? `
        <div class="bg-red-900/20 border border-red-700/40 rounded-xl p-3 flex items-start gap-2">
          <i class="fas fa-exclamation-triangle text-red-400 mt-0.5 text-sm"></i>
          <div class="text-xs">
            <span class="text-red-400 font-semibold">${staleResults.length} trận từ lịch cũ không còn hợp lệ.</span>
            <span class="text-gray-400 ml-1">Vào Đội hình → "Reset & tạo lịch mới" để dọn dẹp.</span>
          </div>
        </div>
      ` : ''}

      <!-- No valid results yet -->
      ${validResults.length === 0 ? `
        <div class="card text-center py-10">
          <div class="text-5xl mb-3">📋</div>
          <p class="text-white font-semibold">Chưa có lịch thi đấu hợp lệ</p>
          <p class="text-gray-400 text-sm mt-1">Vào trang Đội hình → tạo lịch vòng tròn trước</p>
          <button onclick="navigateTo('formation', {match_id: '${liveState.matchId}'})"
            class="btn btn-secondary mt-4">Về trang đội hình</button>
        </div>
      ` : legKeys.map(leg => {
          const legMatches = legs[leg];
          const doneCount = legMatches.filter(r => liveState.localScores[r.result_id]?.saved || r.status === 'completed').length;
          const legLabel = leg === 1 ? 'Lượt đi' : leg === 2 ? 'Lượt về' : `Lượt ${leg}`;
          return `
            <div>
              <div class="flex items-center gap-2 mb-3">
                <div class="w-2 h-2 rounded-full bg-amber-400"></div>
                <span class="text-amber-400 font-bold">${legLabel}</span>
                <span class="text-gray-500 text-xs">(${doneCount}/${legMatches.length} xong)</span>
              </div>
              <div class="space-y-3">
                ${legMatches.map(r => renderLiveResultCard(r, teamMap, isAdmin)).join('')}
              </div>
            </div>
          `;
        }).join('')}

      <!-- Ghi chú -->
      <div class="bg-gray-800 border border-gray-700 rounded-xl p-3 text-xs text-gray-400 flex items-start gap-2">
        <i class="fas fa-info-circle text-blue-400 mt-0.5"></i>
        <span>Nhấn <strong class="text-white">+</strong> để thêm bàn thắng và chọn cầu thủ ghi bàn. Nhấn <strong class="text-green-400">Xong</strong> để lưu kết quả trận và cập nhật ELO rating.</span>
      </div>
    </div>
  `;
}

function renderLiveResultCard(result, teamMap, isAdmin = false) {
  const home = teamMap[result.team_home_id] || {};
  const away = teamMap[result.team_away_id] || {};
  const score = liveState.localScores[result.result_id] || { home: 0, away: 0, events: [], saved: false };
  const isDone = score.saved || result.status === 'completed';
  const showControls = isAdmin && !isDone;

  return `
    <div class="live-match-card ${isDone ? 'opacity-75' : ''}" id="live-card-${result.result_id}">
      <!-- Score row -->
      <div class="flex items-center gap-3 p-4">

        <!-- Home team -->
        <div class="flex-1 text-right">
          <div class="font-bold text-base" style="color:${home.team_color || '#fff'}">${home.team_name || 'Đội 1'}</div>
        </div>

        <!-- Score + controls -->
        <div class="flex items-center gap-2">
          ${!showControls
            ? `<div class="live-score-display">${score.home} - ${score.away}</div>`
            : `
              <div class="flex flex-col items-center gap-1">
                <button onclick="addGoal('${result.result_id}', 'home')"
                  class="live-goal-btn" style="background:${home.team_color || '#ef4444'}33;border:2px solid ${home.team_color || '#ef4444'}">
                  <i class="fas fa-plus text-xs"></i>
                </button>
                <div class="live-score text-2xl font-black" id="score-h-${result.result_id}"
                  style="color:${home.team_color || '#fff'}">${score.home}</div>
                <button onclick="removeGoal('${result.result_id}', 'home')"
                  class="live-goal-btn-sm text-gray-500 hover:text-white">
                  <i class="fas fa-minus text-xs"></i>
                </button>
              </div>

              <div class="text-gray-500 font-bold text-xl px-1">:</div>

              <div class="flex flex-col items-center gap-1">
                <button onclick="addGoal('${result.result_id}', 'away')"
                  class="live-goal-btn" style="background:${away.team_color || '#3b82f6'}33;border:2px solid ${away.team_color || '#3b82f6'}">
                  <i class="fas fa-plus text-xs"></i>
                </button>
                <div class="live-score text-2xl font-black" id="score-a-${result.result_id}"
                  style="color:${away.team_color || '#fff'}">${score.away}</div>
                <button onclick="removeGoal('${result.result_id}', 'away')"
                  class="live-goal-btn-sm text-gray-500 hover:text-white">
                  <i class="fas fa-minus text-xs"></i>
                </button>
              </div>
            `
          }
        </div>

        <!-- Away team -->
        <div class="flex-1">
          <div class="font-bold text-base" style="color:${away.team_color || '#fff'}">${away.team_name || 'Đội 2'}</div>
        </div>
      </div>

      <!-- Events timeline -->
      ${score.events.length > 0 ? `
        <div class="px-4 pb-2 border-t border-gray-700/50 pt-2">
          <div class="flex flex-wrap gap-2">
            ${score.events.map(ev => `
              <span class="text-xs px-2 py-1 rounded-full" style="background:${ev.side === 'home' ? (home.team_color || '#ef4444') + '22' : (away.team_color || '#3b82f6') + '22'}">
                ⚽ ${ev.name || (ev.side === 'home' ? home.team_name : away.team_name)}
              </span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Actions -->
      ${showControls ? `
        <div class="px-4 pb-3 flex items-center justify-between">
          <span class="text-gray-500 text-xs">
            ${score.events.length > 0 ? `${score.events.length} sự kiện` : 'Chưa có bàn thắng'}
          </span>
          <button onclick="finishMatch('${result.result_id}', '${result.match_id || liveState.matchId}', '${result.team_home_id}', '${result.team_away_id}')"
            class="btn btn-primary btn-sm">
            <i class="fas fa-flag-checkered mr-1"></i> Xong trận này
          </button>
        </div>
      ` : isDone ? `
        <div class="px-4 pb-3 text-center">
          <span class="text-green-400 text-xs font-semibold">✅ Kết thúc · ${score.home} - ${score.away}</span>
          ${isAdmin ? `
            <button onclick="reopenMatch('${result.result_id}')" class="text-gray-500 hover:text-amber-400 text-xs ml-3">
              <i class="fas fa-undo mr-1"></i>Sửa
            </button>
          ` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

// ---- Goal controls ----

function addGoal(resultId, side) {
  if (!liveState.localScores[resultId]) return;
  liveState.localScores[resultId][side]++;

  // Cập nhật số liền
  const el = document.getElementById(`score-${side === 'home' ? 'h' : 'a'}-${resultId}`);
  if (el) el.textContent = liveState.localScores[resultId][side];

  // Mở modal chọn cầu thủ ghi bàn (optional)
  openGoalScorerModal(resultId, side);
}

function removeGoal(resultId, side) {
  if (!liveState.localScores[resultId]) return;
  if (liveState.localScores[resultId][side] <= 0) return;
  liveState.localScores[resultId][side]--;

  // Xóa event cuối cùng của side này
  const events = liveState.localScores[resultId].events;
  const lastIdx = events.map((e, i) => e.side === side ? i : -1).filter(i => i >= 0).pop();
  if (lastIdx !== undefined) events.splice(lastIdx, 1);

  const el = document.getElementById(`score-${side === 'home' ? 'h' : 'a'}-${resultId}`);
  if (el) el.textContent = liveState.localScores[resultId][side];

  refreshLiveCard(resultId);
}

function openGoalScorerModal(resultId, side) {
  const result = liveState.results.find(r => r.result_id === resultId);
  const teamId = side === 'home' ? result?.team_home_id : result?.team_away_id;
  const team = liveState.teams.find(t => t.team_id === teamId) || {};
  const players = (team.players || []).filter(p => p.user_id);
  const score = liveState.localScores[resultId];

  openModal(`
    <div class="p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-white font-bold">⚽ Ai ghi bàn?</h3>
        <button onclick="skipScorer('${resultId}', '${side}'); closeModal()" class="text-gray-400 hover:text-white text-sm">
          Bỏ qua <i class="fas fa-times ml-1"></i>
        </button>
      </div>
      <p class="text-gray-400 text-sm mb-3">
        <span style="color:${team.team_color || '#fff'}">${team.team_name || ''}</span>
        — Tỉ số hiện tại: ${score.home} - ${score.away}
      </p>
      ${players.length > 0
        ? `<div class="space-y-2">
            ${players.map(p => `
              <button onclick="selectScorer('${resultId}', '${side}', '${p.user_id}', '${p.full_name}'); closeModal()"
                class="w-full text-left bg-gray-700 hover:bg-gray-600 rounded-xl p-3 flex items-center gap-3 transition">
                <div class="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-sm font-bold text-white">
                  ${(p.full_name || '?')[0]}
                </div>
                <div>
                  <div class="text-white font-medium text-sm">${p.full_name}</div>
                  <div class="text-gray-400 text-xs">${p.assigned_position || ''}</div>
                </div>
              </button>
            `).join('')}
          </div>`
        : `<p class="text-gray-500 text-sm text-center py-4">Không có danh sách cầu thủ</p>`
      }
    </div>
  `);
}

function selectScorer(resultId, side, userId, name) {
  if (!liveState.localScores[resultId]) return;
  liveState.localScores[resultId].events.push({ side, userId, name });
  refreshLiveCard(resultId);
}

function skipScorer(resultId, side) {
  if (!liveState.localScores[resultId]) return;
  liveState.localScores[resultId].events.push({ side, userId: '', name: '' });
  refreshLiveCard(resultId);
}

function refreshLiveCard(resultId) {
  const result = liveState.results.find(r => r.result_id === resultId);
  if (!result) return;
  const teamMap = {};
  liveState.teams.forEach(t => { teamMap[t.team_id] = t; });
  const card = document.getElementById(`live-card-${resultId}`);
  if (card) {
    card.outerHTML = renderLiveResultCard(result, teamMap, liveState.isAdmin);
  }
}

// ---- Finish match ----

async function finishMatch(resultId, matchId, homeId, awayId) {
  const score = liveState.localScores[resultId];
  if (!score) return;

  const scorers = score.events
    .filter(e => e.userId)
    .map(e => ({ user_id: e.userId, goals: 1, assists: 0 }));

  // Aggregate goals per player
  const scorerMap = {};
  scorers.forEach(s => {
    scorerMap[s.user_id] = (scorerMap[s.user_id] || 0) + 1;
  });
  const scorerList = Object.entries(scorerMap).map(([uid, goals]) => ({ user_id: uid, goals, assists: 0 }));

  showLoading(true);
  try {
    const res = await API.saveMatchResult({
      match_id: matchId,
      result_id: resultId,
      team_home_id: homeId,
      team_away_id: awayId,
      score_home: score.home,
      score_away: score.away,
      status: 'completed',
      scorers: scorerList
    });
    if (res.success) {
      liveState.localScores[resultId].saved = true;
      // Update result status in local state
      const r = liveState.results.find(r => r.result_id === resultId);
      if (r) { r.status = 'completed'; r.score_home = score.home; r.score_away = score.away; }
      showToast('Đã lưu kết quả & cập nhật ELO!', 'success');
      refreshLiveCard(resultId);
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

function reopenMatch(resultId) {
  if (!liveState.localScores[resultId]) return;
  liveState.localScores[resultId].saved = false;
  const r = liveState.results.find(r => r.result_id === resultId);
  if (r) r.status = 'pending';
  const teamMap = {};
  liveState.teams.forEach(t => { teamMap[t.team_id] = t; });
  const card = document.getElementById(`live-card-${resultId}`);
  if (card) card.outerHTML = renderLiveResultCard(r, teamMap, liveState.isAdmin);
}

async function reloadLiveData() {
  showLoading(true);
  try {
    const resultsRes = await API.getResults(liveState.matchId);
    if (resultsRes.success) {
      liveState.results = resultsRes.results || [];
      // Sync scores for completed matches
      liveState.results.forEach(r => {
        if (r.status === 'completed' && liveState.localScores[r.result_id]) {
          liveState.localScores[r.result_id].home = Number(r.score_home) || 0;
          liveState.localScores[r.result_id].away = Number(r.score_away) || 0;
          liveState.localScores[r.result_id].saved = true;
        }
        if (!liveState.localScores[r.result_id]) {
          liveState.localScores[r.result_id] = {
            home: Number(r.score_home) || 0,
            away: Number(r.score_away) || 0,
            events: [],
            saved: r.status === 'completed'
          };
        }
      });
    }
    renderLiveUI(document.getElementById('page-content'));
    showToast('Đã tải lại dữ liệu', 'success');
  } catch(e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

// ---- Thêm trận đấu (admin) ----

function openAddMatchModal() {
  const { teams, guestTeams } = liveState;
  const allTeams = [
    ...teams,
    ...guestTeams.map(g => ({ team_id: g.guest_team_id, team_name: g.team_name + ' (Khách)' }))
  ];
  if (allTeams.length < 2) { showToast('Cần ít nhất 2 đội', 'warning'); return; }

  const existingLegs = [...new Set(liveState.results.map(r => Number(r.round_number) || 1))];
  const maxLeg = existingLegs.length > 0 ? Math.max(...existingLegs) : 1;

  const teamOptions = allTeams.map(t =>
    `<option value="${t.team_id}">${t.team_name}</option>`
  ).join('');
  const legOptions = [1, 2, 3].map(l =>
    `<option value="${l}" ${l === maxLeg ? 'selected' : ''}>${l === 1 ? 'Lượt đi' : l === 2 ? 'Lượt về' : `Lượt ${l}`}</option>`
  ).join('');

  openModal(`
    <div class="p-6 space-y-4">
      <h3 class="text-white font-bold text-lg"><i class="fas fa-plus-circle text-green-400 mr-2"></i>Thêm trận đấu</h3>
      <div>
        <label class="text-gray-400 text-sm block mb-1">Đội nhà</label>
        <select id="add-match-home" class="form-select">${teamOptions}</select>
      </div>
      <div>
        <label class="text-gray-400 text-sm block mb-1">Đội khách</label>
        <select id="add-match-away" class="form-select">${teamOptions}</select>
      </div>
      <div>
        <label class="text-gray-400 text-sm block mb-1">Lượt</label>
        <select id="add-match-leg" class="form-select">${legOptions}</select>
      </div>
      <div class="flex gap-3 justify-end pt-2">
        <button onclick="closeModal()" class="btn btn-secondary">Hủy</button>
        <button onclick="submitAddMatch()" class="btn btn-primary">Thêm trận</button>
      </div>
    </div>
  `);
}

async function submitAddMatch() {
  const homeId = document.getElementById('add-match-home').value;
  const awayId = document.getElementById('add-match-away').value;
  const leg = Number(document.getElementById('add-match-leg').value);

  if (homeId === awayId) { showToast('Hai đội phải khác nhau', 'warning'); return; }

  closeModal();
  showLoading(true);
  try {
    const res = await API.addMatchResult({
      match_id: liveState.matchId,
      team_home_id: homeId,
      team_away_id: awayId,
      round_number: leg
    });
    if (res.success) {
      showToast('Đã thêm trận đấu', 'success');
      reloadLiveData();
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}
