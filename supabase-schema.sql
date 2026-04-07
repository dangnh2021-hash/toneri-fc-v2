-- ============================================================
-- Toneri FC v2 - Supabase PostgreSQL Schema
-- Chạy toàn bộ file này trong Supabase SQL Editor
-- ============================================================

-- USERS
create table if not exists users (
  user_id          text primary key,
  username         text unique not null,
  password_hash    text not null,
  full_name        text not null,
  email            text default '',
  phone            text default '',
  is_admin         boolean default false,
  positions        text default 'FW',
  avatar_url       text default '',
  -- FIFA-style stats
  pace             int default 60 check (pace between 1 and 99),
  shooting         int default 60 check (shooting between 1 and 99),
  passing          int default 60 check (passing between 1 and 99),
  dribbling        int default 60 check (dribbling between 1 and 99),
  defending        int default 60 check (defending between 1 and 99),
  physical         int default 60 check (physical between 1 and 99),
  gk_diving        int default 60 check (gk_diving between 1 and 99),
  gk_handling      int default 60 check (gk_handling between 1 and 99),
  gk_reflexes      int default 60 check (gk_reflexes between 1 and 99),
  overall_rating   int default 60,
  -- ELO & match stats
  rating_points    int default 1000,
  total_matches    int default 0,
  total_wins       int default 0,
  total_draws      int default 0,
  total_losses     int default 0,
  total_goals      int default 0,
  total_assists    int default 0,
  win_rate         int default 0,
  -- Auth
  session_token    text,
  token_expiry     timestamptz,
  last_login       timestamptz,
  status           text default 'active' check (status in ('active','inactive')),
  created_at       timestamptz default now()
);

-- MATCHES
create table if not exists matches (
  match_id              text primary key,
  match_date            date not null,
  start_time            text not null,
  end_time              text default '',
  venue_name            text not null,
  venue_address         text default '',
  num_players_per_team  int default 5,
  num_teams             int default 2,
  match_format          text default '5v5',
  status                text default 'scheduled'
                          check (status in ('scheduled','ongoing','completed','cancelled')),
  notes                 text default '',
  voting_deadline       text default '',
  created_by            text references users(user_id) on delete set null,
  created_at            timestamptz default now()
);

-- MATCH_ATTENDANCE
create table if not exists match_attendance (
  attendance_id  text primary key,
  match_id       text not null references matches(match_id) on delete cascade,
  user_id        text not null references users(user_id) on delete cascade,
  vote_status    text not null check (vote_status in ('YES','NO','MAYBE')),
  note           text default '',
  voted_at       timestamptz default now(),
  updated_at     timestamptz default now(),
  unique (match_id, user_id)
);

-- GUEST_TEAMS
create table if not exists guest_teams (
  guest_team_id       text primary key,
  team_name           text not null,
  representative_name text default '',
  contact_phone       text default '',
  match_id            text references matches(match_id) on delete cascade,
  notes               text default '',
  created_at          timestamptz default now()
);

-- MATCH_TEAMS
create table if not exists match_teams (
  team_id       text primary key,
  match_id      text not null references matches(match_id) on delete cascade,
  team_name     text not null,
  team_color    text default '#666666',
  team_type     text default 'internal' check (team_type in ('internal','guest')),
  guest_team_id text references guest_teams(guest_team_id) on delete set null,
  formation     text default '',
  team_order    int default 0,
  total_score   int default 0,
  total_wins    int default 0,
  total_losses  int default 0,
  total_draws   int default 0,
  created_at    timestamptz default now()
);

-- TEAM_PLAYERS
create table if not exists team_players (
  id                text primary key,
  team_id           text not null references match_teams(team_id) on delete cascade,
  match_id          text not null references matches(match_id) on delete cascade,
  user_id           text references users(user_id) on delete set null,
  guest_player_name text default '',
  position_played   text default 'MF',
  jersey_number     int default 0,
  is_captain        boolean default false,
  goals_scored      int default 0,
  assists           int default 0,
  yellow_cards      int default 0,
  red_cards         int default 0,
  player_rating     numeric(4,1) default 0
);

-- MATCH_RESULTS
create table if not exists match_results (
  result_id    text primary key,
  match_id     text not null references matches(match_id) on delete cascade,
  round_number int default 1,
  team_home_id text references match_teams(team_id) on delete set null,
  team_away_id text references match_teams(team_id) on delete set null,
  score_home   int default 0,
  score_away   int default 0,
  status       text default 'pending' check (status in ('pending','live','completed','cancelled')),
  started_at   timestamptz,
  ended_at     timestamptz
);

-- RATING_HISTORY
create table if not exists rating_history (
  history_id    text primary key,
  user_id       text not null references users(user_id) on delete cascade,
  match_id      text default '',
  change_type   text not null,
  points_change int not null,
  rating_before int default 1000,
  rating_after  int default 1000,
  description   text default '',
  created_at    timestamptz default now()
);

-- ============================================================
-- Indexes để tăng query performance
-- ============================================================
create index if not exists idx_matches_status       on matches(status);
create index if not exists idx_matches_date         on matches(match_date);
create index if not exists idx_attendance_match     on match_attendance(match_id);
create index if not exists idx_attendance_user      on match_attendance(user_id);
create index if not exists idx_teams_match          on match_teams(match_id);
create index if not exists idx_players_team         on team_players(team_id);
create index if not exists idx_players_match        on team_players(match_id);
create index if not exists idx_results_match        on match_results(match_id);
create index if not exists idx_rating_history_user  on rating_history(user_id);
create index if not exists idx_users_token          on users(session_token) where session_token is not null;
create index if not exists idx_users_rating         on users(rating_points desc);

-- ============================================================
-- Admin user mặc định
-- password: admin123 (SHA-256 hash)
-- THAY ĐỔI MẬT KHẨU SAU KHI DEPLOY!
-- ============================================================
insert into users (
  user_id, username, password_hash, full_name, is_admin,
  positions, overall_rating, rating_points, status
) values (
  'USR_ADMIN',
  'admin',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a',
  'Administrator',
  true,
  'FW',
  80,
  1000,
  'active'
) on conflict (username) do nothing;
