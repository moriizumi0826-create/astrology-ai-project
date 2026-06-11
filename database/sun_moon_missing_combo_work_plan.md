# sun/moon missing combination work plan

## Purpose

`database/M_Aspect_Interpretation sun,moon.csv` has no blank `Text_Description` rows, but some combination keys are missing.
This plan defines the fixed scope and workflow for adding those missing rows in batches of 15.

## Source File

- Target CSV: `database/M_Aspect_Interpretation sun,moon.csv`
- Rewrite rules: `database/sun_moon_rewrite_rules.md`
- Work key:
  - `T_Planet`
  - `N_Planet`
  - `Aspect_Angle`
  - `N_House`
  - `N_Sign_Element`

## Current Audit Result

- Current data rows: `6129`
- Unique work-key combinations: `6064`
- Duplicate work-key combinations: `65`
- Missing combinations inside already-present `T_Planet x N_Planet x Aspect_Angle` groups: `128`
- Remaining blank `Text_Description` rows before this missing-combination task: `0`

This task should add the `128` missing combinations listed below. It should not rewrite existing completed descriptions unless a separate cleanup task is requested.

## Row Creation Rules

For each missing row:

1. Create one new CSV row.
2. Fill only the missing combination conditions and the required metadata by following the nearest existing local pattern.
3. Generate `Aspect_Logic_ID` from the same naming style:
   - `{T_Planet}_{N_Planet}_{Aspect_Angle}_{N_House}_{Category}_0_Applying`
4. Set `T_Retrograde_Flag` to `0`.
5. Set `Orb_Status` to `Applying`.
6. Set `Category` from `N_House`:
   - `1`: `General`
   - `2`: `Money`
   - `3`: `General`
   - `4`: `General`
   - `5`: `Love`
   - `6`: `Work`
   - `7`: `Love`
   - `8`: `Money`
   - `9`: `General`
   - `10`: `Work`
   - `11`: `General`
   - `12`: `Health`
7. Populate `Text_Description` carefully one row at a time.
8. For non-description metadata columns, copy the pattern from the nearest existing row with the same:
   - `T_Planet`
   - `N_Planet`
   - `Aspect_Angle`
   - preferably same `N_House` or same `Category`
9. Do not use `Orb_Status` as a writing condition.
10. Do not add or update a progress markdown file during automated batches. This file is the static plan.

## Text Rules

`Text_Description` must:

- Be natural Japanese.
- Reflect `T_Planet`, `N_Planet`, `Aspect_Angle`, `Category`, `N_House`, and `N_Sign_Element`.
- Avoid applying/separating wording.
- Avoid angle explanations.
- Avoid technical astrology terms in body text.
- Avoid unrelated generic cautions.
- Avoid deterministic or excessive claims.

Forbidden body text examples and terms:

- `形成`
- `接近中`
- `離脱中`
- `ピーク`
- `ハウス`
- `エレメント`
- `アスペクト`
- `ネイタル`
- `トランジット`
- `0度`
- `60度`
- `90度`
- `120度`
- `150度`
- `180度`
- unrelated generic cautions such as `勢いだけで予定`, `無理をすると体調`, `焦ると失敗`

## Batch Rules

- Process exactly `15` missing combinations per automation run while at least 15 remain.
- Use the missing list order in this plan.
- If fewer than 15 remain in the final run, process all remaining rows and then delete the automation.
- Do not bulk-generate prose by template. Inspect each row's conditions and write each `Text_Description` individually.
- After each run, verify:
  - touched rows have the same CSV column count as the header
  - touched `Text_Description` values are nonblank
  - touched `Text_Description` values contain none of the forbidden terms
  - all newly added work keys are unique
  - missing count decreases by the number of rows added

## Missing Combination List

Columns:

`T_Planet,N_Planet,Aspect_Angle,N_House,N_Sign_Element,Category`

### Batch 1

```csv
TRANSIT_SUN,NATAL_SUN,60,2,Fire,Money
TRANSIT_MOON,NATAL_MOON,120,8,Water,Money
TRANSIT_MOON,NATAL_MERCURY,90,10,Water,Work
TRANSIT_MOON,NATAL_VENUS,180,5,Air,Love
TRANSIT_MOON,NATAL_VENUS,180,5,Water,Love
TRANSIT_MOON,NATAL_VENUS,180,6,Fire,Work
TRANSIT_MOON,NATAL_VENUS,180,6,Earth,Work
TRANSIT_MOON,NATAL_VENUS,180,6,Air,Work
TRANSIT_MOON,NATAL_VENUS,180,6,Water,Work
TRANSIT_MOON,NATAL_VENUS,180,7,Fire,Love
TRANSIT_MOON,NATAL_VENUS,180,7,Earth,Love
TRANSIT_MOON,NATAL_VENUS,180,7,Air,Love
TRANSIT_MOON,NATAL_VENUS,180,7,Water,Love
TRANSIT_MOON,NATAL_VENUS,180,8,Fire,Money
TRANSIT_MOON,NATAL_VENUS,180,8,Earth,Money
```

