const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

// JSON・フォームデータの受け取りを有効にする
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静的ファイル（HTML/CSS/JS）の配信
app.use(express.static(path.join(__dirname, 'public')));

// --- APIルート ---

// スタッフ一覧を取得
app.get('/api/staff', (req, res) => {
  const staff = db.prepare('SELECT * FROM staff ORDER BY id').all();
  res.json(staff);
});

// スタッフを登録
app.post('/api/staff', (req, res) => {
  const { name, pay_type, hourly_rate, monthly_salary, transport_fee } = req.body;
  const stmt = db.prepare(
    'INSERT INTO staff (name, pay_type, hourly_rate, monthly_salary, transport_fee) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(name, pay_type, hourly_rate || 0, monthly_salary || 0, transport_fee || 0);
  res.json({ id: result.lastInsertRowid });
});

// スタッフを削除
app.delete('/api/staff/:id', (req, res) => {
  db.prepare('DELETE FROM staff WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 勤怠データを取得（スタッフID・対象年月で絞り込み）
app.get('/api/attendance/:staffId/:yearMonth', (req, res) => {
  const { staffId, yearMonth } = req.params;
  const rows = db.prepare(
    "SELECT * FROM attendance WHERE staff_id = ? AND work_date LIKE ? ORDER BY work_date"
  ).all(staffId, `${yearMonth}%`);
  res.json(rows);
});

// 勤怠データを登録
app.post('/api/attendance', (req, res) => {
  const { staff_id, work_date, start_time, end_time } = req.body;

  // 勤務時間を分単位で計算（日またぎ対応）
  const [sh, sm] = start_time.split(':').map(Number);
  const [eh, em] = end_time.split(':').map(Number);
  let work_minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (work_minutes <= 0) {
    // 日をまたぐ場合（例: 19:00〜翌3:00）→ +24時間分を加算
    work_minutes += 24 * 60;
  }

  const stmt = db.prepare(
    'INSERT INTO attendance (staff_id, work_date, start_time, end_time, work_minutes) VALUES (?, ?, ?, ?, ?)'
  );
  const result = stmt.run(staff_id, work_date, start_time, end_time, work_minutes);
  res.json({ id: result.lastInsertRowid });
});

// 勤怠データを削除
app.delete('/api/attendance/:id', (req, res) => {
  db.prepare('DELETE FROM attendance WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// 給与計算
app.get('/api/payroll/:staffId/:yearMonth', (req, res) => {
  const { staffId, yearMonth } = req.params;

  // スタッフ情報を取得
  const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(staffId);
  if (!staff) {
    return res.status(404).json({ error: 'スタッフが見つかりません' });
  }

  // 対象月の勤怠データを取得
  const attendances = db.prepare(
    "SELECT * FROM attendance WHERE staff_id = ? AND work_date LIKE ? ORDER BY work_date"
  ).all(staffId, `${yearMonth}%`);

  // 総勤務分数を計算
  const totalMinutes = attendances.reduce((sum, a) => sum + a.work_minutes, 0);
  const workDays = attendances.length;

  // 基本給の計算（給与タイプで分岐）
  let basePay;
  if (staff.pay_type === 'hourly') {
    // 時給: 分単位で計算し端数切り捨て
    basePay = Math.floor(totalMinutes / 60 * staff.hourly_rate);
  } else {
    // 月給: そのまま
    basePay = staff.monthly_salary;
  }

  // 源泉徴収税額の計算（基本給の10.21%、端数切り捨て）
  const withholdingTax = Math.floor(basePay * 0.1021);

  // 総支給額 = 基本給 + 交通費
  const grossPay = basePay + staff.transport_fee;

  // 差引支給額 = 総支給額 - 源泉徴収税額
  const netPay = grossPay - withholdingTax;

  res.json({
    staff,
    yearMonth,
    workDays,
    totalMinutes,
    basePay,
    transportFee: staff.transport_fee,
    withholdingTax,
    grossPay,
    netPay
  });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Bar Deploy 給与明細アプリが起動しました: http://localhost:${PORT}`);
});
