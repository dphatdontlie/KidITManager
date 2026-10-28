import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { registerClasses } from '../server/classes.js';
import { registerTeachingSessions } from '../server/teaching-sessions.js';
import { registerStudentAttendance } from '../server/student-attendance.js';
import { registerAccounts, hashPassword } from '../server/accounts.js';
import { registerPersonalAttendance } from '../server/personal-attendance.js';
import { registerClassNotes } from '../server/class-notes.js';
import { registerPayrollBonuses } from '../server/payroll-bonuses.js';
import { registerPayRates } from '../server/pay-rates.js';
import { createTeacherAccount } from '../server/accounts.js';
import { randomUUID } from 'node:crypto';
import { createQuizService } from '../server/quiz.js';

export function createFixture({ auth = false, quizNow = Date.now } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE quiz_rooms (code TEXT PRIMARY KEY, owner_id INTEGER, state TEXT, version INTEGER DEFAULT 0, expires_at INTEGER);
    CREATE TABLE classes (id INTEGER PRIMARY KEY, name TEXT, teacher TEXT, ta TEXT, schedule TEXT, room TEXT, capacity INTEGER);
    CREATE TABLE class_schedule_history (class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE, effective_date TEXT, payload TEXT, PRIMARY KEY(class_id,effective_date));
    CREATE TABLE class_slot_staff (class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE, slot TEXT, teacher TEXT, ta TEXT, PRIMARY KEY(class_id,slot));
    CREATE TABLE class_slot_people (class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE, slot TEXT, position INTEGER, name TEXT, role TEXT, PRIMARY KEY(class_id,slot,position));
    CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, role INTEGER, phone TEXT);
    CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT, phone TEXT, parentName TEXT, parentPhone TEXT);
    CREATE TABLE class_students (id INTEGER PRIMARY KEY, class_id INTEGER REFERENCES classes(id), student_id INTEGER REFERENCES students(id));
    CREATE TABLE attendance (id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER REFERENCES classes(id), student_id INTEGER REFERENCES students(id), date TEXT, status TEXT, UNIQUE(class_id, student_id, date));
    CREATE TABLE teaching_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, class_id INTEGER REFERENCES classes(id), date TEXT, start_time TEXT, end_time TEXT, status TEXT, notes TEXT, version INTEGER DEFAULT 1);
    CREATE TABLE session_staff (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER REFERENCES teaching_sessions(id), teacher_id INTEGER, teacher_name TEXT, role TEXT, minutes INTEGER, UNIQUE(session_id, teacher_id));
    CREATE TABLE session_revisions (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER REFERENCES teaching_sessions(id), payload TEXT);
    CREATE TABLE teacher_attendance (id INTEGER PRIMARY KEY, class_id INTEGER, teacher_name TEXT, role TEXT, date TEXT, status TEXT);
    CREATE TABLE accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password_hash TEXT, account_role TEXT, teacher_id INTEGER UNIQUE REFERENCES teachers(id) ON DELETE CASCADE);
    CREATE TABLE account_sessions (token_hash TEXT PRIMARY KEY, account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE, expires_at TEXT);
    CREATE TABLE personal_attendance (id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER REFERENCES teachers(id),teacher_name TEXT,class_id INTEGER REFERENCES classes(id),date TEXT,start_time TEXT,end_time TEXT,slot TEXT,lesson TEXT,role TEXT,status TEXT,notes TEXT,version INTEGER DEFAULT 1,UNIQUE(teacher_id,class_id,date,start_time,end_time));
    CREATE TABLE invoices (id INTEGER PRIMARY KEY AUTOINCREMENT,invoice_code TEXT UNIQUE,student_id INTEGER REFERENCES students(id),amount INTEGER,status TEXT,createdAt TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE attendance_payroll (attendance_id INTEGER PRIMARY KEY REFERENCES personal_attendance(id) ON DELETE CASCADE,teacher_count INTEGER NOT NULL,ta_count INTEGER NOT NULL);
    CREATE TABLE attendance_actions (id INTEGER PRIMARY KEY AUTOINCREMENT,attendance_id INTEGER,actor_account_id INTEGER,actor_name TEXT,action TEXT,payload TEXT);
    CREATE TABLE payroll_bonuses (teacher_id INTEGER REFERENCES teachers(id),month TEXT,amount INTEGER,note TEXT,version INTEGER DEFAULT 1,updated_by TEXT,updated_at TEXT,PRIMARY KEY(teacher_id,month));
    CREATE TABLE class_pay_rates (class_id INTEGER PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,session_amount INTEGER,teacher_amount INTEGER,ta_amount INTEGER,version INTEGER DEFAULT 1,updated_by TEXT,updated_at TEXT);
    CREATE TABLE class_pay_rate_history (class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,effective_date TEXT,payload TEXT,PRIMARY KEY(class_id,effective_date));
    CREATE TABLE attendance_pay_details (attendance_id INTEGER PRIMARY KEY REFERENCES personal_attendance(id) ON DELETE CASCADE,single_teacher INTEGER DEFAULT 0,override_amount REAL,override_reason TEXT DEFAULT '',snapshot TEXT);
    CREATE TABLE historic_pay_snapshots (session_id INTEGER REFERENCES teaching_sessions(id) ON DELETE CASCADE,teacher_id INTEGER,snapshot TEXT,PRIMARY KEY(session_id,teacher_id));
    CREATE TABLE class_notes (id INTEGER PRIMARY KEY AUTOINCREMENT,class_id INTEGER REFERENCES classes(id),date TEXT,category TEXT,content TEXT,amount INTEGER,status TEXT,author_account_id INTEGER,author_name TEXT,updated_by TEXT,created_at TEXT,updated_at TEXT,version INTEGER DEFAULT 1);
    INSERT INTO classes VALUES (1,'Lớp kiểm thử','GV kiểm thử A','GV kiểm thử B','Thứ 5 (15:15 - 17:15)','1',10);
    INSERT INTO teachers VALUES (1,'GV kiểm thử A',1,''),(2,'GV kiểm thử B',2,''),(3,'GV dạy thay C',1,'');
    INSERT INTO students VALUES (1,'Học sinh kiểm thử','','','');
    INSERT INTO class_students VALUES (1,1,1);
    INSERT INTO teacher_attendance VALUES (1,1,'GV kiểm thử A','teacher','2026-10-01','present');
  `);
  const state = { failRevision: false, failAttendanceStudent: null, failPayroll: false };
  const connection = {
    async query(sql, params = []) {
      if (state.failRevision && sql.startsWith('INSERT INTO session_revisions')) throw new Error('injected failure');
      if (state.failPayroll && sql.startsWith('INSERT INTO attendance_payroll')) throw new Error('injected payroll failure');
      if (state.failAttendanceStudent && sql.startsWith('INSERT INTO attendance') && Number(params[1]) === state.failAttendanceStudent) throw new Error('injected attendance failure');
      params = params.map(p => p instanceof Date ? p.toISOString().slice(0, 19).replace('T', ' ') : p);
      const statement = sqlite.prepare(sql.replaceAll(' FOR UPDATE', '').replace("CONCAT('personal-',a.id)", "('personal-' || a.id)").replace(/ON DUPLICATE KEY UPDATE status = VALUES\(status\)/, 'ON CONFLICT(class_id, student_id, date) DO UPDATE SET status=excluded.status'));
      if (/^SELECT/i.test(sql.trim())) return [statement.all(...params)];
      const result = statement.run(...params);
      return [{ insertId: Number(result.lastInsertRowid), affectedRows: result.changes }];
    },
    async beginTransaction() { sqlite.exec('BEGIN'); },
    async commit() { sqlite.exec('COMMIT'); },
    async rollback() { sqlite.exec('ROLLBACK'); },
    release() {}
  };
  const pool = { promise: () => ({ query: connection.query, getConnection: async () => connection }) };
  const app = express(); app.use(express.json({ limit: '192kb' }));
  const quiz = createQuizService(pool, { now: quizNow });
  quiz.registerPublic(app);
  if (auth) {
    for (const [username, role, teacher] of [['admin', 'admin', null], ['gv1', 'teacher', 1], ['gv2', 'teacher', 2]]) {
      sqlite.prepare('INSERT INTO accounts (username,password_hash,account_role,teacher_id) VALUES (?,?,?,?)').run(username, hashPassword(role === 'admin' ? 'admin' : 'kidit'), role, teacher);
    }
    registerAccounts(app, pool);
    registerPersonalAttendance(app, pool);
    registerClassNotes(app, pool);
    registerPayrollBonuses(app, pool);
    registerPayRates(app, pool);
  }
  quiz.registerHost(app);
  registerClasses(app, pool);
  app.get('/api/teachers', async (req, res) => res.json((await connection.query('SELECT t.*,a.username FROM teachers t LEFT JOIN accounts a ON a.teacher_id=t.id'))[0]));
  app.get('/api/students', async (req, res) => res.json((await connection.query('SELECT * FROM students'))[0]));
  app.get('/api/classes/:id/students', async (req, res) => res.json((await connection.query('SELECT s.* FROM students s JOIN class_students cs ON cs.student_id=s.id WHERE cs.class_id=?', [Number(req.params.id)]))[0]));
  app.get('/api/invoices', async (req,res) => res.json((await connection.query('SELECT i.*,s.name AS student_name FROM invoices i JOIN students s ON s.id=i.student_id'))[0]));
  app.post('/api/students',async(req,res)=>{const {name,phone='',parentName='',parentPhone=''}=req.body;const [result]=await connection.query('INSERT INTO students (name,phone,parentName,parentPhone) VALUES (?,?,?,?)',[name,phone,parentName,parentPhone]);res.json({id:result.insertId});});
  app.put('/api/students/:id',async(req,res)=>{const {name,phone='',parentName='',parentPhone=''}=req.body;await connection.query('UPDATE students SET name=?,phone=?,parentName=?,parentPhone=? WHERE id=?',[name,phone,parentName,parentPhone,req.params.id]);res.json({success:true});});

  app.post('/api/teachers',async(req,res)=>{const {name,role,phone=''}=req.body;await connection.beginTransaction();try{const [result]=await connection.query('INSERT INTO teachers (name,role,phone) VALUES (?,?,?)',[name,Number(role),phone]);const username=await createTeacherAccount(connection,result.insertId,name);await connection.commit();res.json({id:result.insertId,username});}catch(error){await connection.rollback();throw error;}});
  app.put('/api/teachers/:id',async(req,res)=>{const {name,role,phone=''}=req.body;await connection.query('UPDATE teachers SET name=?,role=?,phone=? WHERE id=?',[name,Number(role),phone,req.params.id]);res.json({success:true});});
  app.delete('/api/teachers/:id',async(req,res)=>{await connection.query('DELETE FROM teachers WHERE id=?',[req.params.id]);res.json({success:true});});
  app.post('/api/classes/:id/students',async(req,res)=>{await connection.query('INSERT INTO class_students (class_id,student_id) VALUES (?,?)',[req.params.id,req.body.student_id]);res.json({success:true});});
  app.delete('/api/classes/:id/students/:studentId',async(req,res)=>{await connection.query('DELETE FROM class_students WHERE class_id=? AND student_id=?',[req.params.id,req.params.studentId]);res.json({success:true});});
  app.post('/api/invoices',async(req,res)=>{const {student_id,amount,status}=req.body;await connection.query('INSERT INTO invoices (invoice_code,student_id,amount,status) VALUES (?,?,?,?)',[`INV-${randomUUID()}`,student_id,amount,status]);res.json({success:true});});
  app.get('/api/dashboard/stats', (req, res) => res.json({ totalStudents: 0, totalClasses: 1, revenue: 0 }));
  registerTeachingSessions(app, pool);
  registerStudentAttendance(app, pool);
  app.use((error, req, res, _next) => res.status(error.status || 500).json({ error: error.message }));
  return { app, sqlite, state, connection };
}
