# 2026年11月 可変日付段落 執筆ガイド

共通仕様は `monthly_overview_editorial_writing_guidelines.md`。対象は `M_Monthly_Overview_Event_Paragraphs_2026_11.csv`。

## 条件と件数

- sign_ingress: 太陽SCORPIO→SAGITTARIUS、火星LEO→VIRGOの2件 × 144行 = 288行。
- natal_house_ingress: 太陽SCORPIO/SAGITTARIUS、水星SCORPIO、金星LIBRA、火星LEO/VIRGO、木星LEOの7区間 × 12行 = 84行。
- 水星SCORPIOと金星LIBRAは月初の逆行から順行へ転じるため、逆方向の隣接ハウス移動を各12行追加する。合計108行。
- 全体396行。逆行追加行はPlanet・Sign・From→Toが異なる独立条件。過去月の構造とIDは変更しない。
- 逆行・順行転換自体はEvent行を増やさず、基本総評等に反映する。

## 執筆

- 編集列はParagraph_TemplateとActive_Flag。固定条件列を変更しない。
- 同一イベント・条件の12行を一単位にし、90–240文字、2–3文の完成段落を書く。
- `{event_date}` を必ず含め、固定日付や未知トークンを入れない。
- 太陽の射手座入りは、信頼や共有を深く確かめた後に、視野・学び・将来像を広げる流れ。Solarの前後とNatalでの生活実感を両方記述する。
- 火星の乙女座入りは、表現や見せ方へ向けていた意欲を、具体的な手順、精度、分担へ移す流れ。完璧さの強要にしない。
- ネイタルハウス移動はFromで何を扱い、Toで何へ重点が移るかを書く。逆方向行は順行行のハウス番号を入れ替えた文にせず、見直し先へ戻る意味を書く。
- 同じ星座に戻る日付ではなく、対象者のカスプ計算から得た移動日を使う。

## 検証

再生成した396行との条件比較、文字数、日付トークン、完全・意味重複、文字化け、実際の条件一致と日付差し込みを検証してからActive_Flagを1にする。

`python scripts/validate_monthly_overview_event_templates.py <対象CSV> --database-dir database`
