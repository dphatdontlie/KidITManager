CREATE TABLE IF NOT EXISTS payroll_bonuses (
  teacher_id INT NOT NULL,
  month VARCHAR(7) NOT NULL,
  amount DECIMAL(14,0) NOT NULL DEFAULT 0,
  note VARCHAR(1000) NOT NULL DEFAULT '',
  version INT NOT NULL DEFAULT 1,
  updated_by VARCHAR(255) NOT NULL,
  updated_at VARCHAR(24) NOT NULL,
  PRIMARY KEY (teacher_id,month),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);
