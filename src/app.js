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
  const { name, pay_type, hourly_rate, monthly_salary, daily_rate, drink_back_rate, transport_fee } = req.body;
  const stmt = db.prepare(
    'INSERT INTO staff (name, pay_type, hourly_rate, monthly_salary, daily_rate, drink_back_rate, transport_fee) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const result = stmt.run(
    name,
    pay_type,
    hourly_rate || 0,
    monthly_salary || 0,
    daily_rate || 0,
    drink_back_rate || 0,
    transport_fee || 0
  );
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

// 月次データを取得（出勤日数・ドリンク杯数）。無ければ0を返す
app.get('/api/monthly/:staffId/:yearMonth', (req, res) => {
  const { staffId, yearMonth } = req.params;
  const row = db.prepare(
    'SELECT work_days, drink_count FROM monthly_data WHERE staff_id = ? AND year_month = ?'
  ).get(staffId, yearMonth);
  res.json(row || { work_days: 0, drink_count: 0 });
});

// 月次データを保存（スタッフ×月で1件にまとめる＝あれば上書き）
app.post('/api/monthly', (req, res) => {
  const { staff_id, year_month, work_days, drink_count } = req.body;
  db.prepare(`
    INSERT INTO monthly_data (staff_id, year_month, work_days, drink_count)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(staff_id, year_month)
    DO UPDATE SET work_days = excluded.work_days, drink_count = excluded.drink_count
  `).run(staff_id, year_month, work_days || 0, drink_count || 0);
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

  // 対象月の勤怠データを取得（時給スタッフの勤務時間集計に使う）
  const attendances = db.prepare(
    "SELECT * FROM attendance WHERE staff_id = ? AND work_date LIKE ? ORDER BY work_date"
  ).all(staffId, `${yearMonth}%`);

  // 月次データ（日給の出勤日数・ドリンク杯数）を取得。無ければ0
  const monthly = db.prepare(
    'SELECT work_days, drink_count FROM monthly_data WHERE staff_id = ? AND year_month = ?'
  ).get(staffId, yearMonth) || { work_days: 0, drink_count: 0 };

  // 総勤務分数を計算（時給用）
  const totalMinutes = attendances.reduce((sum, a) => sum + a.work_minutes, 0);

  // 出勤日数・基本給の計算（給与タイプで分岐）
  let basePay;
  let workDays;
  if (staff.pay_type === 'hourly') {
    // 時給: 勤怠の登録日数＝出勤日数、分単位で計算し端数切り捨て
    workDays = attendances.length;
    basePay = Math.floor(totalMinutes / 60 * staff.hourly_rate);
  } else if (staff.pay_type === 'daily') {
    // 日給: 入力された出勤日数 × 日当
    workDays = monthly.work_days;
    basePay = staff.daily_rate * workDays;
  } else {
    // 月給: そのまま
    workDays = attendances.length;
    basePay = staff.monthly_salary;
  }

  // ドリンクバック = 杯数 × 単価（全タイプ共通）
  const drinkCount = monthly.drink_count;
  const drinkBack = drinkCount * staff.drink_back_rate;

  // 源泉徴収の対象 = 交通費以外（基本給 + ドリンクバック）
  const taxableBase = basePay + drinkBack;
  // 源泉徴収税額（対象額の10.21%、端数切り捨て）
  const withholdingTax = Math.floor(taxableBase * 0.1021);

  // 交通費 = 片道運賃 × 2（往復）× 出勤日数
  const transportFare = staff.transport_fee; // 登録値は「片道」の運賃
  const transportFee = transportFare * 2 * workDays;

  // 総支給額 = 基本給 + ドリンクバック + 交通費
  const grossPay = basePay + drinkBack + transportFee;

  // 差引支給額 = 総支給額 - 源泉徴収税額
  const netPay = grossPay - withholdingTax;

  res.json({
    staff,
    yearMonth,
    workDays,
    totalMinutes,
    basePay,
    drinkCount,
    drinkBackRate: staff.drink_back_rate,
    drinkBack,
    transportFare,
    transportFee,
    taxableBase,
    withholdingTax,
    grossPay,
    netPay
  });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Bar Deploy 給与明細アプリが起動しました: http://localhost:${PORT}`);
});
