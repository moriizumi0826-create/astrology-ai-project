import gspread
from google.oauth2.service_account import Credentials
import collections

SERVICE_ACCOUNT_FILE = 'credentials.json'
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
SPREADSHEET_URL = "https://docs.google.com/spreadsheets/d/16cCiiuY531RP8XSNn-IzEbNlKougFm-AwbzMJXjxJUs/edit"

def scan_spreadsheet_data():
    try:
        credentials = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        client = gspread.authorize(credentials)
        sh = client.open_by_url(SPREADSHEET_URL)
        
        worksheets = sh.worksheets()
        report = []

        print("スプレッドシートの全シートをスキャニング中...")
        
        for ws in worksheets:
            print(f"調査中: {ws.title}")
            data = ws.get_all_values()
            if not data:
                continue
            
            headers = data[0]
            rows = data[1:]
            
            sheet_issues = collections.defaultdict(lambda: {"empty_count": 0, "dash_count": 0, "sample": ""})
            
            for row in rows:
                for idx, cell in enumerate(row):
                    if idx >= len(headers): continue
                    col_name = headers[idx]
                    
                    val = cell.strip()
                    if val == "":
                        sheet_issues[col_name]["empty_count"] += 1
                    elif val == "-" or val == "ー":
                        sheet_issues[col_name]["dash_count"] += 1
                    
                    # サンプルとして1つだけ保持
                    if not sheet_issues[col_name]["sample"] and len(val) > 10:
                        sheet_issues[col_name]["sample"] = val[:50] + "..."

            # 統計を整理
            for col, stats in sheet_issues.items():
                if stats["empty_count"] > 0 or stats["dash_count"] > 0:
                    report.append({
                        "sheet": ws.title,
                        "column": col,
                        "empty": stats["empty_count"],
                        "dash": stats["dash_count"],
                        "total_rows": len(rows),
                        "sample": stats["sample"]
                    })

        print("\n--- 調査レポート（要改善箇所） ---")
        for item in report:
            print(f"Sheet: {item['sheet']}, Column: {item['column']}")
            print(f"  空欄: {item['empty']}, '-'等: {item['dash']} / 全 {item['total_rows']} 行")
            # print(f"  サンプル: {item['sample']}")
        
    except Exception as e:
        print(f"Error during scan: {e}")

if __name__ == "__main__":
    scan_spreadsheet_data()