### Batch 2

```csv
TRANSIT_MOON,NATAL_VENUS,180,8,Air,Money
TRANSIT_MOON,NATAL_MARS,30,3,Air,General
TRANSIT_MOON,NATAL_MARS,30,3,Water,General
TRANSIT_MOON,NATAL_MARS,30,4,Fire,General
TRANSIT_MOON,NATAL_MARS,30,4,Earth,General
TRANSIT_MOON,NATAL_MARS,30,4,Air,General
TRANSIT_MOON,NATAL_MARS,30,4,Water,General
TRANSIT_MOON,NATAL_MARS,30,5,Fire,Love
TRANSIT_MOON,NATAL_MARS,30,5,Earth,Love
TRANSIT_MOON,NATAL_MARS,30,5,Air,Love
TRANSIT_MOON,NATAL_MARS,30,5,Water,Love
TRANSIT_MOON,NATAL_MARS,30,6,Fire,Work
TRANSIT_MOON,NATAL_MARS,30,6,Earth,Work
TRANSIT_MOON,NATAL_MARS,90,1,Earth,General
TRANSIT_MOON,NATAL_MARS,90,1,Air,General
```

### Batch 3

```csv
TRANSIT_MOON,NATAL_MARS,90,1,Water,General
TRANSIT_MOON,NATAL_MARS,90,2,Fire,Money
TRANSIT_MOON,NATAL_MARS,90,2,Earth,Money
TRANSIT_MOON,NATAL_MARS,90,2,Air,Money
TRANSIT_MOON,NATAL_MARS,90,2,Water,Money
TRANSIT_MOON,NATAL_MARS,90,3,Fire,General
TRANSIT_MOON,NATAL_MARS,90,3,Earth,General
TRANSIT_MOON,NATAL_MARS,90,3,Air,General
TRANSIT_MOON,NATAL_MARS,90,3,Water,General
TRANSIT_MOON,NATAL_MARS,90,4,Fire,General
TRANSIT_MOON,NATAL_MARS,90,4,Earth,General
TRANSIT_MOON,NATAL_MARS,120,11,Fire,General
TRANSIT_MOON,NATAL_MARS,120,11,Earth,General
TRANSIT_MOON,NATAL_MARS,120,11,Air,General
TRANSIT_MOON,NATAL_MARS,120,11,Water,General
```

### Batch 4

```csv
TRANSIT_MOON,NATAL_MARS,120,12,Fire,Health
TRANSIT_MOON,NATAL_MARS,120,12,Earth,Health
TRANSIT_MOON,NATAL_MARS,120,12,Air,Health
TRANSIT_MOON,NATAL_MARS,120,12,Water,Health
TRANSIT_MOON,NATAL_MARS,150,1,Fire,General
TRANSIT_MOON,NATAL_MARS,150,1,Earth,General
TRANSIT_MOON,NATAL_MARS,150,1,Air,General
TRANSIT_MOON,NATAL_MARS,150,1,Water,General
TRANSIT_MOON,NATAL_MARS,180,8,Water,Money
TRANSIT_MOON,NATAL_MARS,180,9,Fire,General
TRANSIT_MOON,NATAL_MARS,180,9,Earth,General
TRANSIT_MOON,NATAL_MARS,180,9,Air,General
TRANSIT_MOON,NATAL_MARS,180,9,Water,General
TRANSIT_MOON,NATAL_MARS,180,10,Fire,Work
TRANSIT_MOON,NATAL_MARS,180,10,Earth,Work
```

### Batch 5

```csv
TRANSIT_MOON,NATAL_MARS,180,10,Air,Work
TRANSIT_MOON,NATAL_MARS,180,10,Water,Work
TRANSIT_MOON,NATAL_MARS,180,11,Fire,General
TRANSIT_MOON,NATAL_MARS,180,11,Earth,General
TRANSIT_MOON,NATAL_MARS,180,11,Air,General
TRANSIT_MOON,NATAL_JUPITER,60,6,Air,Work
TRANSIT_MOON,NATAL_JUPITER,60,6,Water,Work
TRANSIT_MOON,NATAL_JUPITER,60,7,Fire,Love
TRANSIT_MOON,NATAL_JUPITER,60,7,Earth,Love
TRANSIT_MOON,NATAL_JUPITER,60,7,Air,Love
TRANSIT_MOON,NATAL_JUPITER,60,7,Water,Love
TRANSIT_MOON,NATAL_JUPITER,60,8,Fire,Money
TRANSIT_MOON,NATAL_JUPITER,60,8,Earth,Money
TRANSIT_MOON,NATAL_JUPITER,60,8,Air,Money
TRANSIT_MOON,NATAL_JUPITER,60,8,Water,Money
```

### Batch 6

