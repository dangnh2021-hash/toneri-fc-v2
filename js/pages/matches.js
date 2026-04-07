// ============================================================
// matches.js - Danh sách lịch thi đấu + chi tiết trận
// ============================================================

async function renderMatches(container) {
  showLoading(true);
  let matches = [];
  try {
    const res = await API.getMatches();
    if (res.success) matches = res.matches || [];
  } catch (e) {
    showToast('Lỗi tải dữ liệu', 'error');
  } finally {
    showLoading(false);
  }

  const user = getStoredUser();
  // Upcoming: gần nhất lên đầu (tăng dần theo ngày)
  const upcoming = matches
    .filter(m => m.status !== 'completed' && m.status !== 'cancelled')
    .sort((a, b) => new Date(a.match_date) - new Date(b.match_date));
  // Past: mới nhất lên đầu (giảm dần)
  const past = matches
    .filter(m => m.status === 'completed' || m.status === 'cancelled')
    .sort((a, b) => new Date(b.match_date) - new Date(a.match_date));

  container.innerHTML = `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-white">Lịch thi đấu</h1>
        ${user.is_admin ? `<button onclick="openCreateMatchModal()" class="btn btn-primary btn-sm"><i class="fas fa-plus mr-1"></i> Thêm trận</button>` : ''}
      </div>

      <!-- Upcoming -->
      <div>
        <h2 class="section-heading"><i class="fas fa-calendar text-green-400"></i> Sắp diễn ra (${upcoming.length})</h2>
        ${upcoming.length > 0
          ? `<div class="space-y-4">${upcoming.map(m => renderMatchCard(m, user)).join('')}</div>`
          : `<div class="card">${emptyState('📅', 'Chưa có trận sắp tới')}</div>`
        }
      </div>

      <!-- Past -->
      ${past.length > 0 ? `
        <div>
          <h2 class="section-heading"><i class="fas fa-history text-gray-400"></i> Đã diễn ra (${past.length})</h2>
          <div class="space-y-3">${past.map(m => renderMatchCard(m, user, true)).join('')}</div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderMatchCard(match, user, isPast = false) {
  const matchDate = formatDate(match.match_date);
  const startTime = formatTime(match.start_time);
  const endTime = match.end_time ? ` - ${formatTime(match.end_time)}` : '';

  return `
    <div class="match-card ${isPast ? 'opacity-70' : ''}">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2 flex-wrap">
            ${matchStatusBadge(match.status)}
            <span class="text-gray-400 text-xs">${match.match_format || '5v5'} · ${match.num_teams || 2} đội</span>
          </div>
          <h3 class="text-white font-bold text-base">${match.venue_name}</h3>
          ${match.venue_address ? `<p class="text-gray-400 text-xs mt-0.5"><i class="fas fa-map-marker-alt mr-1"></i>${match.venue_address}</p>` : ''}
          ${match.notes ? `<p class="text-gray-500 text-xs mt-1 italic">${match.notes}</p>` : ''}
        </div>
        <div class="text-right ml-4 flex-shrink-0">
          <div class="text-white font-semibold text-sm">${matchDate}</div>
          <div class="text-green-400 font-bold">${startTime}${endTime}</div>
        </div>
      </div>

      <div class="flex items-center gap-2 mt-4 flex-wrap">
        <button onclick="openMatchDetail('${match.match_id}')" class="btn btn-secondary btn-sm">
          <i class="fas fa-eye"></i> Chi tiết
        </button>
        ${!isPast ? `
          <button onclick="openVoteModal('${match.match_id}')" class="btn btn-primary btn-sm">
            <i class="fas fa-check-circle"></i> Vote tham gia
          </button>
        ` : ''}
        <button onclick="openFormation('${match.match_id}')" class="btn btn-secondary btn-sm">
          <i class="fas fa-users"></i> ${user.is_admin && !isPast ? 'Xếp đội' : 'Xem đội hình'}
        </button>
        ${user.is_admin && !isPast ? `
          <button onclick="openEditMatch('${match.match_id}', ${JSON.stringify(match).replace(/"/g, '&quot;')})" class="btn btn-secondary btn-sm">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="confirmDeleteMatch('${match.match_id}')" class="btn btn-danger btn-sm">
            <i class="fas fa-trash"></i>
          </button>
        ` : ''}
      </div>
    </div>
  `;
}

