// ============================================================
// api/index.js - Vercel Serverless Function
// Port đầy đủ từ Google Apps Script sang Node.js + Supabase
// ============================================================

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Supabase service client (bypasses RLS — chỉ dùng server-side)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ============================================================
// UTILS
// ============================================================

const ok  = (data) => ({ success: true, ...data });
const err = (msg)  => ({ success: false, error: msg });

function genId(prefix) {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `${prefix}_${ts}${rand}`;
}

const nowISO = () => new Date().toISOString();
const clamp  = (val, min = 1, max = 99) => Math.min(max, Math.max(min, Number(val) || min));

function calcOverall(stats, positions) {
  const posArr = String(positions || '').split(',').map(p => p.trim().toUpperCase()).filter(Boolean);
  const pac = Number(stats.pace)        || 50;
  const sho = Number(stats.shooting)    || 50;
  const pas = Number(stats.passing)     || 50;
  const dri = Number(stats.dribbling)   || 50;
  const def = Number(stats.defending)   || 50;
  const phy = Number(stats.physical)    || 50;
  const gkDiv = Number(stats.gk_diving)   || 50;
  const gkHan = Number(stats.gk_handling) || 50;
  const gkRef = Number(stats.gk_reflexes) || 50;

  const formulas = {
    FW: sho * 0.30 + dri * 0.25 + pac * 0.20 + pas * 0.15 + phy * 0.10,
    MF: pas * 0.30 + dri * 0.20 + phy * 0.15 + pac * 0.15 + sho * 0.10 + def * 0.10,
    DF: def * 0.35 + phy * 0.25 + pas * 0.15 + pac * 0.15 + dri * 0.10,
    GK: gkRef * 0.35 + gkDiv * 0.30 + gkHan * 0.25 + pac * 0.10,
  };

  let best = 0;
  posArr.forEach(pos => { if (formulas[pos] > best) best = formulas[pos]; });
  if (!best) best = (pac + sho + pas + dri + def + phy) / 6;
  return Math.round(best);
}

