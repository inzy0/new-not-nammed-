-- Evidara backend schema (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, picture TEXT,
  role TEXT NOT NULL DEFAULT 'member', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY, member_id TEXT UNIQUE, domain TEXT, name TEXT, role_title TEXT, institution TEXT,
  orcid TEXT, bio TEXT, audience TEXT, tone TEXT, verified INTEGER NOT NULL DEFAULT 0, listed INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, data TEXT NOT NULL, docs TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  note TEXT, created_at TEXT NOT NULL, decided_at TEXT, decided_by TEXT
);
CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, track TEXT NOT NULL DEFAULT 'community', status TEXT NOT NULL DEFAULT 'submitted',
  title TEXT, domain TEXT, data TEXT NOT NULL, article_id TEXT UNIQUE, report TEXT, note TEXT,
  created_at TEXT NOT NULL, published_at TEXT
);
CREATE INDEX IF NOT EXISTS posts_status ON posts (status, published_at);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, thread TEXT NOT NULL, user_id TEXT NOT NULL, parent TEXT, kind TEXT, to_authors INTEGER NOT NULL DEFAULT 0,
  text TEXT NOT NULL, created_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS comments_thread ON comments (thread, created_at);
CREATE TABLE IF NOT EXISTS likes (
  key TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (key, user_id)
);
CREATE INDEX IF NOT EXISTS likes_time ON likes (created_at);
CREATE TABLE IF NOT EXISTS follows (
  user_id TEXT NOT NULL, target TEXT NOT NULL, name TEXT, created_at TEXT NOT NULL, PRIMARY KEY (user_id, target)
);
CREATE TABLE IF NOT EXISTS library (
  user_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY, paper_key TEXT NOT NULL, user_id TEXT NOT NULL, r2_key TEXT NOT NULL, name TEXT, size INTEGER, mime TEXT,
  created_at TEXT NOT NULL, removed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS videos_paper ON videos (paper_key, created_at);
CREATE TABLE IF NOT EXISTS quota (
  day TEXT NOT NULL, who TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, who)
);
-- Fallback file store used until R2 is enabled (files up to ~1.9 MB)
CREATE TABLE IF NOT EXISTS files (
  key TEXT PRIMARY KEY, mime TEXT, data BLOB NOT NULL, size INTEGER, created_at TEXT NOT NULL
);
-- Private chat: privacy settings, chat requests, messages, reports
CREATE TABLE IF NOT EXISTS privacy (
  user_id TEXT PRIMARY KEY, dm_policy TEXT NOT NULL DEFAULT 'request', contact TEXT NOT NULL DEFAULT '{}', updated_at TEXT
);
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY, from_user TEXT NOT NULL, to_user TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  note TEXT, created_at TEXT NOT NULL, decided_at TEXT, UNIQUE (from_user, to_user)
);
CREATE INDEX IF NOT EXISTS conn_to ON connections (to_user, status);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, pair TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS msg_pair ON messages (pair, created_at);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY, reporter TEXT NOT NULL, pair TEXT NOT NULL, reason TEXT, created_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open'
);
-- Profile dashboard, member posts, EV marks, change history, message attachments
CREATE TABLE IF NOT EXISTS profile_ext (
  user_id TEXT PRIMARY KEY, avatar TEXT, headline TEXT, website TEXT, niche TEXT, highlights TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS profile_history (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, changes TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ph_user ON profile_history (user_id, at);
CREATE TABLE IF NOT EXISTS mposts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, caption TEXT, media TEXT NOT NULL DEFAULT '[]',
  paper_key TEXT, paper_title TEXT, rating INTEGER, music TEXT, tags TEXT, created_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS mposts_user ON mposts (user_id, created_at);
CREATE INDEX IF NOT EXISTS mposts_time ON mposts (created_at);
CREATE TABLE IF NOT EXISTS ev_marks (
  target TEXT PRIMARY KEY, by_email TEXT, note TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS msg_attach (
  id TEXT PRIMARY KEY, message_id TEXT NOT NULL, kind TEXT NOT NULL, name TEXT, src TEXT NOT NULL, size INTEGER
);
CREATE INDEX IF NOT EXISTS msg_attach_msg ON msg_attach (message_id);
-- LinkedIn-style profile sections + one-time location
CREATE TABLE IF NOT EXISTS profile_cv (
  user_id TEXT PRIMARY KEY, experience TEXT, education TEXT, certifications TEXT, achievements TEXT, skills TEXT,
  linkedin TEXT, location TEXT, updated_at TEXT
);
