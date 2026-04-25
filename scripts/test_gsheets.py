import gspread
from google.oauth2.service_account import Credentials
import datetime

# 認証用JSONファイルのパス
SERVICE_ACCOUNT_FILE = 'credentials.json'

# スコープの設定
# 読み取り、書き込み、ドライブ操作の権限を指定
SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive'
]

def test_connection():
    try:
        print("認証を開始します...")
        credentials = Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE,
            scopes=SCOPES
        )
        
        # クライアントの初期化
        client = gspread.authorize(credentials)
        
        # スプレッドシートのURL（ユーザー提供）
        spreadsheet_url = "https://docs.google.com/spreadsheets/d/16cCiiuY531RP8XSNn-IzEbNlKougFm-AwbzMJXjxJUs/edit"
        
        print(f"スプレッドシートを開いています: {spreadsheet_url}")
        sh = client.open_by_url(spreadsheet_url)
        
        # 最初のシートを選択
        worksheet = sh.get_worksheet(0)
        
        print("セルへの書き込みを実行しています...")
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # A1セルにメッセージ、B1セルにタイムスタンプ
        worksheet.update_cell(1, 1, "Hello from Astrology AI!")
        worksheet.update_cell(1, 2, f"Success at: {now}")
        
        print("\n[SUCCESS] Connection Test Successful!")
        print(f"Sheet Title: {sh.title}")
        print(f"Written Content: [A1] Hello from Astrology AI!, [B1] {now}")
        print("Please refresh your spreadsheet to confirm.")

    except Exception as e:
        print(f"\n[ERROR] An error occurred: {e}")

if __name__ == "__main__":
    test_connection()
