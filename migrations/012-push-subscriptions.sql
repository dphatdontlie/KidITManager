CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint_hash VARCHAR(64) PRIMARY KEY,
  account_id INT NOT NULL,
  session_hash VARCHAR(64) NOT NULL,
  subscription TEXT NOT NULL,
  last_test_at DATETIME NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (session_hash) REFERENCES account_sessions(token_hash) ON DELETE CASCADE,
  INDEX push_account_id (account_id)
);
CREATE TABLE IF NOT EXISTS push_preferences (
  account_id INT PRIMARY KEY,
  lead_minutes INT NOT NULL DEFAULT 15,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS push_deliveries (
  endpoint_hash VARCHAR(64) NOT NULL,
  event_key VARCHAR(120) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (endpoint_hash,event_key),
  FOREIGN KEY (endpoint_hash) REFERENCES push_subscriptions(endpoint_hash) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS push_scheduler (
  id INT PRIMARY KEY,
  last_run_at DATETIME NOT NULL
);
