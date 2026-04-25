import gspread
from google.oauth2.service_account import Credentials

SERVICE_ACCOUNT_FILE = 'credentials.json'
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']

def list_all_sheets():
    try:
        credentials = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        client = gspread.authorize(credentials)
        spreadsheet_url = "https://docs.google.com/spreadsheets/d/16cCiiuY531RP8XSNn-IzEbNlKougFm-AwbzMJXjxJUs/edit"
        
        sh = client.open_by_url(spreadsheet_url)
        print(f"--- ファイル情報 ---")
        print(f"ファイル名 (Workbook Title): {sh.title}")
        
        worksheets = sh.worksheets()
        print(f"\n--- シート（タブ）一覧 ---")
        for i, ws in enumerate(worksheets):
            # 今回のテストで書き込んだのはインデックス0のシート
            status = "[書き込み対象]" if i == 0 else ""
            print(f"インデックス {i}: {ws.title} {status}")

    except Exception as e:
        print(f"エラー: {e}")

if __name__ == "__main__":
    list_all_sheets()
