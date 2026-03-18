# Visual Review Checklist

When a screenshot test fails in `@share-proxy/video-player`, check the new `actual` image against this list before updating the baseline.

## General
- No Storybook/browser chrome should bleed into the captured component state.
- Rounded popup corners should not reveal unexpected light/gray artifacts.
- Content should not be clipped unless the story is intentionally demonstrating overflow.
- The screenshot should contain the complete intended component state, not a partial crop.

## Full Player
- Time above the progress handle should sit over the handle, not at the far left edge.
- Bottom time display should render as `{primary} / {total}` with a visible space before `/`.
- Popup screenshots should not include stray counters, badges, or toolbar artifacts.
- Full-player popup states should be fully inside the frame and not look like they drifted off-screen.
- Full-player settings popup should overlap the timeline area enough that it visually sits over the timeline, but it must not cover the settings button.
- Full-player settings screenshots should include hover states for both the first and last rows.
- There should be a full-player screenshot with the second settings page open.

## Popup / Settings Popup
- Header horizontal padding should visually match regular popup rows.
- Header top and bottom insets should feel symmetrical relative to the popup edge and divider.
- Header button should not appear hovered/pressed unless the story is explicitly about that state.
- The dedicated header-hover screenshot should show only the intended hover styling on the back button.
- Popup-only screenshots should contain only the popup, without stage bleed or unrelated content below.
- The divider should sit directly above the first row without an awkward dead gap.
- If the popup is taller than the viewport, the list should scroll while the header stays visible.
- Returning from a tall submenu should restore the root popup height.
- Secondary values in slider rows should be right-aligned, not collapse next to the label.
- Ambient popup screenshots should show the full Blur row and slider, not a cropped lower section.
- In ambient screenshots, `Bright` should only appear selected when the slider is exactly at the Bright preset.
- Root popup screenshots should keep visually equal outer padding on all four sides.

## Timeline / Control Bar
- Current-time badge should sit above the handle.
- Preview-time screenshot should not show current-time and preview-time colliding.
- Leftmost text should not be clipped by the screenshot framing.
- Slash and total duration should use secondary styling and remain readable.
- There should be a timeline screenshot with the preview image visible above the handle.

## Icons
- The `volume-off` glyph should render as the speaker-with-x mute icon, not as a loudness icon.
- Icon cards should stay evenly aligned in the grid without clipped labels or cropped glyphs.

## Workflow
1. Inspect the `actual` screenshot from Playwright artifacts.
2. Compare it against the checklist above.
3. If the new rendering is expected, update snapshots with:
   - `pnpm --filter @share-proxy/video-player test:storybook:update`
4. If it is not expected, fix the UI or the story state first.
