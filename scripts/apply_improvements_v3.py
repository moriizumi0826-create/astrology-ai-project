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

def escape_for_formula(text):
    """Excel/Google Sheets数式用にダブルクォーテーションをエスケープ"""
    if not text:
        return ""
    return text.replace('"', '""')

def apply_improvements_v3():
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
            # 本当のヘッダー行（sheet_nameが含まれる行）が見つかるまでスキップ
            lines = f.readlines()
            header_idx = -1
            for i, line in enumerate(lines):
                if 'sheet_name' in line:
                    header_idx = i
                    break
            
            if header_idx == -1:
                print("CSV内に 'sheet_name' ヘッダーが見つかりませんでした。")
                return
            
            # ヘッダー行以降を使用してDictReaderを作成
            reader = csv.DictReader(lines[header_idx:])
            for row in reader:
                if row.get('sheet_name') and row.get('column_name'):
                    proposals.append(row)

        if not proposals:
            print("適用可能な改善案が見つかりませんでした。データを確認してください。")
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
                
                # A. 既存の[改善案]列を削除（クリーンアップ）
                headers = ws.row_values(1)
                to_delete = []
                for i, h in enumerate(headers):
                    if h.startswith("[改善案]"):
                        to_delete.append(i + 1)
                
                if to_delete:
                    print(f"  不完全な列を削除中: {to_delete}")
                    # インデックスがずれないように後ろから削除
                    for col_idx in sorted(to_delete, reverse=True):
                        ws.delete_columns(col_idx)
                    # 削除後にヘッダーとデータ情報を再取得
                    headers = ws.row_values(1)
                
                all_values = ws.get_all_values()
                if not all_values:
                    continue
                
                row_count = len(all_values)
                col_count = len(headers)
                col_name_to_idx = {name: i + 1 for i, name in enumerate(headers)}
                
                new_columns_data = []
                format_requests = []
                
                # B. 新しい形式で追記
                for i, prop in enumerate(sheet_proposals):
                    target_col_name = prop['column_name']
                    prompt = prop['suggestion']
                    
                    if target_col_name not in col_name_to_idx:
                        print(f"  警告: 列 '{target_col_name}' が見つかりません。スキップ。")
                        continue
                        
                    orig_col_idx = col_name_to_idx[target_col_name]
                    orig_col_letter = column_index_to_letter(orig_col_idx)
                    new_col_idx = col_count + len(new_columns_data) + 1
                    
                    # プロンプトのエスケープ
                    safe_prompt = escape_for_formula(prompt)
                    
                    new_col_values = [f"[改善案] {target_col_name}"]
                    for r in range(2, row_count + 1):
                        # 形式: =AI("改善案の文章", D2)
                        formula = f'=AI("{safe_prompt}", {orig_col_letter}{r})'
                        new_col_values.append(formula)
                    
                    new_columns_data.append(new_col_values)
                    
                    # 書式設定（薄い黄色）
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
                                    "backgroundColor": {"red": 1.0, "green": 0.98, "blue": 0.77}
                                }
                            },
                            "fields": "userEnteredFormat.backgroundColor"
                        }
                    })

                if new_columns_data:
                    # グリッド制限を確認し、必要なら列を追加
                    current_max_cols = ws.col_count
                    required_max_cols = col_count + len(new_columns_data)
                    if required_max_cols > current_max_cols:
                        cols_to_add = required_max_cols - current_max_cols
                        print(f"  グリッドを拡張中: {cols_to_add} 列追加")
                        ws.add_cols(cols_to_add)

                    print(f"  {len(new_columns_data)} 列を追加・更新中...")
                    start_col_letter = column_index_to_letter(col_count + 1)
                    end_col_letter = column_index_to_letter(col_count + len(new_columns_data))
                    range_str = f"{start_col_letter}1:{end_col_letter}{row_count}"
                    
                    combined_data = []
                    for r in range(row_count):
                        row_data = []
                        for c_data in new_columns_data:
                            row_data.append(c_data[r])
                        combined_data.append(row_data)
                    
                    # 修正: 正しい位置引数 (values, range_name) またはキーワード引数を使用
                    ws.update(values=combined_data, range_name=range_str, value_input_option='USER_ENTERED')
                    
                    print("  書式設定を適用中...")
                    sh.batch_update({"requests": format_requests})
                
                print(f"  シート '{sheet_name}' 完了")
                time.sleep(1)

            except Exception as e:
                print(f"  エラー (シート {sheet_name}): {e}")

        print("\n[SUCCESS] すべての改善案の再適用が完了しました。")

    except Exception as e:
        print(f"\n[ERROR] 致命的なエラー: {e}")

if __name__ == "__main__":
    apply_improvements_v3()