// ---- Match Detail Modal ----

async function openMatchDetail(matchId) {
  showLoading(true);
  try {
    const res = await API.getMatchDetail(matchId);
    if (!res.success) { showToast(res.error, 'error'); return; }

    const { match, attendance, teams, guestTeams, results } = res;
    const user = getStoredUser();

    const myVote = attendance.find(a => a.user_id === user.user_id);
    const yesPlayers = attendance.filter(a => a.vote_status === 'YES');
    const noPlayers = attendance.filter(a => a.vote_status === 'NO');

    openModal(`
      <div class="p-6 space-y-5">
        <!-- Header -->
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-white font-bold text-lg">${match.venue_name}</h3>
            <p class="text-gray-400 text-sm">${match.venue_address || ''}</p>
          </div>
          <button onclick="closeModal()" class="text-gray-400 hover:text-white text-xl"><i class="fas fa-times"></i></button>
        </div>

        <!-- Info -->
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-gray-700 rounded-xl p-3 text-center">
            <div class="text-green-400 font-bold">${formatDate(match.match_date)}</div>
            <div class="text-gray-400 text-xs">Ngày thi đấu</div>
          </div>
          <div class="bg-gray-700 rounded-xl p-3 text-center">
            <div class="text-white font-bold">${formatTime(match.start_time)}${match.end_time ? ` - ${formatTime(match.end_time)}` : ''}</div>
            <div class="text-gray-400 text-xs">Giờ thi đấu</div>
          </div>
          <div class="bg-gray-700 rounded-xl p-3 text-center">
            <div class="text-blue-400 font-bold">${match.match_format || '5v5'}</div>
            <div class="text-gray-400 text-xs">Format</div>
          </div>
          <div class="bg-gray-700 rounded-xl p-3 text-center">
            <div class="text-amber-400 font-bold">${match.num_teams || 2} đội</div>
            <div class="text-gray-400 text-xs">Số đội</div>
          </div>
        </div>

        <!-- My Vote -->
        <div>
          <p class="text-gray-300 text-sm font-medium mb-2">Trạng thái của bạn:
            ${myVote ? `<span class="badge ${myVote.vote_status === 'YES' ? 'badge-yes' : 'badge-no'}">${myVote.vote_status === 'YES' ? '✅ Tham gia' : '❌ Không tham gia'}</span>` : '<span class="text-gray-500">Chưa xác nhận</span>'}
          </p>
          ${match.status === 'scheduled' ? `
            <div class="flex gap-2">
              <button class="vote-btn yes ${myVote?.vote_status === 'YES' ? 'active' : ''}" onclick="submitVoteFromModal('${matchId}', 'YES')">✅ Tham gia</button>
              <button class="vote-btn no ${myVote?.vote_status === 'NO' ? 'active' : ''}" onclick="submitVoteFromModal('${matchId}', 'NO')">❌ Không tham gia</button>
            </div>
          ` : ''}
        </div>

        <!-- Attendance Summary -->
        <div>
          <p class="text-gray-400 text-sm mb-3">
            <span class="text-green-400 font-semibold">✅ ${yesPlayers.length} tham gia</span>
            · <span class="text-red-400">❌ ${noPlayers.length} không tham gia</span>
          </p>
          ${yesPlayers.length > 0 ? `
            <div class="flex flex-wrap gap-2">
              ${yesPlayers.map(p => `
                <div class="flex items-center gap-1.5 bg-gray-700 rounded-lg px-3 py-1.5">
                  <div class="w-6 h-6 bg-green-700 rounded-full flex items-center justify-center text-xs font-bold">${(p.full_name || p.user_id || '?')[0]}</div>
                  <span class="text-white text-sm">${p.full_name || p.user_id || 'Unknown'}</span>
                  ${positionBadge(p.positions)}
                </div>
              `).join('')}
            </div>
          ` : '<p class="text-gray-600 text-sm">Chưa ai vote tham gia</p>'}
        </div>

        <!-- Teams if exists -->
        ${teams.length > 0 ? `
          <div>
            <p class="text-gray-400 text-sm font-medium mb-2">Đội hình đã xếp:</p>
            <div class="flex gap-2 flex-wrap">
              ${teams.map(t => `
                <div class="flex items-center gap-2 bg-gray-700 rounded-lg px-3 py-2">
                  <div class="w-3 h-3 rounded-full" style="background:${t.team_color}"></div>
                  <span class="text-white text-sm font-medium">${t.team_name}</span>
                </div>
              `).join('')}
            </div>
            <button onclick="closeModal(); openFormation('${matchId}')" class="btn btn-secondary btn-sm mt-3">
              <i class="fas fa-eye mr-1"></i> Xem đội hình
            </button>
          </div>
        ` : ''}

        <!-- Results -->
        ${results.length > 0 ? `
          <div>
            <p class="text-gray-400 text-sm font-medium mb-2">Kết quả:</p>
            <div class="space-y-2">
              ${results.filter(r => r.status === 'completed').map(r => {
                const homeTeam = teams.find(t => t.team_id === r.team_home_id);
                const awayTeam = teams.find(t => t.team_id === r.team_away_id);
                return `
                  <div class="bg-gray-700 rounded-lg p-3 flex items-center justify-between">
                    <span class="text-white text-sm font-medium">${homeTeam?.team_name || 'Team A'}</span>
                    <span class="text-white font-bold text-lg mx-3">${r.score_home} - ${r.score_away}</span>
                    <span class="text-white text-sm font-medium">${awayTeam?.team_name || 'Team B'}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Guest teams -->
        ${guestTeams.length > 0 ? `
          <div>
            <p class="text-gray-400 text-sm font-medium mb-2">Đội khách:</p>
            ${guestTeams.map(g => `
              <div class="bg-gray-700 rounded-lg px-3 py-2 text-sm text-white flex items-center gap-2">
                <i class="fas fa-shield-alt text-gray-400"></i>
                ${g.team_name} - Đại diện: ${g.representative_name || '-'}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `);
  } catch (e) {
    showToast('Lỗi', 'error');
  } finally {
    showLoading(false);
  }
}

async function submitVoteFromModal(matchId, voteStatus) {
  const modalVoteBtns = document.querySelectorAll('.vote-btn');

  // Lưu trạng thái cũ để rollback
  const prevActive = document.querySelector('.vote-btn.active');
  const prevVote = prevActive?.classList.contains('yes') ? 'YES' : (prevActive ? 'NO' : null);

  // --- Optimistic UI: cập nhật badge "Trạng thái của bạn" và button ngay ---
  modalVoteBtns.forEach(btn => {
    const btnVote = btn.classList.contains('yes') ? 'YES' : 'NO';
    btn.classList.toggle('active', btnVote === voteStatus);
    btn.disabled = true;
  });

  try {
    const res = await API.vote(matchId, voteStatus);
    if (res.success) {
      showToast(res.message || 'Đã vote!', 'success');
      // Reload toàn bộ modal để cập nhật danh sách người tham gia (attendance list thay đổi)
      await openMatchDetail(matchId);
    } else {
      // Rollback button states
      modalVoteBtns.forEach(btn => {
        const btnVote = btn.classList.contains('yes') ? 'YES' : 'NO';
        btn.classList.toggle('active', prevVote !== null && btnVote === prevVote);
        btn.disabled = false;
      });
      showToast(res.error || 'Vote thất bại', 'error');
    }
  } catch (e) {
    modalVoteBtns.forEach(btn => { btn.disabled = false; });
    showToast('Lỗi kết nối', 'error');
  }
}

async function openVoteModal(matchId) {
  await openMatchDetail(matchId);
}

function openFormation(matchId) {
  closeModal();
  window._formationMatchId = matchId;
  navigateTo('formation', { match_id: matchId });
}

// ---- Create Match Modal ----

function openCreateMatchModal() {
  openModal(`
    <div class="p-6">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-white font-bold text-lg">Tạo lịch thi đấu</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
      </div>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="form-group mb-0">
            <label class="form-label">Ngày thi đấu *</label>
            <input type="date" id="new-match-date" class="form-input" />
          </div>
          <div class="form-group mb-0">
            <label class="form-label">Hạn vote</label>
            <input type="date" id="new-match-deadline" class="form-input" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="form-group mb-0">
            <label class="form-label">Giờ bắt đầu *</label>
            <input type="time" id="new-match-start" class="form-input" value="18:00" />
          </div>
          <div class="form-group mb-0">
            <label class="form-label">Giờ kết thúc</label>
            <input type="time" id="new-match-end" class="form-input" value="20:00" />
          </div>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Tên sân *</label>
          <input type="text" id="new-match-venue" placeholder="Sân ABC" class="form-input" />
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Địa chỉ</label>
          <input type="text" id="new-match-address" placeholder="123 Đường XYZ, Q.1" class="form-input" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="form-group mb-0">
            <label class="form-label">Format</label>
            <select id="new-match-format" class="form-select">
              <option value="5">5 người/đội</option>
              <option value="6">6 người/đội</option>
              <option value="7">7 người/đội</option>
            </select>
          </div>
          <div class="form-group mb-0">
            <label class="form-label">Số đội</label>
            <select id="new-match-teams" class="form-select">
              <option value="2">2 đội</option>
              <option value="3">3 đội</option>
              <option value="4">4 đội</option>
            </select>
          </div>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Ghi chú</label>
          <textarea id="new-match-notes" class="form-input" placeholder="Ghi chú thêm..."></textarea>
        </div>
        <button onclick="submitCreateMatch()" class="btn btn-primary w-full justify-center">
          <i class="fas fa-plus mr-2"></i> Tạo lịch thi đấu
        </button>
      </div>
    </div>
  `);
}

async function submitCreateMatch() {
  const matchDate = document.getElementById('new-match-date').value;
  const startTime = document.getElementById('new-match-start').value;
  const endTime = document.getElementById('new-match-end').value;
  const venueName = document.getElementById('new-match-venue').value.trim();
  const venueAddress = document.getElementById('new-match-address').value.trim();
  const numPPT = document.getElementById('new-match-format').value;
  const numTeams = document.getElementById('new-match-teams').value;
  const notes = document.getElementById('new-match-notes').value.trim();
  const deadline = document.getElementById('new-match-deadline').value;

  if (!matchDate || !startTime || !venueName) {
    showToast('Vui lòng điền ngày, giờ và tên sân', 'warning'); return;
  }

  showLoading(true);
  try {
    const res = await API.createMatch({
      match_date: matchDate, start_time: startTime, end_time: endTime,
      venue_name: venueName, venue_address: venueAddress,
      num_players_per_team: numPPT, num_teams: numTeams,
      notes, voting_deadline: deadline
    });
    if (res.success) {
      closeModal();
      showToast('Tạo lịch thi đấu thành công!', 'success');
      renderMatches(document.getElementById('page-content'));
    } else {
      showToast(res.error, 'error');
    }
  } catch (e) { showToast('Lỗi kết nối', 'error'); }
  finally { showLoading(false); }
}

function openEditMatch(matchId, match) {
  openModal(`
    <div class="p-6 overflow-y-auto max-h-[85vh]">
      <div class="flex items-center justify-between mb-5">
        <h3 class="text-white font-bold text-lg">Chỉnh sửa trận đấu</h3>
        <button onclick="closeModal()" class="text-gray-400 hover:text-white"><i class="fas fa-times"></i></button>
      </div>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="form-group mb-0">
            <label class="form-label">Ngày thi đấu *</label>
            <input type="date" id="edit-match-date" class="form-input" value="${match.match_date || ''}">
          </div>
          <div class="form-group mb-0">
            <label class="form-label">Trạng thái</label>
            <select id="edit-match-status" class="form-select">
              <option value="scheduled" ${match.status === 'scheduled' ? 'selected' : ''}>Sắp diễn ra</option>
              <option value="ongoing" ${match.status === 'ongoing' ? 'selected' : ''}>Đang diễn ra</option>
              <option value="completed" ${match.status === 'completed' ? 'selected' : ''}>Đã kết thúc</option>
              <option value="cancelled" ${match.status === 'cancelled' ? 'selected' : ''}>Đã hủy</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="form-group mb-0">
            <label class="form-label">Giờ bắt đầu *</label>
            <input type="time" id="edit-match-start" class="form-input" value="${match.start_time || ''}">
          </div>
          <div class="form-group mb-0">
            <label class="form-label">Giờ kết thúc</label>
            <input type="time" id="edit-match-end" class="form-input" value="${match.end_time || ''}">
          </div>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Sân thi đấu *</label>
          <input type="text" id="edit-match-venue" class="form-input" value="${match.venue_name || ''}" placeholder="Tên sân">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Địa chỉ</label>
          <input type="text" id="edit-match-address" class="form-input" value="${match.venue_address || ''}" placeholder="Địa chỉ sân">
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="form-group mb-0">
            <label class="form-label">Số người/đội</label>
            <input type="number" id="edit-match-ppt" class="form-input" value="${match.num_players_per_team || 5}" min="3" max="11">
          </div>
          <div class="form-group mb-0">
            <label class="form-label">Số đội</label>
            <input type="number" id="edit-match-teams" class="form-input" value="${match.num_teams || 2}" min="2" max="6">
          </div>
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Deadline vote</label>
          <input type="datetime-local" id="edit-match-deadline" class="form-input" value="${match.voting_deadline ? match.voting_deadline.replace(' ', 'T').substring(0, 16) : ''}">
        </div>
        <div class="form-group mb-0">
          <label class="form-label">Ghi chú</label>
          <textarea id="edit-match-notes" class="form-input" rows="2">${match.notes || ''}</textarea>
        </div>
        <button onclick="submitEditMatch('${matchId}')" class="btn btn-primary w-full justify-center">
          Lưu thay đổi
        </button>
      </div>
    </div>
  `);
}

async function submitEditMatch(matchId) {
  const numPPT = Number(document.getElementById('edit-match-ppt').value) || 5;
  const numTeams = Number(document.getElementById('edit-match-teams').value) || 2;
  const updates = {
    match_date: document.getElementById('edit-match-date').value,
    start_time: document.getElementById('edit-match-start').value,
    end_time: document.getElementById('edit-match-end').value,
    venue_name: document.getElementById('edit-match-venue').value.trim(),
    venue_address: document.getElementById('edit-match-address').value.trim(),
    num_players_per_team: numPPT,
    num_teams: numTeams,
    match_format: `${numPPT}v${numPPT}`,
    voting_deadline: document.getElementById('edit-match-deadline').value,
    status: document.getElementById('edit-match-status').value,
    notes: document.getElementById('edit-match-notes').value.trim()
  };
  showLoading(true);
  try {
    const res = await API.updateMatch(matchId, updates);
    if (res.success) {
      closeModal();
      showToast('Đã cập nhật trận đấu', 'success');
      renderMatches(document.getElementById('page-content'));
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}

function confirmDeleteMatch(matchId) {
  closeModal();
  openModal(`
    <div class="p-6 text-center">
      <div class="text-4xl mb-4">🗑️</div>
      <h3 class="text-white font-semibold text-lg mb-2">Xóa trận đấu?</h3>
      <p class="text-gray-400 mb-6">Hành động này không thể hoàn tác.</p>
      <div class="flex gap-3 justify-center">
        <button onclick="closeModal()" class="btn btn-secondary">Hủy</button>
        <button onclick="submitDeleteMatch('${matchId}')" class="btn btn-danger">Xóa</button>
      </div>
    </div>
  `);
}

async function submitDeleteMatch(matchId) {
  closeModal();
  showLoading(true);
  try {
    const res = await API.deleteMatch(matchId);
    if (res.success) {
      showToast('Đã xóa trận đấu', 'success');
      renderMatches(document.getElementById('page-content'));
    } else { showToast(res.error, 'error'); }
  } catch (e) { showToast('Lỗi', 'error'); }
  finally { showLoading(false); }
}
