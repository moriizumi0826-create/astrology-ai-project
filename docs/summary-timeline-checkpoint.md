# Summary Timeline Checkpoint

Created: 2026-05-31

This is the current preferred state for the annual forecast detail `総括` timeline.

## Verification Data

- Birth date: `1984-08-26`
- Birth time: `19:20`
- Latitude: `35.8078`
- Longitude: `139.7241`
- Timezone: `Asia/Tokyo`
- URL pattern:
  `http://localhost:5174/forecast-detail.html?refresh=1&birth_date=1984-08-26&birth_time=19:20&latitude=35.8078&longitude=139.7241&timezone_offset=9&timezone_name=Asia%2FTokyo`

## Key Layout Settings

File: `frontend/src/forecast-detail.jsx`

Keep these values if the layout needs to return to this state:

```jsx
function summaryTextHeightEstimate(item, viewportWidth = 1024) {
  const textLength = String(`${item?.label || ""}${item?.title || ""}${item?.body || ""}`).length;
  if (viewportWidth < 640) {
    return 48 + Math.ceil(textLength / 15) * 20;
  }
  const columnWidth = Math.max(240, (viewportWidth - 100) / 2);
  const charsPerLine = Math.max(28, Math.floor(columnWidth / 13));
  return 52 + Math.ceil(textLength / charsPerLine) * 28;
}

function summaryTimelineLayout(items, year, pxPerDay, viewportWidth) {
  let previousBottom = 0;
  const gap = viewportWidth < 640 ? 18 : 24;
  const maxGap = viewportWidth < 640 ? 34 : 56;
  const laidOutItems = items.map((item, index) => {
    const startOffset = summaryTimelineDayOffset(item, year);
    const duration = summaryDurationDays(item);
    const textHeight = summaryTextHeightEstimate(item, viewportWidth);
    const rawTop = startOffset * pxPerDay;
    const top = index === 0
      ? rawTop
      : Math.max(previousBottom + gap, Math.min(rawTop, previousBottom + maxGap));
    previousBottom = top + textHeight;
    return {
      item,
      style: {
        top: `${top}px`,
      },
    };
  });
  return {
    items: laidOutItems,
    style: { minHeight: `${Math.max(366 * pxPerDay, previousBottom)}px` },
  };
}
```

## Last PC Metrics

With the verification data above, the first visible summary items had these approximate positions:

```text
left column:
1/1-2/13   top 365, bottom 563
2/14-6/29  top 641, bottom 867
6/30-12/31 top 917, bottom 1115

right column:
1/1-2/7    top 365, bottom 591
2/8-5/21   top 669, bottom 923
5/22-10/1  top 973, bottom 1199
10/2-12/31 top 1277, bottom 1531
```

## Intent

- Keep the `総括` display as a two-column timeline.
- Avoid text overlap.
- Avoid large reserved blank areas after short text blocks.
- Preserve a modest visual offset between the two columns so overlapping periods remain readable.
