// 給与計算（純粋関数）
// app.js の従来ロジックと出力を完全に一致させる。DB・Express に依存しないため
// Node のバージョンに関係なくテスト可能。
// deductions（控除）は省略可。渡さなければ「その他控除なし」として従来通り計算する。
function calcPayroll(staff, attendances, monthly, deductions) {
  const m = monthly || { work_days: 0, drink_count: 0 };
  const deductionList = Array.isArray(deductions) ? deductions : [];

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
    // 月給: 基本給は月給で固定。出勤日数は交通費の計算用に月次データから取得する
    workDays = m.work_days;
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

  // その他控除（住民税・社会保険料など）の合計。金額は整数（円）で扱う
  const otherDeductions = deductionList.reduce((sum, d) => sum + (d.amount || 0), 0);

  // 総支給額・控除合計・差引支給額
  const grossPay = basePay + drinkBack + transportFee;
  const totalDeductions = withholdingTax + otherDeductions; // 源泉徴収 ＋ その他控除
  const netPay = grossPay - totalDeductions;

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
    deductions: deductionList, // その他控除の明細（項目名・金額）
    otherDeductions,           // その他控除の合計
    totalDeductions,           // 源泉徴収 ＋ その他控除
    grossPay,
    netPay
  };
}

module.exports = { calcPayroll };
