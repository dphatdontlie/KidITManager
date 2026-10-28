CREATE TABLE IF NOT EXISTS class_pay_rates (
  class_id INT PRIMARY KEY,
  session_amount DECIMAL(14,0) NOT NULL,
  teacher_amount DECIMAL(14,0) NOT NULL,
  ta_amount DECIMAL(14,0) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  updated_by VARCHAR(255) NOT NULL,
  updated_at VARCHAR(24) NOT NULL,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);
