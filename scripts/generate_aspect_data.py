import csv

planets = ["SUN", "MOON", "MERCURY", "VENUS", "MARS", "JUPITER", "SATURN", "URANUS", "NEPTUNE", "PLUTO"]
aspects = [0, 60, 90, 120, 150, 180]

# 簡略化したテンプレート辞書（実際にはさらに詳細に展開する）
meanings = {
    "SUN": {"keyword": "自己実現・目的", "action": "ビジョンを再確認する"},
    "MOON": {"keyword": "感情・安心感", "action": "メンタルケアを優先する"},
    "MERCURY": {"keyword": "知性・通信", "action": "情報の整理と伝達を行う"},
    "VENUS": {"keyword": "価値・調和", "action": "美的価値の構築を図る"},
    "MARS": {"keyword": "行動・突破", "action": "具体的アクションを開始する"},
    "JUPITER": {"keyword": "拡大・発展", "action": "リソースを拡張する"},
    "SATURN": {"keyword": "構造・制限", "action": "規律と構造を強化する"},
    "URANUS": {"keyword": "革新・変化", "action": "システムをアップデートする"},
    "NEPTUNE": {"keyword": "理想・直感", "action": "インスピレーションを取り入れる"},
    "PLUTO": {"keyword": "変容・極限", "action": "根本的な再構築を行う"}
}

aspect_meanings = {
    0: {"name": "合", "effect": "強調と合流", "impact": 80, "tone": "パワーが集中しています。"},
    60: {"name": "セクスタイル", "effect": "調和的協力", "impact": 40, "tone": "スムーズな連携が可能です。"},
    90: {"name": "スクエア", "effect": "摩擦と葛藤", "impact": -60, "tone": "システムに負荷がかかっています。"},
    120: {"name": "トライン", "effect": "安定的な発展", "impact": 70, "tone": "理想的な流れが形成されています。"},
    150: {"name": "クインカンクス", "effect": "微調整と訓練", "impact": -20, "tone": "微妙なズレを修正する必要があります。"},
    180: {"name": "オポジション", "effect": "対立と均衡", "impact": -40, "tone": "外部との調整が求められます。"}
}

data = []

for tp in planets:
    for np in planets:
        for angle in aspects:
            m_tp = meanings[tp]
            m_np = meanings[np]
            m_ang = aspect_meanings[angle]
            
            # カテゴリの選定
            category = "General"
            if tp in ["VENUS", "MOON"] and np in ["VENUS", "MOON"]: category = "Love"
            elif tp in ["SUN", "MARS", "SATURN"] or np in ["SUN", "MARS", "SATURN"]: category = "Work"
            elif tp == "MERCURY" or np == "MERCURY": category = "Human"
            elif tp in ["MOON", "MARS"] and angle in [90, 180]: category = "Health"
            
            # コンサルタント的な分析テキストの構築
            status_report = {
                0: "エネルギーが合流し、特定の領域にパワーが集中しています。強力な推進力が生まれますが、盲点が生じやすい時期です。",
                60: "スムーズな連携パスが通っています。異なるリソースを組み合わせることで、副次的なメリットを享受できる好機です。",
                90: "システム間で深刻な摩擦が発生しています。旧来のやり方と新しい衝動が衝突し、エネルギーロスが生じています。",
                120: "理想的なエコシステムが形成されています。特に意識せずとも、物事が効率的に、かつ望ましい方向へ流れるでしょう。",
                150: "規格の異なるシステム同士を接続するような、高度な調整が求められています。微調整と訓練が必須のフェーズです。",
                180: "外部要因との対峙、あるいは内部的な均衡の崩れが顕在化しています。明確な合意形成か、バランスの再構築が必要です。"
            }
            
            analysis = f"{tp}の動力が{np}の基盤に作用しています。{status_report[angle]}"
            score = m_ang['impact']
            
            # タスクとレメディの具体化
            tasks = {
                "SUN": "ビジョンの再定義、コアバリューの確認",
                "MOON": "心理的安定の確保、内省と休息",
                "MERCURY": "ドキュメント整理、意思疎通のプロトコル確認",
                "VENUS": "美的価値の査定、関係のリデザイン",
                "MARS": "迅速な意思決定、リソースの集中投下",
                "JUPITER": "市場拡大のシミュレーション、学習機会の創出",
                "SATURN": "ガバナンスの強化、長期ロードマップの策定",
                "URANUS": "既存ルールのスクラップ＆ビルド、新技術の導入",
                "NEPTUNE": "インスピレーションの言語化、ビジョナリーな着想の抽出",
                "PLUTO": "根本的な構造改革、ドラスティックな方向転換"
            }
            
            adv_task = f"1. {tasks[tp]} / 2. {tasks[np]}"
            
            remedies = {
                "Work": "タスクの優先順位を再定義し、クリティカルパスを明確にしてください。",
                "Love": "感情の解像度を高め、相手との境界線を再認識することが重要です。",
                "Human": "論理的な対話を優先し、主観を排したコミュニケーションを徹底してください。",
                "Health": "エネルギーの燃焼パターンを記録し、強制的なオフタイムを設定してください。",
                "General": "マクロな視点を維持し、短期的な変動に一喜一憂しないよう努めてください。"
            }
            
            remedy = remedies[category]
            if angle == 150:
                remedy = "「微調整」をキーワードに、少しずつ設定を変えて検証を行ってください。"

            data.append([tp, np, angle, category, analysis, score, adv_task, remedy])

with open('database/M_Aspect_Interpretation.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(["T_Planet", "N_Planet", "Aspect_Angle", "Category", "Text_Description", "Score_Impact", "Advised_Task", "Remedy"])
    writer.writerows(data)
