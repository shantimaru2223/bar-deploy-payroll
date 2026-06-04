# Phase 1（入力・管理の信頼性）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans` を使い、タスク単位で実装する。各ステップはチェックボックス（`- [ ]`）で進捗管理。

**Goal:** スタッフ編集機能・入力バリデーション・フォームUX・給与計算のテスト化を、既存の挙動を壊さずに追加する。

**Architecture:** 給与計算と入力検証を DB 非依存の純粋関数（`src/payroll.js`, `src/validation.js`）に切り出し、`app.js` はそれらを呼ぶだけにする。`node:test`（追加依存なし）でユニットテスト。フロントは編集モードとクライアント検証を追加する。

**Tech Stack:** Node.js / Express, better-sqlite3, 素の HTML/JS, node:test

---

## File Structure
| ファイル | 責務 |
|---|---|
| `src/payroll.js`（新規） | `calcPayroll(staff, attendances, monthly)` 純粋関数 |
| `src/validation.js`（新規） | `validateStaff` / `validateAttendance` / `validateMonthly` ＋ヘルパ |
| `src/app.js`（変更） | payroll/validation を require、`PUT /api/staff/:id` 追加、各 POST にサーバ検証、計算を `calcPayroll` に置換 |
| `src/public/index.html`（変更） | 編集UI、クライアント検証＋インラインエラー、UX調整 |
| `test/payroll.test.js`（新規） | `calcPayroll` のユニットテスト |
| `test/validation.test.js`（新規） | 検証関数のユニットテスト |
| `package.json`（変更） | `"test": "node --test"` |
| `docs/design.md` / `docs/requirements.md`（変更） | 現状仕様へ更新 |

---

## Task 1: 給与計算を純粋関数に抽出（TDD）
**Files:** Create `src/payroll.js`, `test/payroll.test.js`; Modify `src/app.js`（現行 104–177 行の計算部）

- [ ] **Step 1: 失敗するテストを書く** — `test/payroll.test.js`

```js
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
```

- [ ] **Step 2: 失敗確認** — Run: `node --test test/payroll.test.js` → Expected: FAIL（`Cannot find module '../src/payroll'`）
- [ ] **Step 3: 実装** — `src/payroll.js`（現行ロジックと完全一致）

```js
// 給与計算（純粋関数）。app.js の従来ロジックと出力を完全一致させる。
function calcPayroll(staff, attendances, monthly) {
  const m = monthly || { work_days: 0, drink_count: 0 };
  const totalMinutes = attendances.reduce((s, a) => s + a.work_minutes, 0);
  let basePay, workDays;
  if (staff.pay_type === 'hourly') {
    workDays = attendances.length;
    basePay = Math.floor(totalMinutes / 60 * staff.hourly_rate);
  } else if (staff.pay_type === 'daily') {
    workDays = m.work_days;
    basePay = staff.daily_rate * workDays;
  } else {
    workDays = attendances.length;
    basePay = staff.monthly_salary;
  }
  const drinkCount = m.drink_count;
  const drinkBack = drinkCount * staff.drink_back_rate;
  const taxableBase = basePay + drinkBack;
  const withholdingTax = Math.floor(taxableBase * 0.1021);
  const transportFare = staff.transport_fee;
  const transportFee = transportFare * 2 * workDays;
  const grossPay = basePay + drinkBack + transportFee;
  const netPay = grossPay - withholdingTax;
  return { workDays, totalMinutes, basePay, drinkCount, drinkBack, transportFare, transportFee, taxableBase, withholdingTax, grossPay, netPay };
}
module.exports = { calcPayroll };
```

- [ ] **Step 4: 成功確認** — Run: `node --test test/payroll.test.js` → Expected: PASS（4件）
- [ ] **Step 5: app.js を置換** — 104–177 行の計算部を `calcPayroll` 呼び出しに置き換え、`res.json({ staff, yearMonth, ...result, drinkBackRate: staff.drink_back_rate })` を返す
- [ ] **Step 6: 回帰確認** — `npm start`（Node 22）→ preview で `/api/payroll/:id/:ym` が従来と同じ値
- [ ] **Step 7: commit** — `git commit -m "給与計算を純粋関数calcPayrollに抽出しテスト追加"`

---

