// 給与計算（純粋関数）
// app.js の従来ロジックと出力を完全に一致させる。DB・Express に依存しないため
// Node のバージョンに関係なくテスト可能。
function calcPayroll(staff, attendances, monthly) {
  const m = monthly || { work_days: 0, drink_count: 0 };

  // 総勤務分数（時給用）
  const totalMinutes = attendances.reduce((sum, a) => sum + a.work_minutes, 0);

  // 出勤日数・基本給（給与タイプで分岐）
  let basePay;
  let workDays;
  if (staff.pay_type === 'hourly') {
    // 時給: 勤怠の登録日数＝出勤日数、分単位で計算し端数切り捨て
    workDays = attendances.length;
    basePay = Math.floor(totalMinutes / 60 * staff.hourly_rate);
  } else if (staff.pay_type === 'daily') {
    // 日給: 入力された出勤日数 × 日当
    workDays = m.work_days;
    basePay = staff.daily_rate * workDays;
  } else {
    // 月給: そのまま
    workDays = attendances.length;
    basePay = staff.monthly_salary;
  }

  // ドリンクバック = 杯数 × 単価（全タイプ共通）
  const drinkCount = m.drink_count;
  const drinkBack = drinkCount * staff.drink_back_rate;

  // 源泉徴収の対象 = 交通費以外（基本給 + ドリンクバック）、税率10.21%・端数切り捨て
  const taxableBase = basePay + drinkBack;
  const withholdingTax = Math.floor(taxableBase * 0.1021);

  // 交通費 = 片道運賃 × 2（往復）× 出勤日数
  const transportFare = staff.transport_fee; // 登録値は「片道」の運賃
  const transportFee = transportFare * 2 * workDays;

  // 総支給額・差引支給額
  const grossPay = basePay + drinkBack + transportFee;
  const netPay = grossPay - withholdingTax;

  return {
    workDays,
    totalMinutes,
    basePay,
    drinkCount,
    drinkBack,
    transportFare,
    transportFee,
    taxableBase,
    withholdingTax,
    grossPay,
    netPay
  };
}

module.exports = { calcPayroll };
