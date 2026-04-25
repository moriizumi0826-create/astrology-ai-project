import csv
import os

# 制約: 『』、「」、"" の使用禁止
FORBIDDEN_SYMBOLS = ['『', '』', '「', '」', '"']

def clean_text(text):
    for sym in FORBIDDEN_SYMBOLS:
        text = text.replace(sym, '')
    return text

def validate_data(rows):
    for row in rows:
        for item in row:
            if any(sym in str(item) for sym in FORBIDDEN_SYMBOLS):
                raise ValueError(f"Forbidden symbol found in: {item}")

# 共通データ
planets = ["SUN", "MOON", "MERCURY", "VENUS", "MARS", "JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO"]
signs = ["ARIES", "TAURUS", "GEMINI", "CANCER", "LEO", "VIRGO", "LIBRA", "SCORPIO", "SAGITTARIUS", "CAPRICORN", "AQUARIUS", "PISCES"]
aspects = [0, 60, 90, 120, 150, 180]

# --- 1. M_Basic_Interpretation (120 rows) ---
def generate_basic():
    headers = ["Planet_ID", "Sign_ID", "Text_General", "Text_Love", "Text_Work", "Text_Human", "Text_Health", "Energy_Score", "Priority"]
    rows = []
    
    # 簡易的なロジックで生成（実際には天体とサインの組み合わせに基づいたテキストを構築）
    meanings = {
        "SUN": "自己実現と人生の目的", "MOON": "感情の安定と私生活", "MERCURY": "思考回路とコミュニケーション",
        "VENUS": "価値観と愛着形成", "MARS": "行動力とトラブル対処", "JUPITER": "拡大とチャンスの所在",
        "SATURN": "責任と長期的な課題", "URANUS": "変化と独自の視点", "NEPTUNE": "直感と理想の投影", "PLUTO": "極限状態での再生力"
    }
    sign_traits = {
        "ARIES": "開拓精神と直感力", "TAURUS": "安定性と五感の充足", "GEMINI": "好奇心と情報の流動性",
        "CANCER": "心理的安全性と共感力", "LEO": "自己表現と創造的意欲", "VIRGO": "精緻な分析と実務能力",
        "LIBRA": "均衡と対人調整能力", "SCORPIO": "深層への没入と本質変容", "SAGITTARIUS": "理想追求と大局的視点",
        "CAPRICORN": "社会的成果と堅実な構造", "AQUARIUS": "独創的革新と普遍的視点", "PISCES": "境界の溶解と受容的癒し"
    }

    for p in planets:
        for s in signs:
            gen = clean_text(f"{meanings[p]}を{sign_traits[s]}で発揮する性質。独自の存在感を持つ。")
            love = clean_text(f"恋愛では{sign_traits[s]}を重視する。誠実な関係を望む。")
            work = clean_text(f"仕事では{sign_traits[s]}を活かした立ち回りが得意。成果を重視する。")
            human = clean_text(f"対人面では{sign_traits[s]}が表れやすい。適度な距離感を保つ。")
            health = clean_text(f"健康面では過度な集中に注意。バランスの良い生活を。")
            rows.append([p, s, gen, love, work, human, health, 70, 5])
            
    # 特定の見本行を上書き（ユーザーのサンプルに合わせる）
    # SUN ARIES
    rows[0] = ["SUN", "ARIES", 
               "活気に満ち溢れ新しいことに挑戦する性質。自己主張が強く開拓者精神を持つ",
               "恋愛では直球勝負で情熱的。一目惚れしやすく展開が早い",
               "仕事ではリーダーシップを発揮する。決断力が早くスタートアップ業務に最適",
               "対人面では正直で裏表がない。衝突を恐れずはっきり意見を言う",
               "健康面では頭部の怪我や発熱に注意。エネルギーの消耗が激しいため休息も重要",
               85, 10]
               
    validate_data(rows)
    return headers, rows

# --- 2. M_Aspect_Interpretation (600 rows) ---
def generate_aspect():
    headers = ["T_Planet", "N_Planet", "Aspect_Angle", "Category", "Text_Description", "Countdown_Label", "Score_Impact", "Priority", "Advised_Task"]
    rows = []
    
    aspect_names = {0: "合", 60: "好調", 90: "摩擦", 120: "調和", 150: "調整", 180: "対峙"}
    categories = ["Work", "Love", "Human", "General"]
    
    for tp in planets:
        for np in planets:
            for ang in aspects:
                cat = categories[(planets.index(tp) + planets.index(np)) % 4]
                desc = clean_text(f"トランジットの{tp}がネイタルの{np}に{ang}度の角度を形成。{aspect_names[ang]}の状態。")
                label = clean_text(f"{tp}の影響がピークに達するまで")
                task = clean_text(f"{tp}の力を意識して、{np}の領域を整理してください。")
                rows.append([f"TRANSIT_{tp}", f"NATAL_{np}", ang, cat, desc, label, 30, 5, task])
                
    # サンプル行を調整
    # TRANSIT_JUPITER, NATAL_SUN, 120
    # インデックス計算が面倒なので検索して置換
    for i in range(len(rows)):
        if rows[i][0] == "TRANSIT_JUPITER" and rows[i][1] == "NATAL_SUN" and rows[i][2] == 120:
            rows[i] = ["TRANSIT_JUPITER", "NATAL_SUN", 120, "Work", 
                       "12年に一度の仕事の拡大期。これまでの努力が認められ大きなチャンスが到来する",
                       "仕事の成功チャンス到来まで", 30, 9, 
                       "昇進の打診や転職活動など強気のアクションを起こすこと"]
            break

    validate_data(rows)
    return headers, rows

# --- 3. M_Daily_Vibe_Logic (40 rows) ---
def generate_vibe():
    headers = ["Event_Type", "Condition", "General_Instruction", "Work_Efficiency_Modifier", "Safety_Level", "Icon_Type"]
    rows = []
    
    # 基本の40行
    for i in range(40):
        rows.append(["TRANSIT", f"CONDITION_{i}", "日々の運勢に基づいたアドバイス。冷静な判断を。", 0, "NORMAL", "INFO"])
        
    # サンプル行
    rows[0] = ["RETROGRADE", "MERCURY", 
               "コミュニケーションの停滞や通信機器のトラブルが発生しやすい時期。確認を徹底すること",
               -20, "LOW", "WARNING"]
               
    validate_data(rows)
    return headers, rows

# --- 4. M_Countdown_Master (30 rows) ---
def generate_countdown():
    headers = ["Trigger_ID", "Target_Category", "Display_Title", "Threshold_Orb", "Progress_Max_Days"]
    rows = []
    
    for i in range(30):
        rows.append([f"TRIGGER_{i}", "General", "目標の達成まで", 5, 10])
        
    # サンプル行
    rows[0] = ["LUCKY_LOVE_VENUS", "Love", "最高の恋愛運モード突入まで", 5, 14]
    
    validate_data(rows)
    return headers, rows

# 実行と保存
def main():
    files = [
        ("M_Basic_Interpretation.csv", generate_basic),
        ("M_Aspect_Interpretation.csv", generate_aspect),
        ("M_Daily_Vibe_Logic.csv", generate_vibe),
        ("M_Countdown_Master.csv", generate_countdown)
    ]
    
    output_dir = "database"
    os.makedirs(output_dir, exist_ok=True)
    
    for filename, generator in files:
        h, r = generator()
        filepath = os.path.join(output_dir, filename)
        with open(filepath, 'w', encoding='utf-8', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(h)
            writer.writerows(r)
        print(f"Generated {filename}: {len(r)} rows.")

if __name__ == "__main__":
    main()
