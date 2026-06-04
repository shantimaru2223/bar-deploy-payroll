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
