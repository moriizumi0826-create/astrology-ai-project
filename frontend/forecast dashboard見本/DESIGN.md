---
name: Celestial Intelligence
colors:
  surface: '#121414'
  surface-dim: '#121414'
  surface-bright: '#38393a'
  surface-container-lowest: '#0d0e0f'
  surface-container-low: '#1a1c1c'
  surface-container: '#1e2020'
  surface-container-high: '#282a2b'
  surface-container-highest: '#333535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#c7c6cc'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#2f3131'
  outline: '#909096'
  outline-variant: '#46464c'
  surface-tint: '#c3c6d7'
  primary: '#c3c6d7'
  on-primary: '#2c303d'
  primary-container: '#0a0e1a'
  on-primary-container: '#777b8a'
  inverse-primary: '#5a5e6d'
  secondary: '#d3bcf9'
  on-secondary: '#382759'
  secondary-container: '#4f3d71'
  on-secondary-container: '#c1abe7'
  tertiary: '#e9c349'
  on-tertiary: '#3c2f00'
  tertiary-container: '#140e00'
  on-tertiary-container: '#967800'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dfe2f3'
  primary-fixed-dim: '#c3c6d7'
  on-primary-fixed: '#171b28'
  on-primary-fixed-variant: '#434654'
  secondary-fixed: '#ebdcff'
  secondary-fixed-dim: '#d3bcf9'
  on-secondary-fixed: '#231043'
  on-secondary-fixed-variant: '#4f3d71'
  tertiary-fixed: '#ffe088'
  tertiary-fixed-dim: '#e9c349'
  on-tertiary-fixed: '#241a00'
  on-tertiary-fixed-variant: '#574500'
  background: '#121414'
  on-background: '#e2e2e2'
  surface-variant: '#333535'
typography:
  display-lg:
    fontFamily: Playfair Display
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-md:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '500'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Manrope
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  headline-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.3'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-padding: 32px
  gutter: 24px
  card-gap: 16px
  margin-sm: 16px
  margin-md: 32px
  margin-lg: 64px
---

## Brand & Style

The design system is centered on a **Mystical & Sophisticated** persona, designed for an audience seeking spiritual insight through a modern, data-driven lens. It evokes a sense of cosmic wisdom, tranquility, and high-end luxury.

The visual style is a refined **Glassmorphism**, blending the depth of the cosmos with sharp, functional interfaces. Key characteristics include:
- **Depth & Transparency:** Multi-layered translucent surfaces that allow background starscapes to shimmer through.
- **Etheric Glow:** Soft, radiant outer glows and thin, luminous borders to simulate starlight.
- **Sophisticated Contrast:** The juxtaposition of timeless, traditional serifs with ultra-modern, clean functional data.
- **Tactile Quality:** Despite the digital nature, UI elements should feel like polished obsidian or celestial instruments.

## Colors

The palette is anchored in the deep reaches of the night sky, using darkness to create focus and gold to highlight destiny.

- **Primary (Midnight):** Used for the base background. It is a near-black blue that provides the infinite depth required for the cosmic aesthetic.
- **Secondary (Ethereal Purple):** Used for surface gradients and glassmorphism backdrops. It bridges the gap between the void and the content.
- **Tertiary (Celestial Gold):** Reserved for high-value accents, active states, and symbols of importance (e.g., zodiac glyphs, moon phases).
- **Functional Neutrals:** A range of cool grays and off-whites for high legibility against dark backgrounds.
- **Glow Tints:** Semi-transparent versions of the secondary purple and gold are used for "bloom" effects around critical UI components.

## Typography

This design system utilizes a high-contrast typographic pairing to balance tradition and technology.

- **Headlines (Playfair Display):** These provide the "Mystical" character. Use wide tracking for display sizes and ensure a generous line height to maintain an editorial, premium feel.
- **Body & Interface (Manrope):** A modern sans-serif chosen for its exceptional readability in dark mode. It handles dense dashboard information without feeling cluttered.
- **Data & Technical Labels (JetBrains Mono):** A monospaced font used for astronomical coordinates, dates, and precise metrics, evoking the precision of a star chart.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a high-density information structure, mirroring the complexity of an astronomical dashboard.

- **Desktop (1440px+):** 12-column grid with 24px gutters. Use wide side margins (64px) to allow background starfield textures to frame the content.
- **Tablet (768px - 1439px):** 8-column grid. Gutters reduce to 16px. Sidebars may collapse into a drawer or top-level navigation.
- **Mobile (Up to 767px):** 4-column grid. Padding reduces to 16px. Cards stack vertically, and complex data visualizations should simplify to primary metrics.

Spacing rhythm is strictly 8px-based to ensure vertical alignment of glass panels. Use "Airy" margins between distinct sections to prevent the dark UI from feeling claustrophobic.

## Elevation & Depth

Depth is not communicated through traditional shadows, but through **Tonal Luminosity and Blur**.

- **Level 0 (Base):** Deep midnight blue with a subtle, fixed background image of a nebula or starfield (low opacity, 10-15%).
- **Level 1 (Panels/Cards):** Celestial purple with 40% opacity. Apply a `backdrop-filter: blur(20px)`. Borders are 1px solid white at 10% opacity.
- **Level 2 (Modals/Popovers):** Higher opacity (60%) and a secondary "inner glow" border (1px gold at 20% opacity).
- **Interaction Glow:** When hovering over interactive glass panels, the border-color should transition to gold (#D4AF37) with a soft outer box-shadow (0 0 15px) of the same color.

## Shapes

The shape language is **Rounded**, avoiding sharp corners to maintain a soft, ethereal feeling.

- **Cards & Panels:** 1rem (16px) corner radius to create a containerized, modern feel.
- **Buttons & Chips:** Use `rounded-lg` (16px) for standard buttons and fully pill-shaped (32px+) for tags or status indicators.
- **Active Indicators:** Use circular shapes for astronomical symbols (planets, moon phases) to reinforce the celestial theme.

## Components

### Buttons
- **Primary:** Shimmering gold gradient background with dark midnight text. Use a subtle pulse animation for "Calculate Chart" actions.
- **Secondary:** Transparent with a 1px purple-glow border. Text in gold or white.

### Cards (The "Chart" Container)
- Glassmorphic panels with `backdrop-filter`. Headers should use the serif font. Include a thin, top-aligned 2px gold "accent line" for featured insights (e.g., Daily Horoscope).

### Input Fields
- Underlined style or softly tinted purple containers. Focus state triggers a gold bottom border and a soft purple glow.

### Chips & Tags
- Semi-transparent purple backgrounds with monospaced labels. Used for zodiac signs (Aries, Leo, etc.) or elemental categories (Fire, Water).

### Data Visualizations
- Radars, line charts, and progress rings should use thin gold strokes and purple area fills. Avoid solid colors; use gradients that mimic the transition from dusk to night.

### Zodiac Glyphs
- Custom-drawn, thin-line gold icons. These act as the primary visual identifiers for navigation and section headers.