// ============================================================
// dashboard.js - Trang chủ: trận sắp tới + vote + stats
// ============================================================

async function renderDashboard(container) {
  const user = getStoredUser();

  // Load dữ liệu song song
  showLoading(true);
  let upcoming = [], leaderboard = [];
  try {
    const [upRes, lbRes] = await Promise.all([
      API.getUpcomingMatches(),
      API.getLeaderboard()
    ]);
    if (upRes.success) upcoming = upRes.matches || [];
    if (lbRes.success) leaderboard = lbRes.leaderboard || [];
  } catch (e) {
    showToast('Lỗi tải dữ liệu', 'error');
  } finally {
    showLoading(false);
  }

  const nextMatch = upcoming[0] || null;
  const myRank = leaderboard.findIndex(p => p.user_id === user.user_id) + 1;
  const myStats = leaderboard.find(p => p.user_id === user.user_id) || user;

  container.innerHTML = `
    <div class="space-y-6">

      <!-- Notifications (loaded async) -->
      <div id="notifications-section"></div>

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Xin chào, ${user.full_name || user.username}! 👋</h1>
          <p class="text-gray-400 text-sm mt-0.5">Chào mừng đến với Toneri FC</p>
        </div>
        <div class="text-right hidden sm:block">
          <div class="text-2xl font-bold text-amber-400">${myStats.rating_points || 1000}</div>
          <div class="text-gray-400 text-xs">ELO Rating</div>
        </div>
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${dashStatCard('🏅', myRank > 0 ? `#${myRank}` : '-', 'Xếp hạng', 'text-amber-400')}
        ${dashStatCard('⚽', myStats.total_goals || 0, 'Bàn thắng', 'text-green-400')}
        ${dashStatCard('🎯', myStats.total_matches || 0, 'Số trận', 'text-blue-400')}
        ${dashStatCard('📈', `${myStats.win_rate || 0}%`, 'Tỉ lệ thắng', 'text-purple-400')}
      </div>

      <!-- Next Match -->
      <div>
        <h2 class="section-heading"><i class="fas fa-calendar-check text-green-400"></i> Trận tiếp theo</h2>
        ${nextMatch ? renderNextMatchCard(nextMatch, user) : `
          <div class="card ${emptyState('⚽', 'Chưa có lịch thi đấu', 'Admin sẽ thêm lịch sớm thôi!')}"></div>
        `}
      </div>

      <!-- Upcoming (rest) -->
      ${upcoming.length > 1 ? `
        <div>
          <h2 class="section-heading"><i class="fas fa-list text-blue-400"></i> Lịch sắp tới</h2>
          <div class="space-y-3">
            ${upcoming.slice(1, 4).map(m => renderUpcomingMatchRow(m)).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Top 5 Leaderboard -->
      ${leaderboard.length > 0 ? `
        <div>
          <div class="flex items-center justify-between mb-3">
            <h2 class="section-heading mb-0"><i class="fas fa-trophy text-amber-400"></i> Top cầu thủ</h2>
            <a href="#leaderboard" onclick="navigateTo('leaderboard')" class="text-green-400 text-sm hover:underline">Xem tất cả →</a>
          </div>
          <div class="card p-0 overflow-hidden">
            <div class="table-responsive">
              <table>
                <thead><tr>
                  <th>#</th><th>Cầu thủ</th><th>Vị trí</th><th>OVR</th><th>ELO</th><th>W</th>
                </tr></thead>
                <tbody>
                  ${leaderboard.slice(0, 5).map((p, i) => `
                    <tr>
                      <td class="font-bold ${i < 3 ? ['rank-1','rank-2','rank-3'][i] : 'text-gray-400'}">${i + 1}</td>
                      <td>
                        <div class="flex items-center gap-2">
                          <div class="w-8 h-8 rounded-full bg-green-800 flex items-center justify-center text-xs font-bold text-white">
                            ${(p.full_name || '?')[0]}
                          </div>
                          <span class="font-medium text-white">${p.full_name}</span>
                          ${p.user_id === user.user_id ? '<span class="badge badge-yes text-xs">Bạn</span>' : ''}
                        </div>
                      </td>
                      <td>${positionBadge(p.positions)}</td>
                      <td class="font-bold" style="color:${overallColor(p.overall_rating)}">${p.overall_rating}</td>
                      <td class="font-bold text-amber-400">${p.rating_points}</td>
                      <td class="text-green-400">${p.total_wins || 0}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ` : ''}
    </div>
  `;

  // Load vote status for next match
  if (nextMatch) {
    loadVoteForMatch(nextMatch.match_id, user.user_id);
  }

  // Load notifications async (không block render)
  if (upcoming.length > 0) {
    loadDashboardNotifications(upcoming, user);
  }
}

// ---- Notifications ----

async function loadDashboardNotifications(upcoming, user) {
  try {
    // Kiểm tra vote status cho TẤT CẢ upcoming matches + formation của trận gần nhất
    const [voteResults, teamsRes] = await Promise.all([
      Promise.all(upcoming.map(m =>
        API.getMyVote(m.match_id)
          .then(r => ({ matchId: m.match_id, vote: r.success ? r.vote : null }))
          .catch(() => ({ matchId: m.match_id, vote: null }))
      )),
      API.getTeams(upcoming[0].match_id).catch(() => ({ success: false }))
    ]);

    const notifications = [];

    // Thông báo chưa vote
    upcoming.forEach((m, i) => {
      const { vote } = voteResults[i];
      if (!vote) {
        notifications.push({
          type: 'vote',
          matchId: m.match_id,
          title: 'Chưa xác nhận tham gia',
          body: `${m.venue_name} · ${formatDate(m.match_date)} ${formatTime(m.start_time)}`,
          action: `openMatchDetail('${m.match_id}')`,
          actionLabel: 'Vote ngay',
          color: 'amber'
        });
      }
    });

    // Thông báo đội hình đã sẵn sàng (chỉ trận gần nhất)
    if (teamsRes.success && (teamsRes.teams?.length > 0)) {
      const m = upcoming[0];
      notifications.push({
        type: 'formation',
        matchId: m.match_id,
        title: 'Đội hình đã được xếp',
        body: `${m.venue_name} · ${formatDate(m.match_date)} — Admin đã xếp xong đội hình`,
        action: `openFormationFromDash('${m.match_id}')`,
        actionLabel: 'Xem đội hình',
        color: 'green'
      });
    }

    const section = document.getElementById('notifications-section');
    if (!section || notifications.length === 0) return;

    section.innerHTML = `
      <div class="space-y-2">
        ${notifications.map(n => `
          <div class="flex items-start gap-3 rounded-xl px-4 py-3 border
            ${n.color === 'amber'
              ? 'bg-amber-900/20 border-amber-700/40'
              : 'bg-green-900/20 border-green-700/40'}">
            <span class="text-lg mt-0.5">${n.color === 'amber' ? '🔔' : '👥'}</span>
            <div class="flex-1 min-w-0">
              <p class="font-semibold text-sm ${n.color === 'amber' ? 'text-amber-300' : 'text-green-300'}">${n.title}</p>
              <p class="text-gray-400 text-xs mt-0.5 truncate">${n.body}</p>
            </div>
            <button onclick="${n.action}"
              class="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0
                ${n.color === 'amber'
                  ? 'bg-amber-500 hover:bg-amber-400 text-black'
                  : 'bg-green-600 hover:bg-green-500 text-white'}">
              ${n.actionLabel}
            </button>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) { /* silent */ }
}

function openFormationFromDash(matchId) {
  window._formationMatchId = matchId;
  navigateTo('formation', { match_id: matchId });
}

function dashStatCard(icon, value, label, colorClass) {
  return `
    <div class="card text-center">
      <div class="text-2xl mb-1">${icon}</div>
      <div class="text-xl font-bold ${colorClass}">${value}</div>
      <div class="text-gray-400 text-xs">${label}</div>
    </div>`;
}

function renderNextMatchCard(match, user) {
  const matchDate = formatDate(match.match_date);
  const startTime = formatTime(match.start_time);
  const endTime = match.end_time ? ` - ${formatTime(match.end_time)}` : '';

  return `
    <div class="card border-green-800" id="next-match-card">
      <div class="flex items-start justify-between mb-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            ${matchStatusBadge(match.status)}
            <span class="text-gray-400 text-sm">${match.match_format || '5v5'}</span>
          </div>
          <h3 class="text-white font-bold text-lg">${match.venue_name}</h3>
          <p class="text-gray-400 text-sm">${match.venue_address || ''}</p>
        </div>
        <div class="text-right">
          <div class="text-green-400 font-semibold">${matchDate}</div>
          <div class="text-gray-300 text-sm">${startTime}${endTime}</div>
        </div>
      </div>

      ${match.notes ? `<p class="text-gray-400 text-sm mb-4 italic">${match.notes}</p>` : ''}

      <!-- Vote section -->
      <div id="vote-section-${match.match_id}">
        <p class="text-gray-400 text-sm mb-3">Bạn có tham gia trận này không?</p>
        <div class="flex gap-2 flex-wrap">
          <button class="vote-btn yes" onclick="submitVote('${match.match_id}', 'YES')">
            ✅ Tham gia
          </button>
          <button class="vote-btn no" onclick="submitVote('${match.match_id}', 'NO')">
            ❌ Không tham gia
          </button>
        </div>
      </div>

      <div class="mt-4 pt-4 border-t border-gray-700 flex items-center justify-between">
        <div id="vote-summary-${match.match_id}" class="text-gray-400 text-sm">
          <span class="animate-spin inline-block">⏳</span> Đang tải...
        </div>
        <a href="#matches" onclick="navigateTo('matches')" class="text-green-400 text-sm hover:underline">
          Xem chi tiết →
        </a>
      </div>
    </div>
  `;
}

function renderUpcomingMatchRow(match) {
  return `
    <div class="card py-3 px-4 flex items-center justify-between cursor-pointer hover:border-green-600"
      onclick="navigateTo('matches')">
      <div class="flex items-center gap-3">
        <div class="text-center">
          <div class="text-green-400 font-bold text-sm">${formatDateShort(match.match_date)}</div>
          <div class="text-gray-500 text-xs">${formatTime(match.start_time)}</div>
        </div>
        <div>
          <p class="text-white font-medium text-sm">${match.venue_name}</p>
          <p class="text-gray-500 text-xs">${match.match_format || '5v5'}</p>
        </div>
      </div>
      ${matchStatusBadge(match.status)}
    </div>`;
}

async function loadVoteForMatch(matchId, userId) {
  try {
    const [voteRes, attRes] = await Promise.all([
      API.getMyVote(matchId),
      API.getAttendance(matchId)
    ]);

    // Update vote buttons
    if (voteRes.success && voteRes.vote) {
      const currentVote = voteRes.vote.vote_status;
      document.querySelectorAll(`#vote-section-${matchId} .vote-btn`).forEach(btn => {
        const btnVote = btn.classList.contains('yes') ? 'YES' : 'NO';
        btn.classList.toggle('active', btnVote === currentVote);
      });
    }

    // Update summary
    if (attRes.success) {
      const s = attRes.summary;
      const summaryEl = document.getElementById(`vote-summary-${matchId}`);
      if (summaryEl) {
        summaryEl.innerHTML = `
          <span class="text-green-400">✅ ${s.yes}</span>
          <span class="mx-1">·</span>
          <span class="text-red-400">❌ ${s.no}</span>
          <span class="text-gray-500 ml-1">người vote</span>
        `;
      }
    }
  } catch (e) { /* silent */ }
}

