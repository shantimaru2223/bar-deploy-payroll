const Database = require('better-sqlite3');
const path = require('path');

// データベースファイルをプロジェクト直下に作成
const dbPath = path.join(__dirname, '..', 'data.db');
const db = new Database(dbPath);

// テーブルが無ければ作成する
db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pay_type TEXT NOT NULL DEFAULT 'hourly',
    hourly_rate INTEGER DEFAULT 0,
    monthly_salary INTEGER DEFAULT 0,
    transport_fee INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    work_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    work_minutes INTEGER NOT NULL,
    FOREIGN KEY (staff_id) REFERENCES staff(id)
  )
`);

module.exports = db;
