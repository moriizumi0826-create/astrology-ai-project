# Restore removed old UI entry points

Removed frontend entry points:

- `frontend/dashboard.html`
  - standalone dashboard page entry
- `frontend/src/dashboard.jsx`
  - standalone dashboard page React mount
- `frontend/vite.config.mjs`
  - `dashboard` build input
- `frontend/results.html`
  - old full-report results page
  - embedded dashboard mount `#dashboard-prototype`
  - dashboard embed script `/src/results-dashboard.jsx`
- `frontend/src/results.js`
  - old full-report renderer for `results.html`
- `frontend/src/results-dashboard.jsx`
  - embedded dashboard renderer for `results.html`
- `frontend/src/dashboard-shared.jsx`
  - `DashboardV2YearlyCard` button that opened `./forecast-detail.html` with the label `全てのチャートを計算する`
  - `DashboardV2Header` legacy button labeled `旧UI`
  - `isDashboardLegacyRequested()`
  - `DashboardLegacy`
  - old legacy `Header` / `HeaderMotionMenu`
  - direct `DashboardDailyDetailLayer` / `DashboardDailyDetailSavedLayer` wrappers
  - `Dashboard` branch for `?dashboard=legacy` and `?dashboard=old`
- `frontend/src/forecast-detail.jsx`
  - direct `activeView` pages for `annual`, `monthly`, `daily`, and `dailySaved`

To restore the yearly-card button only, place this inside `DashboardV2YearlyCard` after the yearly summary cards:

```jsx
<button
  type="button"
  onClick={() => {
    window.location.href = "./forecast-detail.html";
  }}
  className="h-10 w-full rounded-full bg-[#e9c349] font-mono text-xs font-black tracking-[0.12em] text-[#241a00] shadow-[0_0_24px_rgba(233,195,73,0.18)]"
>
  全てのチャートを計算する
</button>
```

For full old-UI restoration, recover the removed blocks from git history before this change and re-add:

```bash
git show HEAD~1:frontend/src/dashboard-shared.jsx
git show HEAD~1:frontend/src/forecast-detail.jsx
```
