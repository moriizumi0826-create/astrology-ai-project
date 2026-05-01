# M_Aspect_Interpretation 参照対応表

このファイルは、`Essential_Dignity_Score` と `Countdown_ID` を正確に生成するための参照表です。

生成ルール本体は [aspect_interpretation_rules.md](C:/Users/morii/OneDrive/デスクトップ/astrology_ai_project/database/aspect_interpretation_rules.md) を参照してください。

## 1. Essential_Dignity_Score 対応表
参照元:
[generate_aspect_master_ids.py](C:/Users/morii/OneDrive/デスクトップ/astrology_ai_project/scripts/generate_aspect_master_ids.py) の `ESSENTIAL_DIGNITY_BY_ELEMENT`

読み方:
- 行 = `N_Planet`
- 列 = `N_Sign_Element`
- 取得した値を基準値とし、角度が `90 / 150 / 180` なら符号反転

| N_Planet | Fire | Earth | Air | Water |
|---|---:|---:|---:|---:|
| `NATAL_SUN` | 5 | -1 | 2 | -2 |
| `NATAL_MOON` | -1 | 2 | -2 | 5 |
| `NATAL_MERCURY` | -2 | 5 | 5 | -2 |
| `NATAL_VENUS` | -1 | 5 | 1 | 5 |
| `NATAL_MARS` | 5 | 1 | 3 | -3 |
| `NATAL_JUPITER` | 5 | -1 | 2 | 4 |
| `NATAL_SATURN` | -2 | 5 | 5 | -2 |
| `NATAL_URANUS` | 2 | -1 | 5 | -3 |
| `NATAL_NEPTUNE` | -1 | -3 | 1 | 5 |
| `NATAL_PLUTO` | 3 | 1 | -2 | 4 |
| `NATAL_ASC` | 2 | 0 | 1 | 0 |
| `NATAL_MC` | 1 | 2 | 1 | 0 |

## 2. Countdown_ID 分岐表
参照元:
[generate_aspect_master_ids.py](C:/Users/morii/OneDrive/デスクトップ/astrology_ai_project/scripts/generate_aspect_master_ids.py) の `choose_countdown_id(row)`

前提:
- 吉角 = `0 / 60 / 120`
- 緊張角 = `90 / 150 / 180`

### 2-1. Love
| 条件 | Countdown_ID |
|---|---|
| `T_Planet = TRANSIT_VENUS` または `N_Planet in {NATAL_VENUS, NATAL_SUN}` かつ吉角 | `LUCKY_LOVE_VENUS` |
| 同条件で緊張角 | `PASSIONATE_ENCOUNTER` |
| `T_Planet = TRANSIT_MOON` または `N_Planet = NATAL_MOON` かつ吉角 | `ROMANTIC_CHANCE_MOON` |
| 同条件で緊張角 | `DEEP_BOND_SCORPIO` |
| `T_Planet = TRANSIT_JUPITER` | `RELATIONSHIP_GLORY` |
| `T_Planet = TRANSIT_SATURN` | `STABLE_LOVE_FOUND` |
| `T_Planet = TRANSIT_MARS` | `PASSIONATE_ENCOUNTER` |
| `T_Planet = TRANSIT_URANUS` | `SOCIAL_NETWORK_EXP` |
| `T_Planet = TRANSIT_PLUTO` または `N_Planet in {NATAL_PLUTO, NATAL_NEPTUNE}` | `DEEP_BOND_SCORPIO` |
| 上記以外 | `DESTINY_MEETING` |

### 2-2. Work
| 条件 | Countdown_ID |
|---|---|
| `T_Planet = TRANSIT_JUPITER` または `N_Planet = NATAL_MC` かつ吉角 | `WORK_SUCCESS_JUPITER` |
| 同条件で緊張角 | `BUSINESS_EXPANSION` |
| `T_Planet = TRANSIT_MERCURY` かつ `N_Planet in {NATAL_MERCURY, NATAL_JUPITER}` | `STUDY_EFFICIENCY_MAX` |
| `T_Planet = TRANSIT_MERCURY` かつ `N_Planet in {NATAL_VENUS, NATAL_MOON}` | `NEGOTIATION_POWER` |
| `T_Planet = TRANSIT_MERCURY` 上記以外 | `DECISION_SPEED_UP` |
| `T_Planet = TRANSIT_SATURN` | `PROJECT_COMPLETION` |
| `T_Planet = TRANSIT_SUN` かつ `N_Planet = NATAL_SUN` で吉角 | `PUBLIC_RECOGNITION` |
| `T_Planet = TRANSIT_SUN` かつ `N_Planet = NATAL_SUN` で緊張角 | `LEADERSHIP_AWAKENING` |
| `T_Planet = TRANSIT_SUN` 上記以外 | `CREATIVE_FLOW_SUN` |
| `T_Planet = TRANSIT_URANUS` | `STUDY_EFFICIENCY_MAX` |
| `T_Planet = TRANSIT_MARS` | `LEADERSHIP_AWAKENING` |
| 上記以外 | `CAREER_PEAK_MC` |

### 2-3. Money
| 条件 | Countdown_ID |
|---|---|
| `T_Planet = TRANSIT_SATURN` または `N_Planet = NATAL_SATURN` | `SAVINGS_GROWTH` |
| それ以外で吉角 | `MONEY_LUCK_TAURUS` |
| それ以外で緊張角 | `SAVINGS_GROWTH` |

### 2-4. Health
| 条件 | Countdown_ID |
|---|---|
| `T_Planet = TRANSIT_MOON` または `N_Planet = NATAL_MOON` かつ吉角 | `INNER_PEACE_MOON` |
| `T_Planet = TRANSIT_MOON` または `N_Planet = NATAL_MOON` で緊張角 | `MIND_BODY_BALANCE` |
| `T_Planet = TRANSIT_NEPTUNE` または `N_Planet = NATAL_NEPTUNE` | `SPIRITUAL_HEALING` |
| 上記以外で吉角 | `MIND_BODY_BALANCE` |
| 上記以外で緊張角 | `SPIRITUAL_HEALING` |

### 2-5. General
`Category` が `Love / Work / Money / Health` のどれにも入らない場合、以下の順で返します。

| 条件 | Countdown_ID |
|---|---|
| `T_Planet = TRANSIT_URANUS` | `SELF_REFORM_URANUS` |
| `T_Planet = TRANSIT_PLUTO` | `FATED_TURNING_POINT` |
| `T_Planet = TRANSIT_MARS` | `VICTORY_MARS` |
| `T_Planet = TRANSIT_MOON` | `FAMILY_HAPPINESS` |
| `T_Planet = TRANSIT_VENUS` | `HOUSE_BRIGHTENING` |
| `T_Planet = TRANSIT_JUPITER` | `GLOBAL_CONNECTION` |
| `T_Planet = TRANSIT_SUN` かつ `N_Planet in {NATAL_SUN, NATAL_ASC}` | `TALENT_DISCOVERY` |
| 上記以外 | `SOCIAL_CONTRIBUTION` |

## 3. 運用メモ
1. `Essential_Dignity_Score` は `Score_Impact` の補正値として使う
2. `Countdown_ID` は `M_Countdown_Master.Trigger_ID` と一致照合する
3. `Countdown_Label` はフォールバック表示であり、主キーではない
