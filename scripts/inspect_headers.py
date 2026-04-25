import gspread
from google.oauth2.service_account import Credentials

SERVICE_ACCOUNT_FILE = 'credentials.json'
SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']

def inspect_sheets():
    try:
        credentials = Credentials.from_service_account_file(SERVICE_ACCOUNT_FILE, scopes=SCOPES)
        client = gspread.authorize(credentials)
        spreadsheet_url = "https://docs.google.com/spreadsheets/d/16cCiiuY531RP8XSNn-IzEbNlKougFm-AwbzMJXjxJUs/edit"
        
        sh = client.open_by_url(spreadsheet_url)
        worksheets = sh.worksheets()
        
        for ws in worksheets:
            header = ws.row_values(1)
            print(f"Sheet: {ws.title}")
            print(f"  Columns: {header}")
            print("-" * 20)

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_sheets()
