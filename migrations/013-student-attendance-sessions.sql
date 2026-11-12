CREATE TABLE IF NOT EXISTS student_attendance_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class_id INT NOT NULL,
  date VARCHAR(10) NOT NULL,
  start_time VARCHAR(5) NOT NULL,
  end_time VARCHAR(5) NOT NULL,
  state VARCHAR(20) NOT NULL DEFAULT 'open',
  opened_by INT NULL,
  opened_name VARCHAR(255) NOT NULL,
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME NULL,
  version INT NOT NULL DEFAULT 1,
  UNIQUE (class_id,date,start_time),
  FOREIGN KEY (class_id) REFERENCES classes(id),
  FOREIGN KEY (opened_by) REFERENCES accounts(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS student_attendance_session_staff (
  session_id INT NOT NULL,
  account_id INT NOT NULL,
  PRIMARY KEY (session_id,account_id),
  FOREIGN KEY (session_id) REFERENCES student_attendance_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS student_attendance_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  student_id INT NOT NULL,
  student_name TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  marked_by VARCHAR(255) NULL,
  marked_at DATETIME NULL,
  version INT NOT NULL DEFAULT 1,
  UNIQUE (session_id,student_id),
  FOREIGN KEY (session_id) REFERENCES student_attendance_sessions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS student_attendance_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  session_id INT NOT NULL,
  student_id INT NULL,
  actor_name VARCHAR(255) NOT NULL,
  action VARCHAR(20) NOT NULL,
  payload TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES student_attendance_sessions(id)
);
