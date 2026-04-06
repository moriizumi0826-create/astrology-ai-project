```markdown
# Design System Document: The Celestial Atelier

## 1. Overview & Creative North Star
**Creative North Star: "The Ethereal Curator"**

This design system rejects the "mystical neon" cliches of traditional astrology. Instead, it treats cosmic insights as high-end artisanal content. The aesthetic is informed by European furniture editorial design—think *Kinfolk* meets *Muuto*. 

The system breaks the standard "web template" feel through **Architectural Composition**: 
- **Intentional Asymmetry:** Elements are not always centered; they lean into whitespace to create a sense of breath.
- **Tonal Depth:** Rather than using lines to separate ideas, we use "blocks of air" and subtle shifts in surface temperature.
- **Editorial Scale:** Dramatic contrasts between oversized serif display type and tiny, precise functional labels.

---

## 2. Colors
The palette is a collection of "living neutrals"—colors that feel like natural materials (linen, stone, charcoal, and brass).

### Tonal Strategy
- **Primary (`#5f5f59`):** A warm charcoal. Use this for stability and grounding.
- **Secondary (`#6d5f07`):** Our "Subtle Gold." Never used for large fills; reserved for moments of enlightenment (active states, focus icons).
- **Surface & Background (`#fafaf5`):** An off-white "Paper" base that prevents eye strain and feels premium.

### The "No-Line" Rule
**Standard 1px borders are strictly prohibited for sectioning.** To define boundaries:
1.  **Shift Backgrounds:** Transition from `surface` to `surface-container-low`.
2.  **Whitespace:** Use a minimum of 80px-120px vertical padding between disparate content blocks.
3.  **Tonal Transitions:** Use `surface-variant` for very subtle, large-scale background differentiation.

### Signature Textures
Apply a subtle linear gradient to main CTAs using `primary` transitioning to `primary-dim`. This creates a "brushed metal" or "honed stone" depth that feels tactile rather than digital.

---

## 3. Typography
The typography system is a dialogue between the classical past and the functional present.

*   **Display & Headlines (`notoSerif`):** This is our "Editorial Voice." It should be used with generous letter-spacing (tracking) in lowercase or standard sentence case. Avoid all-caps for large serifs to maintain a soft, approachable tone.
*   **Body & UI (`manrope`):** This is our "Technical Voice." A clean, geometric sans-serif that provides clarity. It should be used with slightly increased line-height (1.6+) to ensure the "breathing room" aesthetic persists even in dense text.

**Hierarchy Goal:** A `display-lg` headline should feel like a title in a coffee table book, while `label-sm` should look like a gallery caption.

---

## 4. Elevation & Depth
In this system, depth is "Physical Layering" rather than "Digital Shadowing."

*   **The Layering Principle:** Treat the UI as stacked sheets of fine paper. 
    *   *Base:* `surface`
    *   *Section:* `surface-container-low`
    *   *Interactive Card:* `surface-container-lowest` (This creates a "lifted" effect because the card is brighter than its container).
*   **Ambient Shadows:** Use only for floating elements (e.g., Modals, Dropdowns). 
    *   *Values:* `0px 20px 40px rgba(46, 52, 45, 0.06)`. The shadow color is a tint of `on-surface`, not black.
*   **Glassmorphism:** For navigation bars or floating "Quick Read" widgets, use `surface` at 80% opacity with a `20px` backdrop-blur. This integrates the UI into the background imagery.
*   **The "Ghost Border" Fallback:** If a border is required for input fields, use `outline-variant` at 20% opacity. It should be felt, not seen.

---

## 5. Components

### Buttons
- **Primary:** Background `primary`, text `on-primary`. Sharp 0px corners. Padding: `16px 32px`.
- **Secondary:** Background `transparent`, "Ghost Border" (20% `outline-variant`), text `primary`.
- **Tertiary:** Text `primary` with a 1px underline (`outline-variant`) spaced 4px below the baseline.

### Cards & Lists
- **Zero-Line Cards:** No borders. Use `surface-container-lowest` on top of a `surface-container` background.
- **List Items:** Prohibit divider lines. Use `16px` of vertical spacing between items. Use a `secondary` (gold) dot for bullet points to add a "spark" of color.

### Input Fields
- Underline style only. No containing box.
- Label: `label-md` in `on-surface-variant`.
- Active state: The underline transitions to `secondary` (gold).

### Special Astrology Components
- **The Zodiac Dial:** Use `thin lines` (0.5px) and `outline-variant` to create astronomical charts.
- **Daily Insight Card:** A high-contrast card using `inverse_surface` with `on_primary` text to create a moment of "Deep Space" focus amidst the beige layout.

---

## 6. Do's and Don'ts

### Do
- **Do** use asymmetrical layouts (e.g., a headline on the left with a small image offset to the right).
- **Do** use high-quality architectural photography where the "sky" or "light" is a focal point.
- **Do** embrace "The Void." If a page feels empty, it’s likely working.

### Don't
- **Don't** use rounded corners (`0px` is the absolute standard). Roundness breaks the architectural furniture vibe.
- **Don't** use vibrant purples, blues, or "galaxy" stock photos. 
- **Don't** use 100% black. Use `primary` or `on_surface` for a softer, more expensive feel.
- **Don't** use drop shadows on buttons. Let the color contrast and typography do the work.

---

## 7. Interaction Note
Transitions should be slow and "weighted." Use `cubic-bezier(0.2, 0, 0, 1)` for all transforms. Elements should fade and slide upward 10px simultaneously to mimic the turning of a heavy, high-quality paper page.```