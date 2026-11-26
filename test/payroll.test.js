const test = require('node:test');
const assert = require('node:assert');
const { calcPayroll } = require('../src/payroll');

// 時給: 570分(9.5h)×1200円, 出勤2日, ドリンク3杯×500, 片道250
test('hourly', () => {
  const staff = { pay_type: 'hourly', hourly_rate: 1200, monthly_salary: 0, daily_rate: 0, drink_back_rate: 500, transport_fee: 250 };
  const att = [{ work_minutes: 300 }, { work_minutes: 270 }];
  const r = calcPayroll(staff, att, { work_days: 0, drink_count: 3 });
  assert.equal(r.workDays, 2);
  assert.equal(r.basePay, 11400);
  assert.equal(r.drinkBack, 1500);
  assert.equal(r.transportFee, 1000);   // 250×2×2
  assert.equal(r.withholdingTax, 1317); // floor((11400+1500)*0.1021)
  assert.equal(r.grossPay, 13900);
  assert.equal(r.netPay, 12583);
});

// 日給: 日当10000×10日, 片道5000, ドリンク0
test('daily', () => {
  const staff = { pay_type: 'daily', hourly_rate: 0, monthly_salary: 0, daily_rate: 10000, drink_back_rate: 0, transport_fee: 5000 };
  const r = calcPayroll(staff, [], { work_days: 10, drink_count: 0 });
  assert.equal(r.workDays, 10);
  assert.equal(r.basePay, 100000);
  assert.equal(r.transportFee, 100000);  // 5000×2×10
  assert.equal(r.withholdingTax, 10210);
  assert.equal(r.grossPay, 200000);
  assert.equal(r.netPay, 189790);
});

// 月給: 200000, 勤怠未登録→出勤0日→交通費0
test('monthly', () => {
  const staff = { pay_type: 'monthly', hourly_rate: 0, monthly_salary: 200000, daily_rate: 0, drink_back_rate: 0, transport_fee: 300 };
  const r = calcPayroll(staff, [], { work_days: 0, drink_count: 0 });
  assert.equal(r.basePay, 200000);
  assert.equal(r.transportFee, 0);
  assert.equal(r.withholdingTax, 20420);
  assert.equal(r.netPay, 179580);
});

// 境界: 日給0日 → 全0
test('daily zero days', () => {
  const staff = { pay_type: 'daily', daily_rate: 10000, drink_back_rate: 0, transport_fee: 5000, hourly_rate: 0, monthly_salary: 0 };
  const r = calcPayroll(staff, [], { work_days: 0, drink_count: 0 });
  assert.equal(r.grossPay, 0);
  assert.equal(r.netPay, 0);
});

// 月給で出勤日数を入力 → 交通費が計算される（基本給は月給で固定）
test('monthly with work days for transport', () => {
  const staff = { pay_type: 'monthly', hourly_rate: 0, monthly_salary: 200000, daily_rate: 0, drink_back_rate: 0, transport_fee: 300 };
  const r = calcPayroll(staff, [], { work_days: 20, drink_count: 0 });
  assert.equal(r.basePay, 200000);       // 月給は固定
  assert.equal(r.workDays, 20);          // 月次データの出勤日数を使用
  assert.equal(r.transportFee, 12000);   // 300×2×20
  assert.equal(r.grossPay, 212000);      // 200000 + 0 + 12000
  assert.equal(r.withholdingTax, 20420); // floor(200000×0.1021)
  assert.equal(r.netPay, 191580);        // 212000 − 20420
});

// その他控除（住民税・社会保険料）→ 差引支給からさらに引く
test('other deductions', () => {
  const staff = { pay_type: 'daily', hourly_rate: 0, monthly_salary: 0, daily_rate: 10000, drink_back_rate: 0, transport_fee: 5000 };
  const ded = [{ name: '住民税', amount: 8000 }, { name: '社会保険料', amount: 12000 }];
  const r = calcPayroll(staff, [], { work_days: 10, drink_count: 0 }, ded);
  assert.equal(r.grossPay, 200000);       // 100000 + 交通費100000
  assert.equal(r.withholdingTax, 10210);  // floor(100000×0.1021)
  assert.equal(r.otherDeductions, 20000); // 8000 + 12000
  assert.equal(r.totalDeductions, 30210); // 10210 + 20000
  assert.equal(r.netPay, 169790);         // 200000 − 30210
});

// 控除を渡さない場合は従来通り（後方互換）
test('no deductions arg = backward compatible', () => {
  const staff = { pay_type: 'daily', daily_rate: 10000, drink_back_rate: 0, transport_fee: 5000, hourly_rate: 0, monthly_salary: 0 };
  const r = calcPayroll(staff, [], { work_days: 10, drink_count: 0 });
  assert.equal(r.otherDeductions, 0);
  assert.equal(r.netPay, 189790); // 200000 − 10210（源泉のみ）
});

// 賞与あり → 総支給に加算し、源泉徴収（10.21%）の対象にも含める
test('bonus', () => {
  const staff = { pay_type: 'daily', hourly_rate: 0, monthly_salary: 0, daily_rate: 10000, drink_back_rate: 0, transport_fee: 5000 };
  const r = calcPayroll(staff, [], { work_days: 10, drink_count: 0, bonus: 50000 });
  assert.equal(r.bonus, 50000);
  assert.equal(r.taxableBase, 150000);    // 基本給100000 + 賞与50000（交通費は対象外）
  assert.equal(r.withholdingTax, 15315);  // floor(150000×0.1021)
  assert.equal(r.grossPay, 250000);       // 100000 + 50000 + 交通費100000
  assert.equal(r.netPay, 234685);         // 250000 − 15315
});

