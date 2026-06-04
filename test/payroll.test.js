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
