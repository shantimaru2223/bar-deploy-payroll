// 入力検証（純粋関数）。サーバ側を「正」とし、各APIで利用する。
// 各関数はエラーメッセージ（日本語）の配列を返す。空配列＝OK。

// 0以上の整数か（"1200" のような数値文字列も許容）
function isNonNegInt(v) {
  if (v === undefined || v === null || v === '') return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/; // 00:00〜23:59
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;        // YYYY-MM-DD
const YM_RE = /^\d{4}-\d{2}$/;                // YYYY-MM

// スタッフ登録・編集の検証
function validateStaff(b) {
  const e = [];
  if (!b || !String(b.name || '').trim()) e.push('名前は必須です');
  if (!['hourly', 'daily', 'monthly'].includes(b && b.pay_type)) e.push('給与タイプが不正です');
  for (const f of ['hourly_rate', 'monthly_salary', 'daily_rate', 'drink_back_rate', 'transport_fee']) {
    // 未指定・空欄は0扱い（許容）。値があるなら0以上の整数のみ。
    if (b && b[f] !== undefined && b[f] !== '' && !isNonNegInt(b[f])) {
      e.push(`${f} は0以上の整数で入力してください`);
    }
  }
  return e;
}

// 勤怠（1日分）の検証。日またぎ（終了≦開始）はエラーにしない（計算側で +24h）。
function validateAttendance(b) {
  const e = [];
  if (!isNonNegInt(b && b.staff_id)) e.push('スタッフIDが不正です');
  if (!DATE_RE.test((b && b.work_date) || '') || isNaN(Date.parse(b && b.work_date))) {
    e.push('勤務日が不正です (YYYY-MM-DD)');
  }
  if (!TIME_RE.test((b && b.start_time) || '')) e.push('開始時刻が不正です (HH:MM)');
  if (!TIME_RE.test((b && b.end_time) || '')) e.push('終了時刻が不正です (HH:MM)');
  return e;
}

// 月次データ（出勤日数・半休回数・ドリンク杯数・賞与・備考）の検証
function validateMonthly(b) {
  const e = [];
  if (!isNonNegInt(b && b.staff_id)) e.push('スタッフIDが不正です');
  if (!YM_RE.test((b && b.year_month) || '')) e.push('対象年月が不正です (YYYY-MM)');
  // 出勤日数は0.5日単位（半休）で0〜31
  const days = Number(b && b.work_days);
  const daysOk = b && b.work_days !== '' && b.work_days !== null && Number.isInteger(days * 2) && days >= 0 && days <= 31;
  if (!daysOk) e.push('出勤日数は0〜31の0.5日単位で入力してください');
  // うち半休の回数（任意）。空欄は0。半休の数と「.5」の有無が合っていること（例: 2.5日なら半休は奇数回）
  const halfRaw = b && b.half_days;
  const half = (halfRaw === undefined || halfRaw === null || halfRaw === '') ? 0 : halfRaw;
  if (!isNonNegInt(half)) {
    e.push('半休の回数は0以上の整数で入力してください');
  } else if (daysOk && (Number(half) > days * 2 || (days * 2 - Number(half)) % 2 !== 0)) {
    e.push('半休の回数と出勤日数が合いません（例: 2.5日なら半休は1回・3回…）');
  }
  if (!isNonNegInt(b && b.drink_count)) e.push('ドリンク杯数は0以上の整数で入力してください');
  // 賞与は任意。未指定・空欄は0扱い、値があるなら0以上の整数のみ
  if (b && b.bonus !== undefined && b.bonus !== null && b.bonus !== '' && !isNonNegInt(b.bonus)) {
    e.push('賞与は0以上の整数（円）で入力してください');
  }
  // 備考は任意。文字列で500文字まで
  const note = b && b.note;
  if (note !== undefined && note !== null && (typeof note !== 'string' || note.length > 500)) {
    e.push('備考は500文字以内で入力してください');
  }
  return e;
}

// 控除（住民税など）の検証。items は {name, amount} の配列。空配列（控除なし）も許容。
function validateDeductions(b) {
  const e = [];
  if (!isNonNegInt(b && b.staff_id)) e.push('スタッフIDが不正です');
  if (!YM_RE.test((b && b.year_month) || '')) e.push('対象年月が不正です (YYYY-MM)');
  const items = b && b.items;
  if (!Array.isArray(items)) {
    e.push('控除データが不正です');
    return e;
  }
  items.forEach((it, i) => {
    if (!it || !String(it.name || '').trim()) e.push(`控除${i + 1}行目: 項目名は必須です`);
    if (!isNonNegInt(it && it.amount)) e.push(`控除${i + 1}行目: 金額は0以上の整数で入力してください`);
  });
  return e;
}

module.exports = { validateStaff, validateAttendance, validateMonthly, validateDeductions, isNonNegInt };