## Task 2: 入力検証モジュール（TDD）
**Files:** Create `src/validation.js`, `test/validation.test.js`

- [ ] **Step 1: 失敗するテスト** — `test/validation.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const { validateStaff, validateAttendance, validateMonthly } = require('../src/validation');

test('staff ok', () => assert.deepEqual(validateStaff({ name: '山田', pay_type: 'hourly', hourly_rate: 1200, monthly_salary: 0, daily_rate: 0, drink_back_rate: 0, transport_fee: 250 }), []));
test('staff empty name', () => assert.ok(validateStaff({ name: ' ', pay_type: 'hourly' }).length > 0));
test('staff bad type', () => assert.ok(validateStaff({ name: 'A', pay_type: 'x' }).length > 0));
test('staff negative', () => assert.ok(validateStaff({ name: 'A', pay_type: 'hourly', hourly_rate: -1 }).length > 0));
test('att ok', () => assert.deepEqual(validateAttendance({ staff_id: 1, work_date: '2026-06-05', start_time: '19:00', end_time: '03:00' }), []));
test('att bad date', () => assert.ok(validateAttendance({ staff_id: 1, work_date: '2026/6/5', start_time: '19:00', end_time: '20:00' }).length > 0));
test('att bad time', () => assert.ok(validateAttendance({ staff_id: 1, work_date: '2026-06-05', start_time: '25:00', end_time: '20:00' }).length > 0));
test('monthly ok', () => assert.deepEqual(validateMonthly({ staff_id: 1, year_month: '2026-06', work_days: 10, drink_count: 3 }), []));
test('monthly days over', () => assert.ok(validateMonthly({ staff_id: 1, year_month: '2026-06', work_days: 32, drink_count: 0 }).length > 0));
```

- [ ] **Step 2: 失敗確認** — Run: `node --test test/validation.test.js` → FAIL
- [ ] **Step 3: 実装** — `src/validation.js`

```js
// 0以上の整数か（文字列の数値も許容）
function isNonNegInt(v) {
  if (v === undefined || v === null || v === '') return false;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0;
}
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YM_RE = /^\d{4}-\d{2}$/;

function validateStaff(b) {
  const e = [];
  if (!b || !String(b.name || '').trim()) e.push('名前は必須です');
  if (!['hourly', 'daily', 'monthly'].includes(b.pay_type)) e.push('給与タイプが不正です');
  for (const f of ['hourly_rate', 'monthly_salary', 'daily_rate', 'drink_back_rate', 'transport_fee']) {
    if (b[f] !== undefined && b[f] !== '' && !isNonNegInt(b[f])) e.push(`${f} は0以上の整数で入力してください`);
  }
  return e;
}
function validateAttendance(b) {
  const e = [];
  if (!isNonNegInt(b.staff_id)) e.push('スタッフIDが不正です');
  if (!DATE_RE.test(b.work_date || '') || isNaN(Date.parse(b.work_date))) e.push('勤務日が不正です (YYYY-MM-DD)');
  if (!TIME_RE.test(b.start_time || '')) e.push('開始時刻が不正です (HH:MM)');
  if (!TIME_RE.test(b.end_time || '')) e.push('終了時刻が不正です (HH:MM)');
  return e;
}
function validateMonthly(b) {
  const e = [];
  if (!isNonNegInt(b.staff_id)) e.push('スタッフIDが不正です');
  if (!YM_RE.test(b.year_month || '')) e.push('対象年月が不正です (YYYY-MM)');
  if (!isNonNegInt(b.work_days) || Number(b.work_days) > 31) e.push('出勤日数は0〜31で入力してください');
  if (!isNonNegInt(b.drink_count)) e.push('ドリンク杯数は0以上の整数で入力してください');
  return e;
}
module.exports = { validateStaff, validateAttendance, validateMonthly, isNonNegInt };
```

- [ ] **Step 4: 成功確認** — Run: `node --test` → Expected: PASS（payroll+validation 全件）
- [ ] **Step 5: commit** — `git commit -m "入力検証モジュールを追加しテスト整備"`

---

## Task 3: サーバ側検証 ＋ スタッフ編集API（`PUT /api/staff/:id`）
**Files:** Modify `src/app.js`

