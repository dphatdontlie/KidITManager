CREATE TABLE IF NOT EXISTS class_pay_rate_history (
  class_id INT NOT NULL,
  effective_date VARCHAR(10) NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (class_id,effective_date),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS attendance_pay_details (
  attendance_id INT PRIMARY KEY,
  single_teacher INT NOT NULL DEFAULT 0,
  override_amount DECIMAL(16,2) NULL,
  override_reason VARCHAR(1000) NOT NULL DEFAULT '',
  snapshot TEXT NULL,
  FOREIGN KEY (attendance_id) REFERENCES personal_attendance(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS historic_pay_snapshots (
  session_id INT NOT NULL,
  teacher_id INT NOT NULL,
  snapshot TEXT NOT NULL,
  PRIMARY KEY (session_id,teacher_id),
  FOREIGN KEY (session_id) REFERENCES teaching_sessions(id) ON DELETE CASCADE
);
