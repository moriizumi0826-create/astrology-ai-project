import gspread
from google.oauth2.service_account import Credentials

SERVICE_ACCOUNT_FILE = 'credentials.json'
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/16cCiiuY531RP8XSNn-IzEbNlKougFm-AwbzMJXjxJUs/edit"

def check_errors():
    try:
        credentials = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        client = gspread.authorize(credentials)
        sh = client.open_by_url(SPREADSHEET_URL)
        
        # 代表してnode_sign_houseを確認
        ws = sh.worksheet("node_sign_house")
        
        # 最後の数列を取得
        all_values = ws.get_all_values()
        headers = all_values[0]
        last_col = len(headers)
        
        # 最後の列（改善版のはず）の2行目を確認
        # gspreadで数式を取得するには、value_render_option='FORMULA'が必要
        row2_formulas = ws.row_values(2, value_render_option='FORMULA')
        row2_values = ws.row_values(2) # 通常の表示値
        
        print(f"--- Sheet: node_sign_house ---")
        print(f"Total Columns: {last_col}")
        
        # 後ろから追加した列を探す
        for i in range(len(headers) - 5, len(headers)):
            col_name = headers[i]
            formula = row2_formulas[i] if i < len(row2_formulas) else "N/A"
            display_value = row2_values[i] if i < len(row2_values) else "N/A"
            
            print(f"Column {i+1}: {col_name}")
            print(f"  Formula: {formula}")
            print(f"  Display Value: {display_value}")
            print("-" * 10)

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_errors()