// 賞与なし（列が無い旧データ・null）→ 0円扱いで従来通り
test('bonus missing or null = 0', () => {
  const staff = { pay_type: 'daily', daily_rate: 10000, drink_back_rate: 0, transport_fee: 5000, hourly_rate: 0, monthly_salary: 0 };
  for (const m of [{ work_days: 10, drink_count: 0 }, { work_days: 10, drink_count: 0, bonus: null }, { work_days: 10, drink_count: 0, bonus: 0 }]) {
    const r = calcPayroll(staff, [], m);
    assert.equal(r.bonus, 0);
    assert.equal(r.netPay, 189790);
  }
});

// 勤務分数の計算（登録・更新で共用）。終了≦開始は翌日終了として +24時間
const { calcWorkMinutes } = require('../src/payroll');
test('calcWorkMinutes', () => {
  assert.equal(calcWorkMinutes('18:00', '23:30'), 330);  // 同日
  assert.equal(calcWorkMinutes('22:00', '03:00'), 300);  // 日またぎ
  assert.equal(calcWorkMinutes('22:00', '05:00'), 420);  // 日またぎ
  assert.equal(calcWorkMinutes('00:00', '23:59'), 1439); // 境界: 最長の同日勤務
  assert.equal(calcWorkMinutes('10:00', '10:00'), 1440); // 境界: 同時刻は24時間扱い（従来ロジックと同じ）
});

// --- 0.5日単位（半休）---
// 日給: 日当9999×2.5日（全日2回＋半休1回）→ 24997.5円は切り捨て。交通費は半休も往復1回
test('daily half day: floor and transport counts half day as a round trip', () => {
  const staff = { pay_type: 'daily', hourly_rate: 0, monthly_salary: 0, daily_rate: 9999, drink_back_rate: 0, transport_fee: 1000 };
  const r = calcPayroll(staff, [], { work_days: 2.5, half_days: 1, drink_count: 0 });
  assert.equal(r.workDays, 2.5);
  assert.equal(r.halfDays, 1);
  assert.equal(r.commuteDays, 3);        // 全日2回＋半休1回
  assert.equal(r.basePay, 24997);        // floor(9999×2.5)
  assert.equal(r.transportFee, 6000);    // 1000×2×3回
  assert.ok(Number.isInteger(r.withholdingTax));
  assert.ok(Number.isInteger(r.netPay));
});

// 半休2回で合計整数日（全日2回＋半休2回＝3日）→ 交通費は4回分
test('daily two half days make integer days but 4 commutes', () => {
  const staff = { pay_type: 'daily', hourly_rate: 0, monthly_salary: 0, daily_rate: 10000, drink_back_rate: 0, transport_fee: 500 };
  const r = calcPayroll(staff, [], { work_days: 3, half_days: 2, drink_count: 0 });
  assert.equal(r.basePay, 30000);
  assert.equal(r.commuteDays, 4);
  assert.equal(r.transportFee, 4000);    // 500×2×4
});

// 境界: 半休1回のみ（0.5日）
test('daily only one half day', () => {
  const staff = { pay_type: 'daily', hourly_rate: 0, monthly_salary: 0, daily_rate: 10001, drink_back_rate: 0, transport_fee: 300 };
  const r = calcPayroll(staff, [], { work_days: 0.5, half_days: 1, drink_count: 0 });
  assert.equal(r.basePay, 5000);         // floor(5000.5)
  assert.equal(r.transportFee, 600);     // 300×2×1回
});

// 半休回数なし（旧データ）→ 出勤回数＝日数で従来通り
test('half_days missing = 0 (backward compatible)', () => {
  const staff = { pay_type: 'daily', daily_rate: 10000, drink_back_rate: 0, transport_fee: 5000, hourly_rate: 0, monthly_salary: 0 };
  const r = calcPayroll(staff, [], { work_days: 10, drink_count: 0 });
  assert.equal(r.halfDays, 0);
  assert.equal(r.commuteDays, 10);
  assert.equal(r.netPay, 189790);
});

// 月給: 基本給は固定、交通費だけ半休を往復1回で数える
test('monthly half day transport', () => {
  const staff = { pay_type: 'monthly', hourly_rate: 0, monthly_salary: 200000, daily_rate: 0, drink_back_rate: 0, transport_fee: 300 };
  const r = calcPayroll(staff, [], { work_days: 19.5, half_days: 1, drink_count: 0 });
  assert.equal(r.basePay, 200000);
  assert.equal(r.transportFee, 12000);   // 300×2×20回
});

// 時給は勤怠の登録日数のまま（半休の入力は無視）
test('hourly ignores half_days', () => {
  const staff = { pay_type: 'hourly', hourly_rate: 1200, monthly_salary: 0, daily_rate: 0, drink_back_rate: 0, transport_fee: 250 };
  const r = calcPayroll(staff, [{ work_minutes: 60 }], { work_days: 0, half_days: 3, drink_count: 0 });
  assert.equal(r.commuteDays, 1);
  assert.equal(r.transportFee, 500);
});

// 備考は計算に影響せずそのまま返す
test('note passthrough', () => {
  const staff = { pay_type: 'daily', daily_rate: 10000, drink_back_rate: 0, transport_fee: 0, hourly_rate: 0, monthly_salary: 0 };
  assert.equal(calcPayroll(staff, [], { work_days: 1, drink_count: 0, note: '11/3 半休' }).note, '11/3 半休');
  assert.equal(calcPayroll(staff, [], { work_days: 1, drink_count: 0 }).note, '');
});
