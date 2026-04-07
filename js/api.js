// ============================================================
// api.js - API wrapper cho Vercel Serverless Function (v2)
// ============================================================

// ---- Cache Layer ----
const _apiCache = {};

// TTL (ms) cho từng read action - chỉ cache GET-like calls không có match_id
const _CACHE_TTL = {
  getLeaderboard:     60 * 1000,   // 60s — ELO thay đổi ít
  getMatches:         30 * 1000,   // 30s — danh sách trận
  getUpcomingMatches: 30 * 1000,   // 30s — trận sắp tới
  getUsers:          120 * 1000,   // 2 phút — thông tin cầu thủ
};

// Write actions → invalidate các cached keys liên quan
const _CACHE_INVALIDATORS = {
  vote:              ['getUpcomingMatches', 'getMatches'],
  createMatch:       ['getUpcomingMatches', 'getMatches'],
  updateMatch:       ['getUpcomingMatches', 'getMatches'],
  deleteMatch:       ['getUpcomingMatches', 'getMatches'],
  saveTeams:         ['getMatches', 'getUpcomingMatches'],
  saveMatchResult:   ['getLeaderboard', 'getMatches', 'getUpcomingMatches'],
  awardMVP:          ['getLeaderboard'],
  adminAdjustRating: ['getLeaderboard'],
  addGuestTeam:      ['getMatches'],
  deleteGuestTeam:   ['getMatches'],
  updateProfile:     ['getUsers', 'getLeaderboard'],
  updateUserStats:   ['getUsers', 'getLeaderboard'],
  adminUpdateUser:   ['getUsers'],
  register:          ['getUsers'],
};

const API = {
  // ---- Core fetch ----
  async call(action, data = {}) {
    const token = localStorage.getItem(CONFIG.TOKEN_KEY);
    const payload = { action, ...data };
    if (token) payload.token = token;

    // --- Cache read: trả về cached nếu còn hiệu lực ---
    const ttl = _CACHE_TTL[action];
    if (ttl) {
      const cacheKey = action + '|' + (token || '') + '|' + JSON.stringify(data);
      const hit = _apiCache[cacheKey];
      if (hit && (Date.now() - hit.ts < ttl)) {
        console.debug(`[Cache HIT] ${action}`);
        return hit.value;
      }
    }

    try {
      const res = await fetch(CONFIG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      // --- Cache write: lưu response thành công ---
      if (ttl && json?.success) {
        const cacheKey = action + '|' + (token || '') + '|' + JSON.stringify(data);
        _apiCache[cacheKey] = { ts: Date.now(), value: json };
        console.debug(`[Cache SET] ${action} (TTL: ${ttl / 1000}s)`);
      }

      // --- Cache invalidation: xóa các cache liên quan sau write ---
      const toInvalidate = _CACHE_INVALIDATORS[action];
      if (toInvalidate) {
        toInvalidate.forEach(prefix => {
          Object.keys(_apiCache)
            .filter(k => k.startsWith(prefix + '|'))
            .forEach(k => { delete _apiCache[k]; });
        });
        console.debug(`[Cache INVALIDATE] after ${action}:`, toInvalidate);
      }

      return json;
    } catch (err) {
      console.error(`API Error [${action}]:`, err);
      throw err;
    }
  },

  // Xóa toàn bộ cache (gọi sau logout)
  clearCache() {
    Object.keys(_apiCache).forEach(k => delete _apiCache[k]);
    console.debug('[Cache CLEAR] all entries removed');
  },

  // ---- Password hashing (Web Crypto API) ----
  async hashPassword(password) {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  // ---- Auth ----
  async login(username, password) {
    const password_hash = await this.hashPassword(password);
    return this.call('login', { username, password_hash });
  },

  async register(formData) {
    const password_hash = await this.hashPassword(formData.password);
    return this.call('register', { ...formData, password_hash, password: undefined });
  },

  async logout() {
    return this.call('logout');
  },

  async getProfile() {
    return this.call('getProfile');
  },

  async updateProfile(data) {
    return this.call('updateProfile', data);
  },

  async updateUserStats(data) {
    return this.call('updateUserStats', data);
  },

  async getUsers() {
    return this.call('getUsers');
  },

  async adminUpdateUser(targetUserId, updates) {
    return this.call('adminUpdateUser', { target_user_id: targetUserId, updates });
  },

  // ---- Matches ----
  async getMatches() {
    return this.call('getMatches');
  },

  async getUpcomingMatches() {
    return this.call('getUpcomingMatches');
  },

  async getMatchDetail(matchId) {
    return this.call('getMatchDetail', { match_id: matchId });
  },

  async createMatch(data) {
    return this.call('createMatch', data);
  },

  async updateMatch(matchId, updates) {
    return this.call('updateMatch', { match_id: matchId, updates });
  },

  async deleteMatch(matchId) {
    return this.call('deleteMatch', { match_id: matchId });
  },

  // ---- Attendance ----
  async vote(matchId, voteStatus, note = '') {
    return this.call('vote', { match_id: matchId, vote_status: voteStatus, note });
  },

  async getAttendance(matchId) {
    return this.call('getAttendance', { match_id: matchId });
  },

  async getMyVote(matchId) {
    return this.call('getMyVote', { match_id: matchId });
  },

  // ---- Guest Teams ----
  async addGuestTeam(data) {
    return this.call('addGuestTeam', data);
  },

  async getGuestTeams(matchId) {
    return this.call('getGuestTeams', { match_id: matchId });
  },

  async deleteGuestTeam(guestTeamId) {
    return this.call('deleteGuestTeam', { guest_team_id: guestTeamId });
  },

  // ---- Team Formation ----
  async suggestTeams(matchId) {
    return this.call('suggestTeams', { match_id: matchId });
  },

  async saveTeams(matchId, teams) {
    return this.call('saveTeams', { match_id: matchId, teams });
  },

  async getTeams(matchId) {
    return this.call('getTeams', { match_id: matchId });
  },

  // ---- Results ----
  async saveMatchResult(data) {
    return this.call('saveMatchResult', data);
  },

  async getResults(matchId) {
    return this.call('getResults', { match_id: matchId });
  },

  async generateSchedule(matchId) {
    return this.call('generateSchedule', { match_id: matchId });
  },

  async addMatchResult(data) {
    return this.call('addMatchResult', data);
  },

  async deleteMatchResults(matchId, statusFilter) {
    return this.call('deleteMatchResults', { match_id: matchId, status_filter: statusFilter });
  },

  async deleteMatchResult(resultId) {
    return this.call('deleteMatchResult', { result_id: resultId });
  },

  // ---- Ratings ----
  async getLeaderboard() {
    return this.call('getLeaderboard');
  },

  async getRatingHistory(userId, limit = 20) {
    return this.call('getRatingHistory', { user_id: userId, limit });
  },

  async awardMVP(userId, matchId) {
    return this.call('awardMVP', { user_id: userId, match_id: matchId });
  },

  async adminAdjustRating(userId, pointsChange) {
    return this.call('adminAdjustRating', { user_id: userId, points_change: pointsChange });
  }
};
