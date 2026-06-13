# sun/moon 6912-grid missing combination work plan

## Purpose

`database/M_Aspect_Interpretation sun,moon.csv` should contain the canonical sun/moon aspect grid:

`2 transit bodies x 12 natal points x 6 angles x 12 houses x 4 elements = 6912 unique work-key combinations`

The current CSV contains extra `30` angle rows and duplicate work keys. Those cleanup items are separate from this plan. This plan is only for adding the canonical-grid rows that are currently missing after excluding `30` angle rows and counting each duplicate work key once.

## Source Files

- Target CSV: `database/M_Aspect_Interpretation sun,moon.csv`
- Rewrite rules: `database/sun_moon_rewrite_rules.md`
- Previous completed plan, for reference only: `database/sun_moon_missing_combo_work_plan.md`

## Canonical Dimensions

- `T_Planet`
  - `TRANSIT_SUN`
  - `TRANSIT_MOON`
- `N_Planet`
  - `NATAL_SUN`
  - `NATAL_MOON`
  - `NATAL_MERCURY`
  - `NATAL_VENUS`
  - `NATAL_MARS`
  - `NATAL_JUPITER`
  - `NATAL_SATURN`
  - `NATAL_URANUS`
  - `NATAL_NEPTUNE`
  - `NATAL_PLUTO`
  - `NATAL_ASC`
  - `NATAL_MC`
- `Aspect_Angle`
  - `0`
  - `60`
  - `90`
  - `120`
  - `150`
  - `180`
- `N_House`
  - `1` through `12`
- `N_Sign_Element`
  - `Fire`
  - `Earth`
  - `Air`
  - `Water`

`Aspect_Angle=30` is not part of this canonical grid.

## Work Key

Use this key to determine uniqueness and missing rows:

```text
T_Planet,N_Planet,Aspect_Angle,N_House,N_Sign_Element
```

`Category` is not part of the work key, but it must be set correctly for every new row.

## Current Audit Result

At the time this plan was written:

- CSV data rows: `6257`
- `30` angle rows: `48`
- Duplicate extra rows by work key: `65`
- Canonical unique rows present after excluding `30`: `6144`
- Canonical expected rows: `6912`
- Missing canonical rows: `768`

Before starting the add-missing automation, the cleanup step was completed:

- `30` angle rows removed: `48`
- Duplicate extra rows removed by work key: `65`
- CSV data rows after cleanup: `6144`
- `30` angle rows remaining: `0`
- Duplicate extra rows remaining by work key: `0`
- Canonical missing rows remaining: `768`

The missing rows are not scattered one by one. They are whole `12 houses x 4 elements = 48 row` blocks:

```csv
T_Planet,N_Planet,Aspect_Angle,Missing_Rows
TRANSIT_SUN,NATAL_ASC,0,48
TRANSIT_SUN,NATAL_ASC,60,48
TRANSIT_SUN,NATAL_ASC,90,48
TRANSIT_SUN,NATAL_ASC,120,48
TRANSIT_SUN,NATAL_ASC,150,48
TRANSIT_SUN,NATAL_ASC,180,48
TRANSIT_SUN,NATAL_MC,0,48
TRANSIT_SUN,NATAL_MC,60,48
TRANSIT_SUN,NATAL_MC,90,48
TRANSIT_SUN,NATAL_MC,120,48
TRANSIT_SUN,NATAL_MC,150,48
TRANSIT_SUN,NATAL_MC,180,48
TRANSIT_MOON,NATAL_MERCURY,150,48
TRANSIT_MOON,NATAL_JUPITER,0,48
TRANSIT_MOON,NATAL_JUPITER,150,48
TRANSIT_MOON,NATAL_JUPITER,180,48
```

## Missing Row Generation Order

Process the 16 missing blocks in the order listed above.

Within each block, generate rows in this nested order:

1. `N_House`: `1` through `12`
2. `N_Sign_Element`: `Fire`, `Earth`, `Air`, `Water`

That means each 48-row block starts with:

```csv
N_House,N_Sign_Element,Category
1,Fire,General
1,Earth,General
1,Air,General
1,Water,General
2,Fire,Money
2,Earth,Money
2,Air,Money
2,Water,Money
```

and ends with:

```csv
11,Fire,General
11,Earth,General
11,Air,General
11,Water,General
12,Fire,Health
12,Earth,Health
12,Air,Health
12,Water,Health
```

## Category Rules

Set `Category` from `N_House`. Do not set it from `N_Sign_Element`.

`N_Sign_Element` should influence the tone and imagery of `Text_Description`, but the CSV `Category` should remain the life-area category below.

