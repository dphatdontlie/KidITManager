CREATE TABLE IF NOT EXISTS staff_presence (
  session_hash VARCHAR(64) PRIMARY KEY,
  active_until BIGINT NOT NULL,
  KEY staff_presence_active_until (active_until),
  FOREIGN KEY (session_hash) REFERENCES account_sessions(token_hash) ON DELETE CASCADE
);
