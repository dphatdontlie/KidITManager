CREATE TABLE IF NOT EXISTS class_schedule_history (
  class_id INT NOT NULL,
  effective_date VARCHAR(10) NOT NULL,
  payload LONGTEXT NOT NULL,
  PRIMARY KEY (class_id, effective_date),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);
