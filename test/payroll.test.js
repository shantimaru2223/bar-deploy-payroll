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
