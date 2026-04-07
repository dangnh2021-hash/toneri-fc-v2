// ============================================================
// leaderboard.js - Bảng xếp hạng cầu thủ
// ============================================================

async function renderLeaderboard(container) {
  showLoading(true);
  let leaderboard = [];
  try {
    const res = await API.getLeaderboard();
    if (res.success) leaderboard = res.leaderboard || [];
  } catch (e) {
    showToast('Lỗi tải dữ liệu', 'error');
  } finally {
    showLoading(false);
  }

  const user = getStoredUser();
  const myRank = leaderboard.findIndex(p => p.user_id === user.user_id) + 1;

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-white">🏆 Bảng xếp hạng</h1>
        ${myRank > 0 ? `<span class="badge badge-yes">Bạn: #${myRank}</span>` : ''}
      </div>

      <!-- Sort tabs -->
      <div class="flex gap-2 overflow-x-auto pb-1">
        <button onclick="sortLeaderboard('rating_points', ${JSON.stringify(leaderboard).replace(/"/g, '&quot;')})"
          class="btn btn-primary btn-sm whitespace-nowrap" id="sort-elo">🎖️ ELO</button>
        <button onclick="sortLeaderboard('overall_rating', ${JSON.stringify(leaderboard).replace(/"/g, '&quot;')})"
          class="btn btn-secondary btn-sm whitespace-nowrap" id="sort-ovr">⭐ OVR</button>
        <button onclick="sortLeaderboard('total_goals', ${JSON.stringify(leaderboard).replace(/"/g, '&quot;')})"
          class="btn btn-secondary btn-sm whitespace-nowrap" id="sort-goals">⚽ Bàn thắng</button>
        <button onclick="sortLeaderboard('total_wins', ${JSON.stringify(leaderboard).replace(/"/g, '&quot;')})"
          class="btn btn-secondary btn-sm whitespace-nowrap" id="sort-wins">🏅 Thắng</button>
      </div>

      <!-- Top 3 podium -->
      ${leaderboard.length >= 3 ? renderPodium(leaderboard.slice(0, 3), user.user_id) : ''}

      <!-- Full leaderboard table -->
      <div class="card p-0 overflow-hidden">
        <div class="table-responsive" id="leaderboard-table">
          ${renderLeaderboardTable(leaderboard, user.user_id)}
        </div>
      </div>
    </div>
  `;
}

function renderPodium(top3, currentUserId) {
  const order = [top3[1], top3[0], top3[2]]; // 2nd, 1st, 3rd
  const heights = ['h-20', 'h-28', 'h-16'];
  const rankLabels = ['🥈 #2', '🥇 #1', '🥉 #3'];
  const rankColors = ['text-gray-300', 'text-amber-400', 'text-amber-600'];

  return `
    <div class="card">
      <h3 class="text-center text-gray-400 text-sm mb-4 font-medium">TOP 3 ELO RATING</h3>
      <div class="flex items-end justify-center gap-2 mb-2">
        ${order.map((p, i) => p ? `
          <div class="flex flex-col items-center w-24">
            <div class="w-14 h-14 rounded-full bg-gray-700 flex items-center justify-center text-xl font-bold ${p.user_id === currentUserId ? 'ring-2 ring-green-400' : ''} mb-2">
              ${(p.full_name || '?')[0]}
            </div>
            <div class="text-white font-semibold text-sm text-center truncate w-full text-center">${p.full_name?.split(' ').pop() || p.full_name}</div>
            <div class="text-xs ${rankColors[i]} font-bold">${rankLabels[i]}</div>
            <div class="${heights[i]} w-full rounded-t-lg mt-2 flex items-center justify-center font-bold text-white"
              style="background: ${i === 1 ? '#92400e' : i === 0 ? '#374151' : '#431407'}">
              ${p.rating_points}
            </div>
          </div>
        ` : '').join('')}
      </div>
    </div>
  `;
}

function renderLeaderboardTable(players, currentUserId) {
  if (players.length === 0) return emptyState('👥', 'Chưa có dữ liệu', 'Chờ sau trận đấu đầu tiên!');

  return `
    <table>
      <thead><tr>
        <th class="w-10">#</th>
        <th>Cầu thủ</th>
        <th class="hidden sm:table-cell">Vị trí</th>
        <th>OVR</th>
        <th>ELO</th>
        <th class="hidden md:table-cell">Trận</th>
        <th class="hidden md:table-cell">T/B/H</th>
        <th class="hidden lg:table-cell">Bàn</th>
        <th class="hidden lg:table-cell">Kiến tạo</th>
        <th class="hidden sm:table-cell">Thắng%</th>
      </tr></thead>
      <tbody>
        ${players.map((p, i) => {
          const isMe = p.user_id === currentUserId;
          const rankIcon = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
          return `
            <tr class="${isMe ? 'bg-green-900/20' : ''}">
              <td class="font-bold ${i < 3 ? ['rank-1','rank-2','rank-3'][i] : 'text-gray-400'} text-center">${rankIcon}</td>
              <td>
                <div class="flex items-center gap-2">
                  <div class="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style="background: ${isMe ? '#166534' : '#374151'}; color: ${isMe ? '#4ade80' : '#fff'}">
                    ${(p.full_name || '?')[0]}
                  </div>
                  <div>
                    <div class="text-white font-medium text-sm">${p.full_name}
                      ${isMe ? '<span class="badge badge-yes ml-1">Bạn</span>' : ''}
                    </div>
                  </div>
                </div>
              </td>
              <td class="hidden sm:table-cell">${positionBadge(p.positions)}</td>
              <td>
                <span class="font-bold text-base" style="color:${overallColor(p.overall_rating)}">${p.overall_rating}</span>
              </td>
              <td class="font-bold text-amber-400">${p.rating_points}</td>
              <td class="hidden md:table-cell text-gray-300">${p.total_matches || 0}</td>
              <td class="hidden md:table-cell">
                <span class="text-green-400">${p.total_wins || 0}</span>/
                <span class="text-gray-400">${p.total_draws || 0}</span>/
                <span class="text-red-400">${p.total_losses || 0}</span>
              </td>
              <td class="hidden lg:table-cell text-orange-400 font-medium">${p.total_goals || 0}</td>
              <td class="hidden lg:table-cell text-blue-400">${p.total_assists || 0}</td>
              <td class="hidden sm:table-cell">
                <div class="flex items-center gap-2">
                  <div class="stat-bar w-16">
                    <div class="stat-bar-fill" style="width:${p.win_rate || 0}%"></div>
                  </div>
                  <span class="text-gray-300 text-xs">${p.win_rate || 0}%</span>
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function sortLeaderboard(field, data) {
  const sorted = [...data].sort((a, b) => (b[field] || 0) - (a[field] || 0));
  const user = getStoredUser();
  document.getElementById('leaderboard-table').innerHTML = renderLeaderboardTable(sorted, user.user_id);

  // Update button states
  ['elo', 'ovr', 'goals', 'wins'].forEach(id => {
    document.getElementById(`sort-${id}`)?.classList.replace('btn-primary', 'btn-secondary');
  });
  const fieldMap = { rating_points: 'elo', overall_rating: 'ovr', total_goals: 'goals', total_wins: 'wins' };
  document.getElementById(`sort-${fieldMap[field]}`)?.classList.replace('btn-secondary', 'btn-primary');
}