- [ ] **Step 1:** 先頭で `const { calcPayroll } = require('./payroll');` `const v = require('./validation');` を読み込む
- [ ] **Step 2:** `POST /api/staff` の冒頭で `const errs = v.validateStaff(req.body); if (errs.length) return res.status(400).json({ error: errs.join(' / ') });`
- [ ] **Step 3:** `PUT /api/staff/:id` を追加

```js
app.put('/api/staff/:id', (req, res) => {
  const errs = v.validateStaff(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join(' / ') });
  const exists = db.prepare('SELECT id FROM staff WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'スタッフが見つかりません' });
  const { name, pay_type, hourly_rate, monthly_salary, daily_rate, drink_back_rate, transport_fee } = req.body;
  db.prepare(`UPDATE staff SET name=?, pay_type=?, hourly_rate=?, monthly_salary=?, daily_rate=?, drink_back_rate=?, transport_fee=? WHERE id=?`)
    .run(name, pay_type, hourly_rate || 0, monthly_salary || 0, daily_rate || 0, drink_back_rate || 0, transport_fee || 0, req.params.id);
  res.json({ success: true });
});
```

- [ ] **Step 4:** `POST /api/attendance` 冒頭に `validateAttendance`、`POST /api/monthly` 冒頭に `validateMonthly` の400チェックを追加
- [ ] **Step 5: 動作確認** — `npm start` ＋ curl: 不正値で 400、正常で 200、存在しないidの PUT で 404
- [ ] **Step 6: commit** — `git commit -m "スタッフ編集API追加とサーバ側入力検証"`

---

## Task 4: フロント（編集UI＋クライアント検証＋UX）
**Files:** Modify `src/public/index.html`

- [ ] **Step 1:** スタッフ一覧の各行に「編集」ボタンを追加（`onclick="editStaff(id)"`）
- [ ] **Step 2:** 登録フォームを編集モード対応に：`editStaff(id)` で値を読み込み、保存先を `PUT /api/staff/:id`（新規は従来 POST）に分岐。フォーム見出し／ボタン文言を「編集」に切替、キャンセルで新規モードに戻す
- [ ] **Step 3:** クライアント検証：送信前に空名・負数・不正時刻をチェックし、各入力欄直下に赤字 `<span class="err">` を表示。妥当まで送信不可
- [ ] **Step 4:** UX：給与タイプ選択で不要欄を非表示、送信中はボタン `disabled`、成功メッセージ、`type="time"`/`type="date"`/`inputmode="numeric"`
- [ ] **Step 5:** 日またぎ表示：終了≦開始のとき見込み計算欄に「翌日終了として計算（◯時間◯分）」を表示
- [ ] **Step 6: 動作確認（preview）** — 登録／編集／削除、各種バリデーション、タイプ別の欄出し分け、日またぎ表示、コンソールエラー無し
- [ ] **Step 7: commit** — `git commit -m "スタッフ編集UI・クライアント検証・フォームUX改善"`

---

## Task 5: ドキュメント更新 ＋ package.json
**Files:** Modify `docs/design.md`, `docs/requirements.md`, `package.json`

- [ ] **Step 1:** `package.json` の `"test"` を `"node --test"` に
- [ ] **Step 2:** `docs/requirements.md`：給与タイプ3種・ドリンクバック・片道交通費（往復×出勤日数）・源泉の課税範囲（交通費以外）・スタッフ編集・入力検証を反映
- [ ] **Step 3:** `docs/design.md`：`work_hours`→`work_minutes` 表記修正、`monthly_data` テーブル、`daily_rate`/`drink_back_rate` 列、計算ロジック（ドリンク・交通費・源泉）、`calcPayroll`/検証の構成を反映
- [ ] **Step 4: commit** — `git commit -m "設計書・要件定義を現状仕様に更新"`

---

## Self-Review（spec との突合）
- 4.1 スタッフ編集 → Task 3/4 ✅
- 4.2 バリデーション（画面＋サーバ） → Task 2(検証)/3(サーバ)/4(画面) ✅
- 4.3 フォームUX → Task 4 ✅
- 4.4 日またぎ明示 → Task 4 Step5 ✅
- 5 calcPayroll 抽出 → Task 1 ✅
- 6 テスト → Task 1/2 ✅
- 成功基準5（docs一致） → Task 5 ✅
- Placeholder無し／型整合（`calcPayroll` 戻り値・`validate*` の引数名）一貫 ✅