function buildChangeDescription(type, points) {
  const sign = points >= 0 ? '+' : '';
  const map = {
    match_win:        `Thắng trận (${sign}${points})`,
    match_loss:       `Thua trận (${sign}${points})`,
    match_draw:       `Hòa (${sign}${points})`,
    goal_assist_bonus:`Bàn thắng/Kiến tạo (+${points})`,
    clean_sheet:      `Không thủng lưới (+${points})`,
    mvp:              `Cầu thủ xuất sắc (+${points})`,
    admin_adjust:     `Admin điều chỉnh (${sign}${points})`,
  };
  return map[type] || `${type} (${sign}${points})`;
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

async function validateToken(token) {
  if (!token) return null;
  const { data } = await supabase
    .from('users')
    .select('user_id, username, full_name, is_admin, positions, status')
    .eq('session_token', token)
    .gt('token_expiry', nowISO())
    .eq('status', 'active')
    .maybeSingle();
  return data || null;
}

async function requireAuth(data) {
  const user = await validateToken(data.token);
  if (!user) throw new Error('Unauthorized: Token không hợp lệ hoặc đã hết hạn');
  return user;
}

async function requireAdmin(data) {
  const user = await requireAuth(data);
  if (!user.is_admin) throw new Error('Forbidden: Chỉ admin mới có quyền thực hiện');
  return user;
}

// ============================================================
// AUTH FUNCTIONS
// ============================================================

async function login({ username, password_hash }) {
  if (!username || !password_hash) return err('Thiếu username hoặc password');

  const { data: user } = await supabase
    .from('users').select('*')
    .eq('username', username).eq('password_hash', password_hash)
    .maybeSingle();

  if (!user) return err('Sai username hoặc password');
  if (user.status === 'inactive') return err('Tài khoản đã bị vô hiệu hóa');

  const token  = crypto.randomBytes(32).toString('hex');
  const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from('users').update({
    session_token: token, token_expiry: expiry, last_login: nowISO()
  }).eq('user_id', user.user_id);

  const { password_hash: _ph, session_token: _st, token_expiry: _te, ...safeUser } = user;
  return ok({ token, user: safeUser });
}

async function register({ username, password_hash, full_name, email, phone, positions, stats }) {
  if (!username || !password_hash || !full_name) return err('Thiếu thông tin bắt buộc');
  if (!positions || positions.length === 0) return err('Phải chọn ít nhất 1 vị trí');

  const { data: existing } = await supabase
    .from('users').select('user_id').eq('username', username).maybeSingle();
  if (existing) return err('Username đã tồn tại');

  const s      = stats || {};
  const posStr = Array.isArray(positions) ? positions.join(',') : positions;
  const userStats = {
    pace:        clamp(s.pace),
    shooting:    clamp(s.shooting),
    passing:     clamp(s.passing),
    dribbling:   clamp(s.dribbling),
    defending:   clamp(s.defending),
    physical:    clamp(s.physical),
    gk_diving:   clamp(s.gk_diving),
    gk_handling: clamp(s.gk_handling),
    gk_reflexes: clamp(s.gk_reflexes),
  };

  await supabase.from('users').insert({
    user_id: genId('USR'), username, password_hash, full_name,
    email: email || '', phone: phone || '', positions: posStr,
    ...userStats, overall_rating: calcOverall(userStats, posStr),
    rating_points: 1000, status: 'active', created_at: nowISO(),
  });

  return ok({ message: 'Đăng ký thành công! Hãy đăng nhập.' });
}

async function logout(data) {
  if (data.token) {
    await supabase.from('users')
      .update({ session_token: null, token_expiry: null })
      .eq('session_token', data.token);
  }
  return ok({ message: 'Đã đăng xuất' });
}

async function getProfile(data) {
  const user = await requireAuth(data);
  const { data: profile } = await supabase
    .from('users').select('*').eq('user_id', user.user_id).single();
  if (!profile) return err('Không tìm thấy user');
  const { password_hash, session_token, token_expiry, ...safe } = profile;
  return ok({ user: safe });
}

async function updateProfile(data) {
  const user = await requireAuth(data);
  const { full_name, email, phone, avatar_url } = data;
  const updates = {};
  if (full_name)   updates.full_name  = full_name;
  if (email)       updates.email      = email;
  if (phone)       updates.phone      = phone;
  if (avatar_url)  updates.avatar_url = avatar_url;
  if (Object.keys(updates).length) {
    await supabase.from('users').update(updates).eq('user_id', user.user_id);
  }
  return ok({ message: 'Cập nhật thành công' });
}

async function updateUserStats(data) {
  const authUser = await requireAuth(data);
  const targetId = data.target_user_id || authUser.user_id;
  if (!authUser.is_admin && targetId !== authUser.user_id)
    return err('Không có quyền chỉnh chỉ số cầu thủ khác');

  const { stats, positions } = data;
  if (!stats) return err('Thiếu dữ liệu chỉ số');

  const statFields = ['pace','shooting','passing','dribbling','defending','physical','gk_diving','gk_handling','gk_reflexes'];
  const updates    = {};
  statFields.forEach(f => { if (stats[f] !== undefined) updates[f] = clamp(stats[f]); });
  if (positions) updates.positions = Array.isArray(positions) ? positions.join(',') : positions;

  const { data: current } = await supabase.from('users').select('*').eq('user_id', targetId).single();
  const merged = { ...current, ...updates };
  updates.overall_rating = calcOverall(merged, merged.positions);

  await supabase.from('users').update(updates).eq('user_id', targetId);
  return ok({ message: 'Cập nhật chỉ số thành công', overall: updates.overall_rating });
}

async function getUsers(data) {
  await requireAuth(data);
  const { data: users } = await supabase.from('users').select('*').order('created_at');
  return ok({ users: (users || []).map(u => {
    const { password_hash, session_token, token_expiry, ...safe } = u;
    return safe;
  })});
}

async function adminUpdateUser(data) {
  await requireAdmin(data);
  const { target_user_id, updates } = data;
  if (!target_user_id || !updates) return err('Thiếu dữ liệu');

  const allowed = ['full_name','email','phone','is_admin','status','positions',
    'pace','shooting','passing','dribbling','defending','physical',
    'gk_diving','gk_handling','gk_reflexes','rating_points'];
  const safeUpdates = {};
  allowed.forEach(f => { if (updates[f] !== undefined) safeUpdates[f] = updates[f]; });

  const statFields = ['pace','shooting','passing','dribbling','defending','physical','gk_diving','gk_handling','gk_reflexes','positions'];
  if (statFields.some(f => safeUpdates[f] !== undefined)) {
    const { data: cur } = await supabase.from('users').select('*').eq('user_id', target_user_id).single();
    if (cur) safeUpdates.overall_rating = calcOverall({ ...cur, ...safeUpdates }, safeUpdates.positions || cur.positions);
  }

  await supabase.from('users').update(safeUpdates).eq('user_id', target_user_id);
  return ok({ message: 'Cập nhật user thành công' });
}

// ============================================================
// MATCHES
// ============================================================

async function createMatch(data) {
  const admin = await requireAdmin(data);
  const { match_date, start_time, end_time, venue_name, venue_address,
          num_players_per_team, num_teams, notes, voting_deadline } = data;
  if (!match_date || !start_time || !venue_name) return err('Thiếu thông tin bắt buộc');

  const numPPT  = Number(num_players_per_team) || 5;
  const numTeams = Number(num_teams) || 2;
  const matchId = genId('MTH');

  await supabase.from('matches').insert({
    match_id: matchId, match_date, start_time, end_time: end_time || '',
    venue_name, venue_address: venue_address || '',
    num_players_per_team: numPPT, num_teams: numTeams,
    match_format: `${numPPT}v${numPPT}`, status: 'scheduled',
    notes: notes || '', created_by: admin.user_id,
    voting_deadline: voting_deadline || null, created_at: nowISO(),
  });
  return ok({ match_id: matchId, message: 'Tạo lịch thi đấu thành công' });
}

async function getMatches(data) {
  await requireAuth(data);
  const { data: matches } = await supabase
    .from('matches').select('*').order('match_date', { ascending: false });
  return ok({ matches: matches || [] });
}

async function getUpcomingMatches(data) {
  await requireAuth(data);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const { data: matches } = await supabase.from('matches').select('*')
    .gte('match_date', today.toISOString().split('T')[0])
    .neq('status', 'cancelled')
    .order('match_date', { ascending: true });
  return ok({ matches: matches || [] });
}

async function updateMatch(data) {
  await requireAdmin(data);
  const { match_id, updates } = data;
  if (!match_id) return err('Thiếu match_id');

  const allowed = ['match_date','start_time','end_time','venue_name','venue_address',
    'num_players_per_team','num_teams','match_format','status','notes','voting_deadline'];
  const safeUpdates = {};
  allowed.forEach(f => { if (updates[f] !== undefined) safeUpdates[f] = updates[f]; });

  await supabase.from('matches').update(safeUpdates).eq('match_id', match_id);
  return ok({ message: 'Cập nhật trận đấu thành công' });
}

async function deleteMatch(data) {
  await requireAdmin(data);
  const { match_id } = data;
  if (!match_id) return err('Thiếu match_id');
  await supabase.from('matches').delete().eq('match_id', match_id);
  return ok({ message: 'Đã xóa trận đấu' });
}

async function getMatchDetail(data) {
  await requireAuth(data);
  const { match_id } = data;
  if (!match_id) return err('Thiếu match_id');

  const [
    { data: match },
    { data: rawAtt },
    { data: users },
    { data: teams },
    { data: guestTeams },
    { data: results },
  ] = await Promise.all([
    supabase.from('matches').select('*').eq('match_id', match_id).maybeSingle(),
    supabase.from('match_attendance').select('*').eq('match_id', match_id),
    supabase.from('users').select('user_id, full_name, positions, overall_rating, rating_points'),
    supabase.from('match_teams').select('*').eq('match_id', match_id),
    supabase.from('guest_teams').select('*').eq('match_id', match_id),
    supabase.from('match_results').select('*').eq('match_id', match_id).order('round_number'),
  ]);

  if (!match) return err('Không tìm thấy trận đấu');
  const userMap = {};
  (users || []).forEach(u => { userMap[u.user_id] = u; });
  const attendance = (rawAtt || []).map(a => ({
    ...a, ...(userMap[a.user_id] || { full_name: 'Ẩn danh', positions: '', overall_rating: 0 }),
  }));
  return ok({ match, attendance, teams: teams || [], guestTeams: guestTeams || [], results: results || [] });
}

// ============================================================
// ATTENDANCE
// ============================================================

async function vote(data) {
  const user = await requireAuth(data);
  const { match_id, vote_status, note } = data;
  if (!match_id || !vote_status) return err('Thiếu thông tin vote');
  if (!['YES', 'NO', 'MAYBE'].includes(vote_status)) return err('Vote không hợp lệ (YES/NO/MAYBE)');

  const { data: existing } = await supabase.from('match_attendance')
    .select('attendance_id').eq('match_id', match_id).eq('user_id', user.user_id).maybeSingle();

  if (existing) {
    await supabase.from('match_attendance')
      .update({ vote_status, note: note || '', updated_at: nowISO() })
      .eq('attendance_id', existing.attendance_id);
    return ok({ message: `Đã cập nhật vote: ${vote_status}` });
  }

  await supabase.from('match_attendance').insert({
    attendance_id: genId('ATT'), match_id, user_id: user.user_id,
    vote_status, note: note || '', voted_at: nowISO(), updated_at: nowISO(),
  });
  return ok({ message: `Đã vote: ${vote_status}` });
}

async function getAttendance(data) {
  await requireAuth(data);
  const { match_id } = data;
  if (!match_id) return err('Thiếu match_id');

  const [{ data: attendance }, { data: users }] = await Promise.all([
    supabase.from('match_attendance').select('*').eq('match_id', match_id),
    supabase.from('users').select('user_id, full_name, positions, overall_rating, rating_points'),
  ]);
  const userMap = {};
  (users || []).forEach(u => { userMap[u.user_id] = u; });
  const enriched = (attendance || []).map(a => ({
    ...a, ...(userMap[a.user_id] || { full_name: 'Ẩn danh', positions: '', overall_rating: 0, rating_points: 1000 }),
  }));
  return ok({
    attendance: enriched,
    summary: {
      yes:   enriched.filter(a => a.vote_status === 'YES').length,
      no:    enriched.filter(a => a.vote_status === 'NO').length,
      maybe: enriched.filter(a => a.vote_status === 'MAYBE').length,
    },
  });
}

async function getMyVote(data) {
  const user = await requireAuth(data);
  const { match_id } = data;
  const { data: att } = await supabase.from('match_attendance')
    .select('*').eq('match_id', match_id).eq('user_id', user.user_id).maybeSingle();
  return ok({ vote: att || null });
}

// ============================================================
// GUEST TEAMS
// ============================================================

async function addGuestTeam(data) {
  await requireAdmin(data);
  const { team_name, representative_name, contact_phone, match_id, notes } = data;
  if (!team_name) return err('Thiếu tên đội');

  const guestId = genId('GST');
  await supabase.from('guest_teams').insert({
    guest_team_id: guestId, team_name,
    representative_name: representative_name || '',
    contact_phone: contact_phone || '',
    match_id: match_id || null, notes: notes || '', created_at: nowISO(),
  });

  let teamId = null;
  if (match_id) {
    const { data: existingTeams } = await supabase
      .from('match_teams').select('team_id').eq('match_id', match_id);
    const GUEST_COLORS = ['#8B5CF6', '#EC4899', '#10B981', '#F97316', '#06B6D4'];
    const color = GUEST_COLORS[(existingTeams || []).length % GUEST_COLORS.length];
    teamId = genId('TMT');
    await supabase.from('match_teams').insert({
      team_id: teamId, match_id, team_name,
      team_color: color, team_type: 'guest',
      guest_team_id: guestId,
      team_order: (existingTeams || []).length,
      created_at: nowISO(),
    });
  }
  return ok({ guest_team_id: guestId, team_id: teamId, message: 'Đã thêm đội khách mời' });
}

async function getGuestTeams(data) {
  await requireAuth(data);
  const { match_id } = data;
  let query = supabase.from('guest_teams').select('*');
  if (match_id) query = query.eq('match_id', match_id);
  const { data: teams } = await query;
  return ok({ guest_teams: teams || [] });
}

async function deleteGuestTeam(data) {
  await requireAdmin(data);
  const { guest_team_id } = data;
  await supabase.from('match_teams').delete().eq('guest_team_id', guest_team_id);
  await supabase.from('guest_teams').delete().eq('guest_team_id', guest_team_id);
  return ok({ message: 'Đã xóa đội khách' });
}

// ============================================================
// TEAM FORMATION
// ============================================================

async function suggestTeams(data) {
  await requireAdmin(data);
  const { match_id } = data;
  if (!match_id) return err('Thiếu match_id');

  const [{ data: match }, { data: attendance }, { data: users }] = await Promise.all([
    supabase.from('matches').select('*').eq('match_id', match_id).single(),
    supabase.from('match_attendance').select('*').eq('match_id', match_id).eq('vote_status', 'YES'),
    supabase.from('users').select('*'),
  ]);

  if (!match) return err('Không tìm thấy trận đấu');
  if (!attendance || attendance.length < 2) return err('Cần ít nhất 2 người vote YES');

  const numTeams = Number(match.num_teams) || 2;
  const numPPT   = Number(match.num_players_per_team) || 5;
  const userMap  = {};
  (users || []).forEach(u => { userMap[u.user_id] = u; });

  let players = attendance.map(a => {
    const u = userMap[a.user_id];
    if (!u) return null;
    const positions = String(u.positions || 'FW').split(',').map(p => p.trim());
    return {
      user_id: u.user_id, full_name: u.full_name,
      positions, primary_position: positions[0] || 'MF',
      overall_rating: Number(u.overall_rating) || 50,
      rating_points:  Number(u.rating_points) || 1000,
    };
  }).filter(Boolean);

  const TEAM_NAMES  = ['Đội Đỏ', 'Đội Xanh', 'Đội Vàng', 'Đội Trắng'];
  const TEAM_COLORS = ['#EF4444', '#3B82F6', '#F59E0B', '#6B7280'];

  const gkPlayers    = players.filter(p => p.positions.includes('GK'));
  const fieldPlayers = players.filter(p => !p.positions.includes('GK') || p.positions.length > 1);
  fieldPlayers.sort((a, b) => b.overall_rating - a.overall_rating);
  gkPlayers.sort((a, b) => b.overall_rating - a.overall_rating);

  const teams = Array.from({ length: numTeams }, (_, i) => ({
    name: TEAM_NAMES[i], color: TEAM_COLORS[i], players: [], totalRating: 0,
  }));

  // Assign GKs first
  gkPlayers.forEach((gk, i) => {
    if (i < numTeams) {
      teams[i].players.push({ ...gk, assigned_position: 'GK' });
      teams[i].totalRating += gk.overall_rating;
    } else {
      fieldPlayers.push(gk);
    }
  });

  // Snake draft for field players
  fieldPlayers.sort((a, b) => b.overall_rating - a.overall_rating);
  fieldPlayers.forEach((player, i) => {
    const round      = Math.floor(i / numTeams);
    const posInRound = i % numTeams;
    const teamIdx    = round % 2 === 0 ? posInRound : (numTeams - 1 - posInRound);
    const assignedPos = player.positions.find(p => p !== 'GK') || player.primary_position;
    teams[teamIdx].players.push({ ...player, assigned_position: assignedPos });
    teams[teamIdx].totalRating += player.overall_rating;
  });

  // Balance swap for 2-team case
  if (numTeams === 2) {
    teams.forEach(t => { t.avgRating = t.players.length > 0 ? t.totalRating / t.players.length : 0; });
    let diff = Math.abs(teams[0].avgRating - teams[1].avgRating);
    let iter = 0;
    while (diff > 5 && iter < 20) {
      let bestSwap = null, bestDiff = diff;
      for (let p1 = 0; p1 < teams[0].players.length; p1++) {
        for (let p2 = 0; p2 < teams[1].players.length; p2++) {
          const a1 = teams[0].players[p1], a2 = teams[1].players[p2];
          const newAvg0 = (teams[0].totalRating - a1.overall_rating + a2.overall_rating) / teams[0].players.length;
          const newAvg1 = (teams[1].totalRating - a2.overall_rating + a1.overall_rating) / teams[1].players.length;
          const newDiff = Math.abs(newAvg0 - newAvg1);
          if (newDiff < bestDiff) { bestDiff = newDiff; bestSwap = { p1, p2 }; }
        }
      }
      if (bestSwap) {
        [teams[0].players[bestSwap.p1], teams[1].players[bestSwap.p2]] =
          [teams[1].players[bestSwap.p2], teams[0].players[bestSwap.p1]];
        teams.forEach(t => {
          t.totalRating = t.players.reduce((s, p) => s + p.overall_rating, 0);
          t.avgRating   = t.totalRating / t.players.length;
        });
        diff = bestDiff;
      } else break;
      iter++;
    }
  }

  teams.forEach(t => {
    t.avgRating  = t.players.length > 0 ? Math.round(t.totalRating / t.players.length) : 0;
    t.playerCount = t.players.length;
  });

  return ok({
    teams, totalPlayers: players.length, numTeams, numPPT,
    balanceScore: numTeams === 2 ? Math.abs(teams[0].avgRating - (teams[1]?.avgRating || 0)) : null,
  });
}

async function saveTeams(data) {
  await requireAdmin(data);
  const { match_id, teams } = data;
  if (!match_id || !teams) return err('Thiếu dữ liệu');

  // Xóa internal teams cũ (giữ guest teams)
  const { data: oldTeams } = await supabase
    .from('match_teams').select('team_id').eq('match_id', match_id).eq('team_type', 'internal');
  if (oldTeams && oldTeams.length > 0) {
    const oldIds = oldTeams.map(t => t.team_id);
    await supabase.from('team_players').delete().in('team_id', oldIds);
    await supabase.from('match_teams').delete().in('team_id', oldIds);
  }

  const savedTeamIds = [];
  for (const team of teams) {
    const teamId = genId('TMT');
    savedTeamIds.push(teamId);
    await supabase.from('match_teams').insert({
      team_id: teamId, match_id,
      team_name:    team.name  || 'Đội',
      team_color:   team.color || '#666666',
      team_type:    team.team_type || 'internal',
      guest_team_id: team.guest_team_id || null,
      formation:    team.formation || null,
      created_at:   nowISO(),
    });

    const playerRows = (team.players || []).map((player, idx) => ({
      id:               genId('TMP'),
      team_id:          teamId,
      match_id,
      user_id:          player.user_id || null,
      guest_player_name: player.guest_player_name || (!player.user_id ? player.full_name || '' : ''),
      position_played:  player.assigned_position || player.position_played || 'MF',
      jersey_number:    idx + 1,
      is_captain:       idx === 0,
      goals_scored:     0,
      assists:          0,
    }));
    if (playerRows.length > 0) await supabase.from('team_players').insert(playerRows);
  }
  return ok({ message: 'Đã lưu đội hình', team_ids: savedTeamIds });
}

async function getTeams(data) {
  await requireAuth(data);
  const { match_id } = data;
  if (!match_id) return err('Thiếu match_id');

  const [{ data: teams }, { data: players }, { data: users }] = await Promise.all([
    supabase.from('match_teams').select('*').eq('match_id', match_id),
    supabase.from('team_players').select('*').eq('match_id', match_id),
    supabase.from('users').select('user_id, full_name, overall_rating, positions, avatar_url'),
  ]);

  const userMap = {};
  (users || []).forEach(u => { userMap[u.user_id] = u; });

  const enrichedTeams = (teams || []).map(team => ({
    ...team,
    players: (players || [])
      .filter(p => p.team_id === team.team_id)
      .map(p => {
        const u = userMap[p.user_id] || {};
        return {
          ...p,
          full_name:      u.full_name     || p.guest_player_name || 'Unknown',
          overall_rating: u.overall_rating || 60,
          positions:      u.positions      || '',
          avatar_url:     u.avatar_url     || '',
        };
      }),
  }));
  return ok({ teams: enrichedTeams });
}

// ============================================================
// MATCH RESULTS
// ============================================================

async function saveMatchResult(data) {
  await requireAdmin(data);
  const { match_id, result_id, round_number, team_home_id, team_away_id,
          score_home, score_away, scorers, status } = data;
  if (!match_id) return err('Thiếu match_id');

  if (result_id) {
    const { data: existing } = await supabase
      .from('match_results').select('*').eq('result_id', result_id).maybeSingle();

    if (existing) {
      if (status === 'update_scorers') {
        await _updateScorers(match_id, scorers || []);
        return ok({ message: 'Đã cập nhật thống kê', result_id });
      }
      await supabase.from('match_results').update({
        score_home: Number(score_home) || 0,
        score_away: Number(score_away) || 0,
        status: status || 'completed',
        ended_at: nowISO(),
      }).eq('result_id', result_id);

      if (status === 'completed') {
        const homeId = team_home_id || existing.team_home_id;
        const awayId = team_away_id || existing.team_away_id;
        await _updateScorers(match_id, scorers || []);
        await _updateTeamScores(homeId, awayId, score_home, score_away);
        await _updatePlayerELO(match_id, homeId, awayId, score_home, score_away);
      }
      return ok({ message: 'Đã cập nhật kết quả', result_id });
    }
  }

  if (status === 'update_scorers') {
    await _updateScorers(match_id, scorers || []);
    return ok({ message: 'Đã cập nhật thống kê' });
  }

  if (!team_home_id || !team_away_id) return err('Thiếu thông tin đội');

  const newResultId = genId('RES');
  await supabase.from('match_results').insert({
    result_id: newResultId, match_id,
    round_number: round_number || 1,
    team_home_id, team_away_id,
    score_home: Number(score_home) || 0,
    score_away: Number(score_away) || 0,
    status: status || 'completed',
    started_at: nowISO(),
  });

  if ((status || 'completed') === 'completed') {
    await _updateScorers(match_id, scorers || []);
    await _updateTeamScores(team_home_id, team_away_id, score_home, score_away);
    await _updatePlayerELO(match_id, team_home_id, team_away_id, score_home, score_away);
  }
  return ok({ message: 'Đã lưu kết quả', result_id: newResultId });
}

async function _updateScorers(match_id, scorers) {
  for (const scorer of scorers) {
    const updates = {};
    if (scorer.goals   !== undefined) updates.goals_scored = Number(scorer.goals)   || 0;
    if (scorer.assists !== undefined) updates.assists      = Number(scorer.assists) || 0;
    if (!Object.keys(updates).length) continue;

    await supabase.from('team_players').update(updates)
      .eq('match_id', match_id).eq('user_id', scorer.user_id);

    const { data: cur } = await supabase.from('users')
      .select('total_goals, total_assists').eq('user_id', scorer.user_id).maybeSingle();
    if (cur) {
      await supabase.from('users').update({
        total_goals:   (cur.total_goals   || 0) + (scorer.goals   || 0),
        total_assists: (cur.total_assists || 0) + (scorer.assists || 0),
      }).eq('user_id', scorer.user_id);
    }
  }
}

async function _updateTeamScores(homeId, awayId, homeScore, awayScore) {
  const hs = Number(homeScore) || 0, as_ = Number(awayScore) || 0;
  const [{ data: homeTeam }, { data: awayTeam }] = await Promise.all([
    supabase.from('match_teams').select('total_score,total_wins,total_losses,total_draws').eq('team_id', homeId).maybeSingle(),
    supabase.from('match_teams').select('total_score,total_wins,total_losses,total_draws').eq('team_id', awayId).maybeSingle(),
  ]);
  if (homeTeam) {
    await supabase.from('match_teams').update({
      total_score:  (homeTeam.total_score  || 0) + hs,
      total_wins:   (homeTeam.total_wins   || 0) + (hs > as_ ? 1 : 0),
      total_losses: (homeTeam.total_losses || 0) + (hs < as_ ? 1 : 0),
      total_draws:  (homeTeam.total_draws  || 0) + (hs === as_ ? 1 : 0),
    }).eq('team_id', homeId);
  }
  if (awayTeam) {
    await supabase.from('match_teams').update({
      total_score:  (awayTeam.total_score  || 0) + as_,
      total_wins:   (awayTeam.total_wins   || 0) + (as_ > hs ? 1 : 0),
      total_losses: (awayTeam.total_losses || 0) + (as_ < hs ? 1 : 0),
      total_draws:  (awayTeam.total_draws  || 0) + (as_ === hs ? 1 : 0),
    }).eq('team_id', awayId);
  }
}

// ELO constants
const K_FACTOR = 30;
const BONUS    = { goal: 3, assist: 2, clean_sheet: 5, mvp: 10 };

async function _updatePlayerELO(match_id, homeTeamId, awayTeamId, homeScore, awayScore) {
  const [{ data: players }, { data: users }] = await Promise.all([
    supabase.from('team_players').select('*').eq('match_id', match_id),
    supabase.from('users').select('*'),
  ]);
  const userMap = {};
  (users || []).forEach(u => { userMap[u.user_id] = u; });

  const homePlayers = (players || []).filter(p => p.team_id === homeTeamId && p.user_id);
  const awayPlayers = (players || []).filter(p => p.team_id === awayTeamId && p.user_id);
  if (!homePlayers.length && !awayPlayers.length) return;

  const homeAvg = homePlayers.length > 0
    ? homePlayers.reduce((s, p) => s + (Number(userMap[p.user_id]?.rating_points) || 1000), 0) / homePlayers.length
    : 1000;
  const awayAvg = awayPlayers.length > 0
    ? awayPlayers.reduce((s, p) => s + (Number(userMap[p.user_id]?.rating_points) || 1000), 0) / awayPlayers.length
    : 1000;

  const homeExp    = 1 / (1 + Math.pow(10, (awayAvg - homeAvg) / 400));
  const hs         = Number(homeScore) || 0, as_ = Number(awayScore) || 0;
  const homeActual = hs > as_ ? 1 : hs < as_ ? 0 : 0.5;
  const awayActual = 1 - homeActual;

  const applyForTeam = async (playerList, actual, expected) => {
    for (const p of playerList) {
      const u = userMap[p.user_id];
      if (!u) continue;
      const eloChange  = Math.round(K_FACTOR * (actual - expected));
      const changeType = actual === 1 ? 'match_win' : actual === 0 ? 'match_loss' : 'match_draw';
      await _applyRatingChange(p.user_id, match_id, changeType, eloChange);

      const goals = Number(p.goals_scored) || 0, assists = Number(p.assists) || 0;
      if (goals > 0 || assists > 0) {
        await _applyRatingChange(p.user_id, match_id, 'goal_assist_bonus', goals * BONUS.goal + assists * BONUS.assist);
      }
      await _updateMatchStats(p.user_id, actual);
    }
    // Clean sheet: bên không thủng lưới
    if (as_ === 0) { // home scored 0 away = away clean sheet
      // This block handles home players' defense — need to check which team is "defending"
    }
  };

  await applyForTeam(homePlayers, homeActual, homeExp);
  await applyForTeam(awayPlayers, awayActual, 1 - homeExp);

  // Clean sheet bonus
  if (as_ === 0) { // home không bị thủng lưới
    for (const p of homePlayers.filter(p => ['GK','DF'].includes(p.position_played))) {
      await _applyRatingChange(p.user_id, match_id, 'clean_sheet', BONUS.clean_sheet);
    }
  }
  if (hs === 0) { // away không bị thủng lưới
    for (const p of awayPlayers.filter(p => ['GK','DF'].includes(p.position_played))) {
      await _applyRatingChange(p.user_id, match_id, 'clean_sheet', BONUS.clean_sheet);
    }
  }
}

async function _applyRatingChange(userId, matchId, changeType, pointsChange) {
  const { data: user } = await supabase
    .from('users').select('rating_points').eq('user_id', userId).maybeSingle();
  if (!user) return;
  const currentRating = Number(user.rating_points) || 1000;
  const ratingAfter   = Math.max(0, currentRating + pointsChange);
  await supabase.from('users').update({ rating_points: ratingAfter }).eq('user_id', userId);
  await supabase.from('rating_history').insert({
    history_id:    genId('HIS'),
    user_id:       userId,
    match_id:      matchId || '',
    change_type:   changeType,
    points_change: pointsChange,
    rating_before: currentRating,
    rating_after:  ratingAfter,
    description:   buildChangeDescription(changeType, pointsChange),
    created_at:    nowISO(),
  });
}

async function _updateMatchStats(userId, result) {
  const { data: user } = await supabase.from('users')
    .select('total_matches, total_wins, total_losses, total_draws').eq('user_id', userId).maybeSingle();
  if (!user) return;
  const update = { total_matches: (user.total_matches || 0) + 1 };
  if (result === 1)   update.total_wins   = (user.total_wins   || 0) + 1;
  else if (result === 0) update.total_losses = (user.total_losses || 0) + 1;
  else                update.total_draws  = (user.total_draws  || 0) + 1;
  const wins = update.total_wins ?? user.total_wins ?? 0;
  update.win_rate = Math.round((wins / update.total_matches) * 100);
  await supabase.from('users').update(update).eq('user_id', userId);
}

async function getResults(data) {
  await requireAuth(data);
  const { match_id } = data;
  let query = supabase.from('match_results').select('*').order('round_number');
  if (match_id) query = query.eq('match_id', match_id);
  const { data: results } = await query;
  return ok({ results: results || [] });
}

async function generateRoundRobinSchedule(data) {
  await requireAdmin(data);
  const { match_id, num_rounds, reset_all } = data;
  const numRounds = Math.max(1, Math.min(5, Number(num_rounds) || 1));
  const { data: teams } = await supabase.from('match_teams').select('*').eq('match_id', match_id);
  if (!teams || teams.length < 2) return err('Cần ít nhất 2 đội');

  let deleteQuery = supabase.from('match_results').delete().eq('match_id', match_id);
  if (!reset_all) deleteQuery = deleteQuery.in('status', ['pending', 'live']);
  await deleteQuery;

  const teamIds  = teams.map(t => t.team_id);
  const newResults = [];
  for (let leg = 1; leg <= numRounds; leg++) {
    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        newResults.push({
          result_id:    genId('RES'), match_id,
          round_number: leg,
          team_home_id: teamIds[i], team_away_id: teamIds[j],
          score_home: 0, score_away: 0, status: 'pending',
        });
      }
    }
  }
  if (newResults.length > 0) await supabase.from('match_results').insert(newResults);

  const legLabel = numRounds === 1 ? '1 lượt' : `${numRounds} lượt`;
  return ok({ message: `Đã tạo ${newResults.length} trận (${legLabel})`, schedule: newResults });
}

