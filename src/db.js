const Database = require('libsql');
const path = require('path');

// 接続先を環境変数で切り替える（書き方は同じまま、ローカルとクラウド両対応）
// - TURSO_DATABASE_URL がある（本番Render）→ Tursoクラウドに接続し、再デプロイしてもデータが消えない
// - 無い（ローカル開発・テスト）→ 今まで通りプロジェクト直下の data.db ファイル
const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN;

const db = tursoUrl
  ? new Database(tursoUrl, { authToken: tursoAuthToken }) // 本番: Tursoクラウド（消えない保管庫）
  : new Database(path.join(__dirname, '..', 'data.db'));  // ローカル: ファイル（従来通り）

// どちらに接続したかを起動ログに出す（鍵などの秘密情報は出さない）
console.log(tursoUrl ? '[DB] Tursoクラウドに接続しました' : '[DB] ローカルファイル(data.db)に接続しました');

// テーブルが無ければ作成する
db.exec(`
  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    pay_type TEXT NOT NULL DEFAULT 'hourly',
    hourly_rate INTEGER DEFAULT 0,
    monthly_salary INTEGER DEFAULT 0,
    daily_rate INTEGER DEFAULT 0,
    drink_back_rate INTEGER DEFAULT 0,
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

// 月ごとにまとめて入力するデータ（日給の出勤日数・ドリンク杯数）
// スタッフ×対象月で1件に限定する
db.exec(`
  CREATE TABLE IF NOT EXISTS monthly_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    year_month TEXT NOT NULL,
    work_days INTEGER DEFAULT 0,
    drink_count INTEGER DEFAULT 0,
    UNIQUE(staff_id, year_month),
    FOREIGN KEY (staff_id) REFERENCES staff(id)
  )
`);

// 控除（住民税・社会保険料など）。スタッフ×対象月で複数行を保存する
db.exec(`
  CREATE TABLE IF NOT EXISTS deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    year_month TEXT NOT NULL,
    name TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (staff_id) REFERENCES staff(id)
  )
`);

// 既存DBに列が無い場合だけ追加する（データを壊さない安全な更新）
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}
addColumnIfMissing('staff', 'daily_rate', 'INTEGER DEFAULT 0');
addColumnIfMissing('staff', 'drink_back_rate', 'INTEGER DEFAULT 0');

module.exports = db;