async function submitVote(matchId, voteStatus) {
  const btns = document.querySelectorAll(`#vote-section-${matchId} .vote-btn`);

  // Lưu lại trạng thái cũ để rollback nếu lỗi
  const prevActive = document.querySelector(`#vote-section-${matchId} .vote-btn.active`);
  const prevVote = prevActive?.classList.contains('yes') ? 'YES' : (prevActive ? 'NO' : null);

  // --- Optimistic UI: cập nhật ngay lập tức, không chờ API ---
  btns.forEach(btn => {
    const btnVote = btn.classList.contains('yes') ? 'YES' : 'NO';
    btn.classList.toggle('active', btnVote === voteStatus);
    btn.disabled = true; // Tránh double-click trong lúc gọi API
  });

  try {
    const res = await API.vote(matchId, voteStatus);
    if (res.success) {
      showToast(res.message || 'Đã vote!', 'success');
      // Refresh summary số người vote (non-blocking, không ảnh hưởng button)
      loadVoteForMatch(matchId, getStoredUser().user_id);
    } else {
      // Rollback về trạng thái cũ
      _rollbackVoteBtns(btns, prevVote);
      showToast(res.error || 'Vote thất bại', 'error');
    }
  } catch (e) {
    // Rollback về trạng thái cũ
    _rollbackVoteBtns(btns, prevVote);
    showToast('Lỗi kết nối', 'error');
  } finally {
    btns.forEach(btn => { btn.disabled = false; });
  }
}

function _rollbackVoteBtns(btns, prevVote) {
  btns.forEach(btn => {
    const btnVote = btn.classList.contains('yes') ? 'YES' : 'NO';
    btn.classList.toggle('active', prevVote !== null && btnVote === prevVote);
  });
}