async function addMatchResult(data) {
  await requireAdmin(data);
  const { match_id, team_home_id, team_away_id, round_number } = data;
  if (!match_id || !team_home_id || !team_away_id) return err('Thiếu thông tin');
  if (team_home_id === team_away_id) return err('Hai đội phải khác nhau');
  const resultId = genId('RES');
  await supabase.from('match_results').insert({
    result_id: resultId, match_id, round_number: Number(round_number) || 1,
    team_home_id, team_away_id, score_home: 0, score_away: 0, status: 'pending',
  });
  return ok({ result_id: resultId, message: 'Đã thêm trận đấu' });
}

async function deleteMatchResults(data) {
  await requireAdmin(data);
  const { match_id, status_filter } = data;
  if (!match_id) return err('Thiếu match_id');
  let query = supabase.from('match_results').delete().eq('match_id', match_id);
  if (status_filter) query = query.eq('status', status_filter);
  await query;
  return ok({ message: 'Đã xóa kết quả' });
}

async function deleteMatchResult(data) {
  await requireAdmin(data);
  const { result_id } = data;
  if (!result_id) return err('Thiếu result_id');
  await supabase.from('match_results').delete().eq('result_id', result_id);
  return ok({ deleted: 1 });
}

// ============================================================
// RATINGS
// ============================================================

