CREATE TABLE IF NOT EXISTS class_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  date VARCHAR(10) NOT NULL,
  category VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  amount DECIMAL(14,0) NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'open',
  author_account_id INT NOT NULL,
  author_name VARCHAR(255) NOT NULL,
  updated_by VARCHAR(255) NOT NULL,
  created_at VARCHAR(24) NOT NULL,
  updated_at VARCHAR(24) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  INDEX notes_by_date (date,class_id),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS attendance_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  attendance_id INT NOT NULL,
  actor_account_id INT NOT NULL,
  actor_name VARCHAR(255) NOT NULL,
  action VARCHAR(20) NOT NULL,
  payload LONGTEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX actions_by_attendance (attendance_id,id)
);
