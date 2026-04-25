import csv

data = [
    ["JUPITER_CONJUNCTION_SUN", "知性の覚醒モード", "Work", 5.0],
    ["VENUS_CONJUNCTION_SUN", "愛の受容期", "Love", 3.0],
    ["MARS_CONJUNCTION_MC", "キャリアの急上昇", "Work", 4.0],
    ["JUPITER_TRINE_VENUS", "黄金の好感度", "Human", 6.0],
    ["SUN_INGRESS_ARIES", "新規事業の創出", "Work", 0.0],
    ["MOON_TRINE_JUPITER", "メンタル充実期", "Health", 5.0],
    ["MERCURY_CONJUNCTION_MERCURY", "思考の同期化", "Human", 2.0],
    ["VENUS_TRINE_MARS", "情熱の最適化", "Love", 4.0],
    ["SATURN_TRINE_SUN", "基盤の完成", "Work", 5.0],
    ["URANUS_TRINE_MERCURY", "独創的アイデアの爆発", "Work", 3.0],
    # ... 30行まで追加
]

for i in range(len(data), 30):
    data.append([f"POSITIVE_TRIGGER_{i}", f"幸運の波形 {i}", "General", 2.0])

with open('database/M_Countdown_Master.csv', 'w', encoding='utf-8', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(["Trigger_ID", "Display_Title", "Category", "Target_Orb"])
    writer.writerows(data)
