const test = require('node:test');
const assert = require('node:assert');
const { validateStaff, validateAttendance, validateMonthly } = require('../src/validation');

// --- スタッフ ---
test('staff ok', () => assert.deepEqual(
  validateStaff({ name: '山田', pay_type: 'hourly', hourly_rate: 1200, monthly_salary: 0, daily_rate: 0, drink_back_rate: 0, transport_fee: 250 }), []));
test('staff empty name', () => assert.ok(validateStaff({ name: '  ', pay_type: 'hourly' }).length > 0));
test('staff bad type', () => assert.ok(validateStaff({ name: 'A', pay_type: 'x' }).length > 0));
test('staff negative amount', () => assert.ok(validateStaff({ name: 'A', pay_type: 'hourly', hourly_rate: -1 }).length > 0));
test('staff non-integer amount', () => assert.ok(validateStaff({ name: 'A', pay_type: 'hourly', hourly_rate: 1.5 }).length > 0));

// --- 勤怠 ---
test('att ok overnight', () => assert.deepEqual(
  validateAttendance({ staff_id: 1, work_date: '2026-06-05', start_time: '19:00', end_time: '03:00' }), []));
test('att bad date', () => assert.ok(validateAttendance({ staff_id: 1, work_date: '2026/6/5', start_time: '19:00', end_time: '20:00' }).length > 0));
test('att bad time', () => assert.ok(validateAttendance({ staff_id: 1, work_date: '2026-06-05', start_time: '25:00', end_time: '20:00' }).length > 0));

// --- 月次 ---
test('monthly ok', () => assert.deepEqual(
  validateMonthly({ staff_id: 1, year_month: '2026-06', work_days: 10, drink_count: 3 }), []));
test('monthly days over', () => assert.ok(validateMonthly({ staff_id: 1, year_month: '2026-06', work_days: 32, drink_count: 0 }).length > 0));
test('monthly bad ym', () => assert.ok(validateMonthly({ staff_id: 1, year_month: '202606', work_days: 1, drink_count: 0 }).length > 0));

// 賞与: 空欄・未指定はOK、値があるなら0以上の整数のみ
const base = { staff_id: 1, year_month: '2026-06', work_days: 10, drink_count: 3 };
test('monthly bonus empty ok', () => {
  assert.deepEqual(validateMonthly({ ...base }), []);
  assert.deepEqual(validateMonthly({ ...base, bonus: '' }), []);
  assert.deepEqual(validateMonthly({ ...base, bonus: null }), []);
  assert.deepEqual(validateMonthly({ ...base, bonus: 0 }), []);
  assert.deepEqual(validateMonthly({ ...base, bonus: 300000 }), []);
});
test('monthly bonus invalid', () => {
  for (const bad of [-1, 1.5, 'abc', '1e3x']) {
    assert.ok(validateMonthly({ ...base, bonus: bad }).length > 0, `bonus=${bad}`);
  }
});

// 出勤日数: 0.5刻み・0〜31。半休回数: 0以上の整数で、日数と矛盾しないこと
test('monthly half-day ok', () => {
  for (const [d, h] of [[0.5, 1], [2.5, 1], [3, 2], ['2.5', '1'], [31, 0], [0, 0], [10, undefined], [10, '']]) {
    assert.deepEqual(validateMonthly({ ...base, work_days: d, half_days: h }), [], `days=${d} half=${h}`);
  }
});
test('monthly days invalid step/range', () => {
  for (const d of [0.3, 1.25, -0.5, 31.5, 'abc', '']) {
    assert.ok(validateMonthly({ ...base, work_days: d }).length > 0, `days=${d}`);
  }
});
test('monthly half_days inconsistent', () => {
  for (const [d, h] of [[2.5, 0], [3, 1], [1, 3], [2, -2], [2, 1.5], [2.5, 'x']]) {
    assert.ok(validateMonthly({ ...base, work_days: d, half_days: h }).length > 0, `days=${d} half=${h}`);
  }
});
test('monthly note', () => {
  assert.deepEqual(validateMonthly({ ...base, note: '11/3 半休（通院）' }), []);
  assert.deepEqual(validateMonthly({ ...base, note: '' }), []);
  assert.deepEqual(validateMonthly({ ...base, note: 'あ'.repeat(500) }), []);
  assert.ok(validateMonthly({ ...base, note: 'あ'.repeat(501) }).length > 0);
  assert.ok(validateMonthly({ ...base, note: 123 }).length > 0);
});