```csv
TRANSIT_MOON,NATAL_JUPITER,60,9,Fire,General
TRANSIT_MOON,NATAL_JUPITER,60,9,Earth,General
TRANSIT_MOON,NATAL_JUPITER,60,9,Air,General
TRANSIT_MOON,NATAL_JUPITER,60,9,Water,General
TRANSIT_MOON,NATAL_JUPITER,60,10,Fire,Work
TRANSIT_MOON,NATAL_JUPITER,90,5,Fire,Love
TRANSIT_MOON,NATAL_JUPITER,90,5,Earth,Love
TRANSIT_MOON,NATAL_JUPITER,90,5,Air,Love
TRANSIT_MOON,NATAL_JUPITER,90,5,Water,Love
TRANSIT_MOON,NATAL_JUPITER,90,6,Fire,Work
TRANSIT_MOON,NATAL_JUPITER,90,6,Earth,Work
TRANSIT_MOON,NATAL_JUPITER,90,6,Air,Work
TRANSIT_MOON,NATAL_JUPITER,90,6,Water,Work
TRANSIT_MOON,NATAL_JUPITER,90,7,Fire,Love
TRANSIT_MOON,NATAL_JUPITER,90,7,Earth,Love
```

### Batch 7

```csv
TRANSIT_MOON,NATAL_JUPITER,90,7,Air,Love
TRANSIT_MOON,NATAL_SATURN,60,2,Water,Money
TRANSIT_MOON,NATAL_SATURN,60,3,Fire,General
TRANSIT_MOON,NATAL_SATURN,60,3,Earth,General
TRANSIT_MOON,NATAL_SATURN,60,3,Air,General
TRANSIT_MOON,NATAL_SATURN,60,3,Water,General
TRANSIT_MOON,NATAL_SATURN,60,4,Fire,General
TRANSIT_MOON,NATAL_SATURN,60,4,Earth,General
TRANSIT_MOON,NATAL_SATURN,60,4,Air,General
TRANSIT_MOON,NATAL_SATURN,60,4,Water,General
TRANSIT_MOON,NATAL_SATURN,60,5,Fire,Love
TRANSIT_MOON,NATAL_SATURN,60,5,Earth,Love
TRANSIT_MOON,NATAL_SATURN,60,5,Air,Love
TRANSIT_MOON,NATAL_SATURN,120,9,Water,General
TRANSIT_MOON,NATAL_SATURN,120,10,Fire,Work
```

### Batch 8

```csv
TRANSIT_MOON,NATAL_SATURN,120,10,Earth,Work
TRANSIT_MOON,NATAL_SATURN,120,10,Air,Work
TRANSIT_MOON,NATAL_SATURN,120,10,Water,Work
TRANSIT_MOON,NATAL_SATURN,120,11,Fire,General
TRANSIT_MOON,NATAL_SATURN,120,11,Earth,General
TRANSIT_MOON,NATAL_SATURN,120,11,Air,General
TRANSIT_MOON,NATAL_SATURN,120,11,Water,General
TRANSIT_MOON,NATAL_SATURN,120,12,Fire,Health
TRANSIT_MOON,NATAL_SATURN,120,12,Earth,Health
TRANSIT_MOON,NATAL_SATURN,120,12,Air,Health
TRANSIT_MOON,NATAL_SATURN,180,4,Earth,General
TRANSIT_MOON,NATAL_SATURN,180,4,Air,General
TRANSIT_MOON,NATAL_SATURN,180,4,Water,General
TRANSIT_MOON,NATAL_SATURN,180,5,Fire,Love
TRANSIT_MOON,NATAL_SATURN,180,5,Earth,Love
```

### Batch 9

```csv
TRANSIT_MOON,NATAL_SATURN,180,5,Air,Love
TRANSIT_MOON,NATAL_SATURN,180,5,Water,Love
TRANSIT_MOON,NATAL_SATURN,180,6,Fire,Work
TRANSIT_MOON,NATAL_SATURN,180,6,Earth,Work
TRANSIT_MOON,NATAL_SATURN,180,6,Air,Work
TRANSIT_MOON,NATAL_SATURN,180,6,Water,Work
TRANSIT_MOON,NATAL_SATURN,180,7,Fire,Love
TRANSIT_MOON,NATAL_SATURN,180,7,Earth,Love
```

## Automation Prompt Draft

Continue adding missing combination rows to `database/M_Aspect_Interpretation sun,moon.csv` according to `database/sun_moon_missing_combo_work_plan.md` and `database/sun_moon_rewrite_rules.md`. Process exactly 15 missing combinations per run, in the plan order, unless fewer than 15 remain. For every row, inspect `T_Planet`, `N_Planet`, `Aspect_Angle`, `Category`, `N_House`, and `N_Sign_Element`; create a new CSV row following the nearest existing row pattern; write only a new `Text_Description` body for that row. Do not treat `Orb_Status` as a writing condition. Do not update any progress markdown file. After editing, verify touched rows keep the same CSV column count, newly added work keys are unique, missing count decreases, and generated body text does not include applying/separating wording, angle explanations, technical terms, or unrelated generic cautions. Report the completed missing-combination range.
