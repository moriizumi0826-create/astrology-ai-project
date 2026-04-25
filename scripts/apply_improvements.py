import csv
import gspread
from google.oauth2.service_account import Credentials
import time
import re

# 認証設定
SERVICE_ACCOUNT_FILE = 'credentials.json'
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/16cCiiuY531RP8XSNn-IzEbNlKougFm-AwbzMJXjxJUs/edit"
CSV_FILE = 'improvement_proposals_jp.csv'

def column_index_to_letter(index):
    """1-based index to A, B, C..."""
    letter = ''
    while index > 0:
        index, remainder = divmod(index - 1, 26)
        letter = chr(65 + remainder) + letter
    return letter

def apply_improvements():
    try:
        # 1. 認証
        print("認証中...")
        credentials = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        client = gspread.authorize(credentials)
        sh = client.open_by_url(SPREADSHEET_URL)

        # 2. CSV読み込み
        print(f"CSV読み込み中: {CSV_FILE}")
        proposals = []
        with open(CSV_FILE, mode='r', encoding='utf-8-sig') as f:
            # 空行をスキップしてヘッダーを見つける
            lines = [line for line in f if line.strip()]
            if not lines:
                print("CSVが空です。")
                return
            
            reader = csv.DictReader(lines)
            for row in reader:
                if row.get('sheet_name'):
                    proposals.append(row)

        if not proposals:
            print("適用可能な改善案が見つかりませんでした。")
            return

        # シートごとにグループ化
        grouped_proposals = {}
        for p in proposals:
            s_name = p['sheet_name']
            if s_name not in grouped_proposals:
                grouped_proposals[s_name] = []
            grouped_proposals[s_name].append(p)

        # 3. 各シートへの適用
        for sheet_name, sheet_proposals in grouped_proposals.items():
            try:
                print(f"\n--- シート処理中: {sheet_name} ---")
                ws = sh.worksheet(sheet_name)
                
                # 現在のヘッダーとデータ行数を取得
                all_values = ws.get_all_values()
                if not all_values:
                    print(f"  警告: シート {sheet_name} が空です。スキップします。")
                    continue
                
                headers = all_values[0]
                row_count = len(all_values)
                col_count = len(headers)
                
                # 列名（日本語）からインデックスへのマップ作成
                col_name_to_idx = {name: i + 1 for i, name in enumerate(headers)}
                
                new_columns_data = [] # [[header, val2, val3...], ...]
                format_requests = []
                
                for i, prop in enumerate(sheet_proposals):
                    target_col_name = prop['column_name']
                    ai_func_template = prop['ai_function']
                    
                    if target_col_name not in col_name_to_idx:
                        # 特殊ケース: （空欄の列）などの場合
                        print(f"  警告: 列 '{target_col_name}' がシートに見つかりません。スキップします。")
                        continue
                    
                    # 元の列インデックスとアルファベット
                    orig_col_idx = col_name_to_idx[target_col_name]
                    orig_col_letter = column_index_to_letter(orig_col_idx)
                    
                    # 新しい列のインデックス
                    new_col_idx = col_count + len(new_columns_data) + 1
                    
                    # 数式の生成: AI_REWRITE(要約) -> AI_REWRITE(D2) のように変換
                    # 簡易的な置換（括弧の中身を置換）
                    formula_template = ai_func_template
                    # 実際の行番号は書き込み時に動的に変わるので、ここでは一旦プレースホルダ
                    
                    new_col_values = [f"[改善案] {target_col_name}"]
                    for r in range(2, row_count + 1):
                        row_formula = formula_template.replace(target_col_name, f"{orig_col_letter}{r}")
                        new_col_values.append(row_formula)
                    
                    new_columns_data.append(new_col_values)
                    
                    # フォーマットリクエストの準備 (背景色: #FFF9C4)
                    format_requests.append({
                        "repeatCell": {
                            "range": {
                                "sheetId": ws.id,
                                "startColumnIndex": new_col_idx - 1,
                                "endColumnIndex": new_col_idx,
                                "startRowIndex": 0,
                                "endRowIndex": row_count
                            },
                            "cell": {
                                "userEnteredFormat": {
                                    "backgroundColor": {
                                        "red": 1.0,
                                        "green": 0.98,
                                        "blue": 0.77
                                    }
                                }
                            },
                            "fields": "userEnteredFormat.backgroundColor"
                        }
                    })

                if not new_columns_data:
                    continue

                # 4. 列の追加とデータの書き込み
                # gspreadでは列を一括で追加して書き込む。
                # 効率化のため、各列のデータを結合して一括更新する。
                print(f"  {len(new_columns_data)} 列を追加してデータを書き込んでいます...")
                
                # 書き込み用範囲の特定 (例: Z1:AB100)
                start_col_letter = column_index_to_letter(col_count + 1)
                end_col_letter = column_index_to_letter(col_count + len(new_columns_data))
                range_str = f"{start_col_letter}1:{end_col_letter}{row_count}"
                
                # データを2次元配列に変換 (行優先)
                combined_data = []
                for r in range(row_count):
                    row_data = []
                    for c_data in new_columns_data:
                        row_data.append(c_data[r])
                    combined_data.append(row_data)
                
                ws.update(range_str, combined_data, value_input_option='USER_ENTERED')
                
                # 5. 書式設定の適用
                print("  書式設定（色付け）を適用中...")
                sh.batch_update({"requests": format_requests})
                
                print(f"  シート '{sheet_name}' の更新が完了しました。")
                
                # API制限回避のための短いウェイト
                time.sleep(1)

            except Exception as e:
                print(f"  エラー (シート {sheet_name}): {e}")

        print("\n[SUCCESS] All improvements have been applied!")

    except Exception as e:
        print(f"\n[ERROR] Fatall error: {e}")

if __name__ == "__main__":
    apply_improvements()
