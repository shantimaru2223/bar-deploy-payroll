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
  // 出勤日数は0.5日単位（半休）。小数の誤差を避けるため「半日の数（整数）」に直して計算する
  let basePay;
  let workDays;
  let halfDays = 0;     // うち半休の回数
  let commuteDays;      // 実際に出勤した回数（半休も往復1回）＝交通費の計算に使う
  if (staff.pay_type === 'hourly') {
    // 時給: 勤怠の登録日数＝出勤日数、分単位で計算し端数切り捨て
    workDays = attendances.length;
    commuteDays = workDays;
    basePay = Math.floor(totalMinutes / 60 * staff.hourly_rate);
  } else {
    workDays = Number(m.work_days) || 0;
    halfDays = Number(m.half_days) || 0;
    const halfUnits = Math.round(workDays * 2);          // 例: 2.5日 → 5（半日×5）
    commuteDays = (halfUnits - halfDays) / 2 + halfDays; // 全日の回数 ＋ 半休の回数
    if (staff.pay_type === 'daily') {
      // 日給: 日当 × 出勤日数。0.5日で1円未満が出たら切り捨て
      basePay = Math.floor(staff.daily_rate * halfUnits / 2);
    } else {
      // 月給: 基本給は月給で固定。出勤日数は交通費の計算にだけ使う
      basePay = staff.monthly_salary;
    }
  }

  // ドリンクバック = 杯数 × 単価（全タイプ共通）
  const drinkCount = m.drink_count;
  const drinkBack = drinkCount * staff.drink_back_rate;

  // 賞与（任意）。未入力・旧データ（列なし）は0円扱い
  const bonus = m.bonus || 0;

  // 源泉徴収の対象 = 交通費以外（基本給 + ドリンクバック + 賞与）、税率10.21%・端数切り捨て
  const taxableBase = basePay + drinkBack + bonus;
  const withholdingTax = Math.floor(taxableBase * 0.1021);

  // 交通費 = 片道運賃 × 2（往復）× 出勤回数（半休の日も往復1回として数える）
  const transportFare = staff.transport_fee; // 登録値は「片道」の運賃
  const transportFee = transportFare * 2 * commuteDays;

  // その他控除（住民税・社会保険料など）の合計。金額は整数（円）で扱う
  const otherDeductions = deductionList.reduce((sum, d) => sum + (d.amount || 0), 0);

  // 総支給額・控除合計・差引支給額
  const grossPay = basePay + drinkBack + bonus + transportFee;
  const totalDeductions = withholdingTax + otherDeductions; // 源泉徴収 ＋ その他控除
  const netPay = grossPay - totalDeductions;

  return {
    workDays,
    halfDays,
    commuteDays,
    note: m.note || '', // 備考（計算には使わない）
    totalMinutes,
    basePay,
    drinkCount,
    drinkBack,
    bonus,
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

// 開始・終了（HH:MM）から勤務分数を計算する。終了≦開始は日をまたいだ（翌日終了）として +24時間
function calcWorkMinutes(startTime, endTime) {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  return minutes;
}

module.exports = { calcPayroll, calcWorkMinutes };
