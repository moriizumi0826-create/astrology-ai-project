# Stitch UI Redesign Log

## 2026-05-20

### Design Baseline

- Reference document: `stitch_celestial_forecast_dashboard/DESIGN.md`
- Target image: `stitch_celestial_forecast_dashboard/screen.png`
- Direction: dark glassmorphism dashboard with gold accents, high-density panels, and ASTRAEA-style navigation.

### Implemented

- Updated the default dashboard V2 visual direction from the previous light UI to the Stitch dark dashboard style.
- Kept legacy dashboard available through `?dashboard=legacy` and `?dashboard=old`.
- Changed V2 header to ASTRAEA-style dark navigation.
- Restyled V2 cards with dark glass surfaces, gold borders, mono labels, and serif headings.
- Restyled Personal Reading as `今日の洞察`.
- Restyled daily flow card with gold line and red dashed secondary line.
- Restyled countdown card in the same dark/gold visual language.
- Added a V2-specific dark yearly forecast card layout.
- Added a dark footer matching the Stitch reference.

### Verification

- Build command: `npm run build`
- Result: success
- Screenshot output:
  - `output/dashboard-v2-verification/v2-stitch-pc-final.png`
  - `output/dashboard-v2-verification/v2-stitch-mobile-final.png`
  - `output/dashboard-v2-verification/legacy-still-available-final.png`
- PC and mobile checks showed no horizontal overflow.

### Notes

- This pass changed only the V2 dashboard presentation layer in `frontend/src/dashboard-shared.jsx`.
- Backend logic, scoring logic, CSV files, and legacy dashboard behavior were not intentionally changed.
- Local fallback data does not include yearly forecast data, so the screenshot shows `年運データがありません`. Real yearly graph rendering still needs verification with backend data connected.

## 2026-05-20 Additional Alignment

### Implemented

- Moved V2 closer to `screen.png` structure instead of only applying dark colors.
- Rebuilt the left insight card with moon icon, date/meta line, tab row, quote-style body, and three highlighted bullets.
- Rebuilt the daily flow card with chart legend, large dark chart area, time labels, and compact logic stability strip.
- Rebuilt the countdown card as a lower left `Next Stellar Event` panel with event copy, countdown value, note, and progress bar.
- Rebuilt the yearly card to show a chart, theme chips, metric cards, detailed insight block, and gold CTA even when local fallback data has no backend yearly payload.

### Verification

- Build command: `npm run build`
- Result: success
- Screenshot output:
  - `output/dashboard-v2-verification/v2-stitch-closer-pc.png`
  - `output/dashboard-v2-verification/v2-stitch-closer-mobile.png`