```csv
N_House,Category,Writing Area
1,General,self, body, first impression, personal stance
2,Money,money, possessions, talents, values, security
3,General,learning, communication, short trips, nearby relationships
4,General,home, family, emotional base, private place
5,Love,romance, play, creativity, joy, self-expression
6,Work,work routine, service, practice, health management
7,Love,one-to-one relationships, partners, agreements, attraction
8,Money,shared resources, deep bonds, trust, psychological exchange
9,General,study, travel, beliefs, expertise, wider perspective
10,Work,career, reputation, responsibility, goals, public role
11,General,friends, networks, future plans, community
12,Health,rest, recovery, solitude, inner cleanup, release
```

Element writing guidance:

```csv
N_Sign_Element,Use In Body Text
Fire,initiative, heat, courage, immediacy, direct expression
Earth,practicality, stability, body sense, realism, accumulation
Air,information, words, perspective, lightness, conversation
Water,feeling, memory, empathy, safety, inner depth
```

## Row Creation Rules

For each missing row:

1. Create one new CSV row.
2. Copy non-description metadata from the nearest existing row with the same `T_Planet`, `N_Planet`, and `Aspect_Angle` when possible.
3. If the same `T_Planet`, `N_Planet`, and `Aspect_Angle` does not exist, use the nearest same `T_Planet` and same `Aspect_Angle` pattern, then adjust the row fields.
4. Generate `Aspect_Logic_ID` in the existing style:
   - `{T_Planet}_{N_Planet}_{Aspect_Angle}_{N_House}_{Category}_0_Applying`
5. Set `T_Retrograde_Flag` to `0`.
6. Set `Orb_Status` to `Applying`.
7. Set `Category` using the `N_House` mapping above.
8. Write only a new `Text_Description` body for that row.
9. Do not treat `Orb_Status` as a writing condition.
10. Do not update or append to any progress markdown file during automated batches.

## Text Rules

`Text_Description` must:

- Be natural Japanese.
- Reflect `T_Planet`, `N_Planet`, `Aspect_Angle`, `Category`, `N_House`, and `N_Sign_Element`.
- Avoid applying/separating wording.
- Avoid angle explanations.
- Avoid technical astrology terms in body text.
- Avoid unrelated generic cautions.
- Avoid deterministic or excessive claims.

Forbidden body text terms and patterns:

```text
形成
接近中
離脱中
ピーク
ハウス
エレメント
アスペクト
ネイタル
トランジット
0度
30度
60度
90度
120度
150度
180度
勢いだけで予定
無理をすると体調
焦ると失敗
```

## Batch Rules

- Add exactly `15` missing canonical combinations per automation run while at least 15 remain.
- If fewer than 15 remain in the final run, add all remaining rows and then delete the automation.
- Use the missing block order and within-block row order defined above.
- Do not bulk-generate prose from a single template. Inspect each row's conditions and write each `Text_Description` individually.
- Do not delete `30` rows or duplicate rows as part of this add-missing automation. That cleanup should be handled by a separate cleanup task.

## Verification After Each Run

After editing, verify:

- touched rows have the same CSV column count as the header
- touched `Text_Description` values are nonblank
- touched `Text_Description` values contain none of the forbidden terms
- newly added work keys are unique
- no new `Aspect_Angle=30` row was added
- canonical missing count decreases by the number of rows added

Canonical missing count should be computed against:

```text
2 T_Planet x 12 N_Planet x 6 Aspect_Angle x 12 N_House x 4 N_Sign_Element = 6912
```

with valid angles only:

```text
0,60,90,120,150,180
```

## Automation Prompt Draft

Continue adding missing canonical sun/moon combination rows to `database/M_Aspect_Interpretation sun,moon.csv` according to `database/sun_moon_6912_missing_combo_work_plan.md` and `database/sun_moon_rewrite_rules.md`. Process exactly 15 missing canonical combinations per run, in the plan order, unless fewer than 15 remain. The canonical grid is 2 transit bodies, 12 natal points, angles `0,60,90,120,150,180`, 12 houses, and 4 elements; do not add `30` angle rows. For every new row, inspect `T_Planet`, `N_Planet`, `Aspect_Angle`, `Category`, `N_House`, and `N_Sign_Element`; set `Category` from `N_House`, not from element; create a new CSV row following the nearest existing row pattern; write only a new `Text_Description` body for that row. Do not treat `Orb_Status` as a writing condition. Do not update any progress markdown file. Do not delete duplicate rows or `30` angle rows in this add-missing automation. After editing, verify touched rows keep the same CSV column count, newly added work keys are unique, no `30` angle rows were added, canonical missing count decreases, and generated body text does not include applying/separating wording, angle explanations, technical terms, or unrelated generic cautions. Report the completed missing-combination range.