async function getLeaderboard(data) {
  await requireAuth(data);
  const { data: users } = await supabase.from('users')
    .select('user_id, full_name, positions, overall_rating, rating_points, total_matches, total_wins, total_losses, total_draws, total_goals, total_assists, win_rate, avatar_url')
    .eq('status', 'active')
    .order('rating_points', { ascending: false });
  return ok({ leaderboard: (users || []).map(u => ({
    ...u,
    win_rate: u.total_matches > 0 ? Math.round((u.total_wins / u.total_matches) * 100) : 0,
  }))});
}

async function getRatingHistory(data) {
  const user    = await requireAuth(data);
  const targetId = data.user_id || user.user_id;
  const limit   = Number(data.limit) || 20;
  const { data: history } = await supabase.from('rating_history')
    .select('*').eq('user_id', targetId)
    .order('created_at', { ascending: false }).limit(limit);
  return ok({ history: history || [] });
}

async function awardMVP(data) {
  await requireAdmin(data);
  const { user_id, match_id } = data;
  if (!user_id || !match_id) return err('Thiếu thông tin');
  const { data: u } = await supabase.from('users')
    .select('full_name').eq('user_id', user_id).maybeSingle();
  if (!u) return err('Không tìm thấy user');
  await _applyRatingChange(user_id, match_id, 'mvp', BONUS.mvp);
  return ok({ message: `Đã trao MVP cho ${u.full_name} (+${BONUS.mvp} điểm)` });
}

