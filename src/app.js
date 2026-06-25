const express = require('express');
const path = require('path');
const db = require('./db');
const { calcPayroll } = require('./payroll');
const v = require('./validation');

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
  const errs = v.validateStaff(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join(' / ') });
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

// スタッフを編集（更新）
app.put('/api/staff/:id', (req, res) => {
  const errs = v.validateStaff(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join(' / ') });
  const exists = db.prepare('SELECT id FROM staff WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'スタッフが見つかりません' });
  const { name, pay_type, hourly_rate, monthly_salary, daily_rate, drink_back_rate, transport_fee } = req.body;
  db.prepare(
    'UPDATE staff SET name=?, pay_type=?, hourly_rate=?, monthly_salary=?, daily_rate=?, drink_back_rate=?, transport_fee=? WHERE id=?'
  ).run(
    name,
    pay_type,
    hourly_rate || 0,
    monthly_salary || 0,
    daily_rate || 0,
    drink_back_rate || 0,
    transport_fee || 0,
    req.params.id
  );
  res.json({ success: true });
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
  const errs = v.validateAttendance(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join(' / ') });
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
  const errs = v.validateMonthly(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join(' / ') });
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

  // 控除（住民税など）を取得
  const deductions = db.prepare(
    'SELECT name, amount FROM deductions WHERE staff_id = ? AND year_month = ? ORDER BY id'
  ).all(staffId, yearMonth);

  // 給与計算（ロジックは純粋関数 src/payroll.js に委譲）
  const result = calcPayroll(staff, attendances, monthly, deductions);

  res.json({
    staff,
    yearMonth,
    drinkBackRate: staff.drink_back_rate,
    ...result
  });
});

// 月次集計（全員分）: 対象月の全スタッフの給与を計算し、各行＋合計を返す
app.get('/api/summary/:yearMonth', (req, res) => {
  const { yearMonth } = req.params;
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    return res.status(400).json({ error: '対象年月が不正です (YYYY-MM)' });
  }

  const staffList = db.prepare('SELECT * FROM staff ORDER BY id').all();

  // 各スタッフについて、給与計算API と同じ手順で計算する（ロジックは calcPayroll に集約）
  const rows = staffList.map((staff) => {
    const attendances = db.prepare(
      "SELECT * FROM attendance WHERE staff_id = ? AND work_date LIKE ? ORDER BY work_date"
    ).all(staff.id, `${yearMonth}%`);
    const monthly = db.prepare(
      'SELECT work_days, drink_count FROM monthly_data WHERE staff_id = ? AND year_month = ?'
    ).get(staff.id, yearMonth) || { work_days: 0, drink_count: 0 };
    const deductions = db.prepare(
      'SELECT name, amount FROM deductions WHERE staff_id = ? AND year_month = ? ORDER BY id'
    ).all(staff.id, yearMonth);
    const r = calcPayroll(staff, attendances, monthly, deductions);
    return {
      staffId: staff.id,
      name: staff.name,
      payType: staff.pay_type,
      workDays: r.workDays,
      basePay: r.basePay,
      drinkBack: r.drinkBack,
      transportFee: r.transportFee,
      grossPay: r.grossPay,
      withholdingTax: r.withholdingTax,
      otherDeductions: r.otherDeductions,
      netPay: r.netPay
    };
  });

  // 合計（整数のまま加算）
  const totals = rows.reduce((t, r) => ({
    basePay: t.basePay + r.basePay,
    drinkBack: t.drinkBack + r.drinkBack,
    transportFee: t.transportFee + r.transportFee,
    grossPay: t.grossPay + r.grossPay,
    withholdingTax: t.withholdingTax + r.withholdingTax,
    otherDeductions: t.otherDeductions + r.otherDeductions,
    netPay: t.netPay + r.netPay
  }), { basePay: 0, drinkBack: 0, transportFee: 0, grossPay: 0, withholdingTax: 0, otherDeductions: 0, netPay: 0 });

  res.json({ yearMonth, count: rows.length, rows, totals });
});

// 月次データの前月コピー: from(YYYY-MM) の出勤日数・ドリンク杯数を to へ複製
// 既に to に入力があるスタッフは上書きしない（非破壊）
app.post('/api/monthly/copy', (req, res) => {
  const { from, to } = req.body || {};
  if (!/^\d{4}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}$/.test(to || '')) {
    return res.status(400).json({ error: '年月(from/to)が不正です (YYYY-MM)' });
  }
  if (from === to) {
    return res.status(400).json({ error: 'コピー元と先が同じ月です' });
  }

  const src = db.prepare(
    'SELECT staff_id, work_days, drink_count FROM monthly_data WHERE year_month = ?'
  ).all(from);
  const existsStmt = db.prepare('SELECT 1 FROM monthly_data WHERE staff_id = ? AND year_month = ?');
  const insertStmt = db.prepare(
    'INSERT INTO monthly_data (staff_id, year_month, work_days, drink_count) VALUES (?, ?, ?, ?)'
  );

  let copied = 0, skipped = 0;
  // ※ libsqlのリモート(Turso)では db.transaction() が使えないため個別に実行する（非破壊＝既存スキップは維持）
  for (const row of src) {
    if (existsStmt.get(row.staff_id, to)) { skipped++; continue; } // 既存は触らない
    insertStmt.run(row.staff_id, to, row.work_days, row.drink_count);
    copied++;
  }

  res.json({ copied, skipped, sourceRows: src.length });
});

// --- 控除（住民税など）API ---

// 控除を取得（スタッフ×対象月）
app.get('/api/deductions/:staffId/:yearMonth', (req, res) => {
  const { staffId, yearMonth } = req.params;
  const rows = db.prepare(
    'SELECT id, name, amount FROM deductions WHERE staff_id = ? AND year_month = ? ORDER BY id'
  ).all(staffId, yearMonth);
  res.json(rows);
});

// 控除を保存（スタッフ×対象月で全置換）。items = [{ name, amount }, ...]（空配列＝控除なし）
app.post('/api/deductions', (req, res) => {
  const errs = v.validateDeductions(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join(' / ') });
  const { staff_id, year_month, items } = req.body;

  const delStmt = db.prepare('DELETE FROM deductions WHERE staff_id = ? AND year_month = ?');
  const insStmt = db.prepare(
    'INSERT INTO deductions (staff_id, year_month, name, amount) VALUES (?, ?, ?, ?)'
  );

  // その月の控除をいったん消してから入れ直す（編集＝全置換）
  // ※ libsqlのリモート(Turso)では db.transaction() が「cannot rollback」エラーになるため個別に実行する
  delStmt.run(staff_id, year_month);
  for (const it of items) {
    insStmt.run(staff_id, year_month, String(it.name).trim(), it.amount || 0);
  }

  res.json({ success: true, count: items.length });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`Bar Deploy 給与明細アプリが起動しました: http://localhost:${PORT}`);
});
