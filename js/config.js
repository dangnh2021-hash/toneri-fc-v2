// ============================================================
// config.js - Cấu hình App
// ⚠️ Thay YOUR_APPS_SCRIPT_URL bằng URL thực sau khi deploy
// ============================================================

const CONFIG = {
  // v2: Vercel Serverless Function (same-origin, no CORS issue)
  API_URL: '/api',

  APP_NAME: 'Toneri FC',
  VERSION: '2.0.0',

  // Token storage key
  TOKEN_KEY: 'toneri_fc_token',
  USER_KEY: 'toneri_fc_user',

  // Positions
  POSITIONS: {
    FW: { label: 'FW', name: 'Tiền đạo', color: 'pos-fw', icon: '⚡' },
    MF: { label: 'MF', name: 'Tiền vệ', color: 'pos-mf', icon: '🔄' },
    DF: { label: 'DF', name: 'Hậu vệ', color: 'pos-df', icon: '🛡️' },
    GK: { label: 'GK', name: 'Thủ môn', color: 'pos-gk', icon: '🧤' }
  },

  // Team colors
  TEAM_COLORS: ['#EF4444', '#3B82F6', '#F59E0B', '#6B7280'],
  TEAM_NAMES: ['Đội Đỏ', 'Đội Xanh', 'Đội Vàng', 'Đội Trắng'],

  // Match status labels
  MATCH_STATUS: {
    scheduled: { label: 'Sắp diễn ra', class: 'badge-scheduled', icon: '📅' },
    ongoing: { label: 'Đang diễn ra', class: 'badge-ongoing', icon: '🟢' },
    completed: { label: 'Đã kết thúc', class: 'badge-completed', icon: '✅' },
    cancelled: { label: 'Đã hủy', class: 'badge-cancelled', icon: '❌' }
  }
};