async function adminAdjustRating(data) {
  await requireAdmin(data);
  const { user_id, points_change } = data;
  if (!user_id || points_change === undefined) return err('Thiếu thông tin');
  const { data: u } = await supabase.from('users')
    .select('full_name').eq('user_id', user_id).maybeSingle();
  if (!u) return err('Không tìm thấy user');
  await _applyRatingChange(user_id, '', 'admin_adjust', Number(points_change));
  return ok({ message: `Đã điều chỉnh ${points_change > 0 ? '+' : ''}${points_change} điểm` });
}

// ============================================================
// MAIN HANDLER — Vercel entry point
// ============================================================

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Health check
  if (req.method === 'GET') {
    return res.json({ status: 'ok', message: 'Toneri FC API v2 (Vercel + Supabase) 🟢' });
  }

  if (req.method !== 'POST') return res.json(err('Method not allowed'));

  // Parse body — hỗ trợ cả JSON và text/plain
  let data = {};
  try {
    data = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return res.json(err('Invalid JSON body'));
  }

  const { action } = data;
  if (!action) return res.json(err('Missing action'));

  try {
    let result;
    switch (action) {
      // ---- Auth ----
      case 'login':              result = await login(data);              break;
      case 'register':           result = await register(data);           break;
      case 'logout':             result = await logout(data);             break;
      case 'getProfile':         result = await getProfile(data);         break;
      case 'updateProfile':      result = await updateProfile(data);      break;
      case 'updateUserStats':    result = await updateUserStats(data);    break;
      case 'getUsers':           result = await getUsers(data);           break;
      case 'adminUpdateUser':    result = await adminUpdateUser(data);    break;
      // ---- Matches ----
      case 'createMatch':        result = await createMatch(data);        break;
      case 'getMatches':         result = await getMatches(data);         break;
      case 'getUpcomingMatches': result = await getUpcomingMatches(data); break;
      case 'updateMatch':        result = await updateMatch(data);        break;
      case 'deleteMatch':        result = await deleteMatch(data);        break;
      case 'getMatchDetail':     result = await getMatchDetail(data);     break;
      // ---- Attendance ----
      case 'vote':               result = await vote(data);               break;
      case 'getAttendance':      result = await getAttendance(data);      break;
      case 'getMyVote':          result = await getMyVote(data);          break;
      // ---- Guest Teams ----
      case 'addGuestTeam':       result = await addGuestTeam(data);       break;
      case 'getGuestTeams':      result = await getGuestTeams(data);      break;
      case 'deleteGuestTeam':    result = await deleteGuestTeam(data);    break;
      // ---- Teams ----
      case 'suggestTeams':       result = await suggestTeams(data);       break;
      case 'saveTeams':          result = await saveTeams(data);          break;
      case 'getTeams':           result = await getTeams(data);           break;
      // ---- Results ----
      case 'saveMatchResult':    result = await saveMatchResult(data);    break;
      case 'getResults':         result = await getResults(data);         break;
      case 'generateSchedule':   result = await generateRoundRobinSchedule(data); break;
      case 'addMatchResult':     result = await addMatchResult(data);     break;
      case 'deleteMatchResults': result = await deleteMatchResults(data); break;
      case 'deleteMatchResult':  result = await deleteMatchResult(data);  break;
      // ---- Ratings ----
      case 'getLeaderboard':     result = await getLeaderboard(data);     break;
      case 'getRatingHistory':   result = await getRatingHistory(data);   break;
      case 'awardMVP':           result = await awardMVP(data);           break;
      case 'adminAdjustRating':  result = await adminAdjustRating(data);  break;

      default: result = err(`Unknown action: ${action}`);
    }
    return res.json(result);

  } catch (e) {
    console.error(`[API Error][${action}]`, e.message);
    if (e.message.startsWith('Unauthorized') || e.message.startsWith('Forbidden')) {
      return res.status(401).json(err(e.message));
    }
    return res.json(err(e.message));
  }
}
