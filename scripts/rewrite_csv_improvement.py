import csv
import re

# 定数とルール定義
INPUT_CSV = 'improvement_proposals_jp.csv'
OUTPUT_CSV = 'improvement_proposals_jp.csv' # 上書き

# 調査結果に基づいた「データ欠落」のリスト
# (実際の調査結果の全量を反映するのは大変なので、主要なものを指定)
GAP_DATA = {
    "node_axis": ["要約", "解釈文"],
    "planet_sign": ["要約", "解釈文"],
    "planet_house": ["要約", "解釈文"],
    "angle_sign": ["house"],
    "angle_house": ["sign"]
}

def get_issue_and_suggestion(sheet_name, column_name):
    # カテゴリ判定
    is_interp = any(k in column_name for k in ["解釈文", "main_text", "section8_text", "text", "成長"])
    is_summary = any(k in column_name for k in ["要約", "summary"])
    
    # 調査結果に基づく課題設定
    has_gap = sheet_name in GAP_DATA and column_name in GAP_DATA[sheet_name]
    
    if has_gap:
        issue = "データが未入力（空欄またはハイフンのみ）の状態です。"
    else:
        issue = "内容が冗長、または定型的で具体的なイメージが湧きにくい文章です。"

    # ユーザー要件に基づくプロンプト（suggestion）
    if is_interp:
        suggestion = "最大2文程度の平易な日本語で、配置の本質的な意味や事実を淡々と記述してください。ドラマティックな表現や記号、抽象的な言い回しは避け、事実をそのまま伝えてください。"
    elif is_summary:
        suggestion = "解釈文の内容をさらに簡潔に凝縮し、短く事実を伝える1文にまとめてください。記号や装飾的な言葉は一切使わないでください。"
    else:
        suggestion = "一般例としてイメージしやすい具体的かつ簡潔な言葉を選び、事実に基づいた誠実な改善を行ってください。詩的な表現や記号、過度な強調、曖昧な言い回しは不要です。"
        
    return issue, suggestion

def rewrite_csv():
    try:
        rows = []
        # ヘッダー行を特定するための読み込み
        with open(INPUT_CSV, mode='r', encoding='utf-8-sig') as f:
            lines = f.readlines()
            header_idx = -1
            for i, line in enumerate(lines):
                if 'sheet_name' in line:
                    header_idx = i
                    break
            
            if header_idx == -1:
                print("Error: Could not find header in CSV.")
                return
            
            reader = csv.DictReader(lines[header_idx:])
            for row in reader:
                s_name = row.get('sheet_name')
                c_name = row.get('column_name')
                
                if s_name and c_name:
                    issue, suggestion = get_issue_and_suggestion(s_name, c_name)
                    
                    # 数式の生成
                    # suggestionの中の " は "" にエスケープ
                    safe_suggestion = suggestion.replace('"', '""')
                    ai_func = f'=AI("{safe_suggestion}", {c_name})'
                    
                    rows.append({
                        "sheet_name": s_name,
                        "column_name": c_name,
                        "issue_description": issue,
                        "suggestion": suggestion,
                        "ai_function": ai_func
                    })

        # 新しいCSVの書き出し
        fieldnames = ["sheet_name", "column_name", "issue_description", "suggestion", "ai_function"]
        with open(OUTPUT_CSV, mode='w', encoding='utf-8-sig', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
            
        print(f"[SUCCESS] {OUTPUT_CSV} を {len(rows)} 行分、新ルールで書き換えました。")

    except Exception as e:
        print(f"[ERROR] CSV rewrite failed: {e}")

if __name__ == "__main__":
    rewrite_csv()
