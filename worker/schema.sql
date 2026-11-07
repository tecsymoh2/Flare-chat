CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
INSERT OR IGNORE INTO meta (key, value) VALUES ('initialized', '1');
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text' CHECK (kind IN ('text','voice','file','sticker','call')),
  content TEXT,
  media_path TEXT,
  thumb_path TEXT,
  media_duration INTEGER,
  waveform TEXT,
  reply_to TEXT REFERENCES messages(id) ON DELETE SET NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  view_once INTEGER NOT NULL DEFAULT 0,
  viewed_at TEXT,
  view_closed_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  edited_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  CHECK (content IS NOT NULL OR media_path IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS messages_conv_created_idx ON messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_expires_idx ON messages (expires_at) WHERE expires_at IS NOT NULL;
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE IF NOT EXISTS message_stars (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  content TEXT NOT NULL,
  send_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS scheduled_send_idx ON scheduled_messages (send_at);
CREATE TABLE IF NOT EXISTS shared_items (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('todo','countdown')),
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  target_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
