# 設計書 - Bar Deploy 給与明細アプリ

## 1. 技術スタック

| 項目 | 技術 | 選定理由 |
|---|---|---|
| フロントエンド | HTML / CSS / JavaScript | シンプルで学習コストが低い |
| バックエンド | Node.js（Express） | 軽量で小規模アプリに最適 |
| データベース | SQLite（better-sqlite3） | サーバー不要、ファイル1つで管理できる |
| PDF出力 | pdfmake / html2pdf.js | JavaScript だけでPDF生成が可能 |
| テスト | node:test（Node標準） | 追加依存なしでユニットテストが書ける |

> **比喩**: 技術スタックとは「お店を建てるときの建材の選択」のようなものです。
> 小規模なお店に合った、シンプルで扱いやすい材料を選んでいます。

## 2. 画面構成

```
[トップページ]（タブ切替）
  ├── スタッフ管理画面
  │     ├── スタッフ登録／編集フォーム（同じフォームを編集モードで再利用）
  │     └── スタッフ一覧（編集・削除）
  ├── 勤怠入力画面
  │     ├── 対象月の選択
  │     ├── 月次データ（出勤日数・ドリンク杯数）
  │     └── 日ごとの勤務時間入力（時給スタッフ）
  └── 給与明細画面
        ├── 明細プレビュー
        └── PDF出力ボタン
```

## 3. モジュール構成

| ファイル | 役割 |
|---|---|
| `src/app.js` | Expressサーバー・全APIルート |
| `src/db.js` | SQLite接続・テーブル定義 |
| `src/payroll.js` | 給与計算の純粋関数 `calcPayroll`（DB非依存） |
| `src/validation.js` | 入力検証 `validateStaff` / `validateAttendance` / `validateMonthly`（サーバ側を正とする） |
| `src/public/index.html` | 画面（スタッフ管理・勤怠入力・給与明細） |
| `test/` | `payroll.test.js` / `validation.test.js`（`node --test`） |

> **比喩**: 計算と検証を「独立した部品」に切り出すと、サーバを起動しなくても
> 部品だけ取り出して動作確認（テスト）できます。電卓を本体から外して試すイメージです。

## 4. データ設計

### 4.1 スタッフテーブル（staff）
| カラム名 | 型 | 説明 |
|---|---|---|
| id | INTEGER | 主キー（自動採番） |
| name | TEXT | スタッフ名 |
| pay_type | TEXT | 給与タイプ（"hourly" / "daily" / "monthly"） |
| hourly_rate | INTEGER | 時給（円）※時給スタッフ |
| daily_rate | INTEGER | 日当（円）※日給スタッフ |
| monthly_salary | INTEGER | 月給額（円）※月給スタッフ |
| drink_back_rate | INTEGER | ドリンク単価（円/杯） |
| transport_fee | INTEGER | 交通費（**片道**・円） |
| created_at | TEXT | 登録日時 |

### 4.2 勤怠テーブル（attendance）※時給スタッフのシフト
| カラム名 | 型 | 説明 |
|---|---|---|
| id | INTEGER | 主キー |
| staff_id | INTEGER | スタッフID（外部キー） |
| work_date | TEXT | 勤務日（YYYY-MM-DD） |
| start_time | TEXT | 開始時間（HH:MM） |
| end_time | TEXT | 終了時間（HH:MM） |
| work_minutes | INTEGER | 勤務時間（**分**単位で保存） |

### 4.3 月次データテーブル（monthly_data）※月ごとにまとめる値
| カラム名 | 型 | 説明 |
|---|---|---|
| id | INTEGER | 主キー |
| staff_id | INTEGER | スタッフID（外部キー） |
| year_month | TEXT | 対象年月（YYYY-MM） |
| work_days | INTEGER | 出勤日数（日給用） |
| drink_count | INTEGER | ドリンク杯数 |
| （制約） | UNIQUE | (staff_id, year_month) で1件 |

## 5. 給与計算ロジック（src/payroll.js）

```
【基本給】
  時給 → Math.floor(総勤務分 / 60 * 時給)
  日給 → 日当 × 出勤日数
  月給 → 月給額（そのまま）

【加算】
  ドリンクバック = ドリンク杯数 × ドリンク単価
  交通費        = 片道運賃 × 2（往復）× 出勤日数

【控除】
  源泉徴収税額 = Math.floor((基本給 + ドリンクバック) × 0.1021)  ※交通費は対象外

【結果】
  総支給額   = 基本給 + ドリンクバック + 交通費
  差引支給額 = 総支給額 - 源泉徴収税額
```

※ 出勤日数の数え方: 時給＝勤怠の登録日数 / 日給＝入力した出勤日数 / 月給＝勤怠の登録日数
※ 勤務時間: 終了 ≦ 開始 のときは「翌日終了」として +24時間（画面に明示）

## 6. 入力検証（src/validation.js）
- **staff**: 名前は必須、pay_type は3種のいずれか、各金額は0以上の整数
- **attendance**: work_date は YYYY-MM-DD、start/end は HH:MM
- **monthly**: year_month は YYYY-MM、出勤日数は0〜31、ドリンク杯数は0以上
- 違反時はサーバが 400 を返し、画面側でも送信前に赤字で即時表示する

## 7. PDF出力の内容
画面の明細プレビューをそのまま html2pdf.js でPDF化する。基本給・ドリンクバック（杯数×単価）・
交通費（片道×2×日数）・総支給額・源泉徴収税額・差引支給額を記載する。

## 8. 今後の拡張予定（将来対応）
- ログイン認証（個人情報の保護）
- 深夜手当（22時以降の割増計算）
- 月別の支給履歴一覧・明細の保存／前月コピー
- データのエクスポート（CSV）・全員分の一括PDF出力
