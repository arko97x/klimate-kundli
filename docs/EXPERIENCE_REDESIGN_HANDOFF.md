# Klimate Kundli experience redesign — research and build handoff

Status: research and product direction only. No redesign implementation currently exists in the branch.

This document preserves the decisions reached before the implementation reset. It is intended to let another agent begin from a clean working tree without repeating the discovery work or reviving rejected directions.

## Non-negotiable project constraint

Nothing built for this redesign may break or silently alter the existing `klimatekundli.com` experience.

- Preserve the existing `/`, `/exhibition`, `/k/:slug`, gallery, documentation, and print/result behavior.
- Build the redesigned input experience on a new, isolated test route first. The route name is not yet fixed.
- Prefer route-level lazy loading so experimental JavaScript and CSS do not increase the existing pages' initial bundle.
- Reuse the current API contract. Do not introduce a parallel backend unless the existing contract genuinely cannot support the flow.
- Do not replace the public flow until the new one has been tested and explicitly approved.
- Work carefully in a dirty tree. At the time this document was created, `designup26-dev` was clean.

## What Klimate Kundli is

Klimate Kundli is a climate horoscope presented as an exhibit at a conference or exhibition—not primarily a conventional website and not specifically a museum installation.

Its conceptual layers are:

- astrology: the kundli, the astrologer's reading, the crystal ball, remedies, fate language;
- astronomy: stars, celestial charts, cycles, sky-reading;
- geography: birthplace, cities lived in, coordinates, movement across a map;
- climate science: measured changes in temperature, rain, ice, emissions, sea level, and related records.

The wrapper is mystical and theatrical; the measurements underneath are real. The experience should hold those two registers together rather than collapsing into either fantasy or a generic scientific dashboard.

The parrot is conceptually important. It comes from the South Asian parrot astrologer, not from a generic mascot system. The crystal ball belongs to the visual language of fortune-telling. Both should feel native to the work rather than decorative product illustrations.

For the project's full conceptual framing, read the repository [README](../README.md).

## Exhibition-use reality

Assume:

- people encounter the interface in a public, time-limited setting;
- many visitors will be first-time users;
- an operator may not always be available to explain the interface;
- visitors may use either a booth display or their own phone;
- the flow must be understandable from the interface itself;
- hesitation, ambiguity, and precision-heavy gestures are disproportionately costly.

The interaction must work “out of the box.” A small contextual nudge from the parrot astrologer is welcome when it reduces confusion, but a tutorial that teaches unusual controls is evidence that the control should probably be redesigned.

## Current experience assessment

### What already works

- The concept is distinctive and culturally specific.
- The kundli geometry gives the project a recognizable structural language.
- The parrot and crystal ball make the astrologer framing legible without lengthy exposition.
- The existing white, black, grey, and restrained magenta-purple visual system is memorable.
- The contrast between mystical presentation and credible data is the project's central strength.
- The existing result and print experiences contain substantial work that the redesigned input flow should feed, not replace.

### What does not work well enough

- The lived-cities step is difficult to understand without explanation.
- Some people do not realize that they must drag the year slider.
- Adding another residence is hidden behind the need to shorten the previous range first.
- A drag-only timeline asks visitors to understand both the interaction and the data model simultaneously.
- Year ranges, coverage, and gaps are work the software can infer but currently pushes onto the visitor.
- The absolute, fixed-height composition breaks down on small screens.
- `h-screen`/overflow-hidden patterns make browser chrome, software keyboards, and short landscape viewports risky.
- The interface feels too static for its astrological and atmospheric premise, but added motion must remain restrained.

## Primary interaction decision

Replace the lived-city slider editor with a guided **move-event wizard**.

The user should report events they remember naturally:

1. Where and when were you born?
2. Did you move away from that city?
3. If yes, where did you move next?
4. In approximately which year did that city become home?
5. Did you move again?
6. Repeat only as necessary.
7. Review the automatically constructed residence timeline.
8. Generate the Klimate Kundli.

Do not ask users to construct start/end ranges. Do not require dragging. Do not make a gesture the only way to complete a required action.

### Suggested conversational states

The exact copy can change, but each screen should ask one clear question.

| State | Core question | Primary action |
| --- | --- | --- |
| Origin | “Where did your climate story begin?” | Select birthplace and birth year |
| First move check | “Did you move away from {birth city}?” | “Yes, I moved” / “No, I stayed there” |
| Destination | “Where did you move next?” | Select a city |
| Move year | “When did {city} become home?” | Select an approximate year |
| Further move check | “Did you move again after {city}?” | “Yes, one more move” / “No, that is my current city” |
| Review | “Does this journey look right?” | Edit/add/remove, then generate |

The visitor should always have:

- a predictable Back action;
- a visible sense of progress without implying a fixed number of moves;
- plain-language helper text near unfamiliar inputs;
- a non-destructive way to correct mistakes;
- confirmation before clearing the entire journey.

### Year input

Use a native select or similarly accessible explicit year picker on phones. An approximate year is enough. Showing the person's approximate age alongside the selected move year can help validate the answer.

Avoid another range slider. The problem is not merely its styling; it is the mismatch between a range-editing control and how people remember moves.

### Timeline derivation

Represent the interaction internally as an origin plus ordered move events:

```ts
type MoveEvent = {
  city: City
  year: number
}
```

Derive the API's `LivedCity[]` automatically:

- the origin starts on `birthYear-01-01`;
- each residence ends on 31 December of the year before the next move;
- each next residence begins on 1 January of its move year;
- the last residence has `end: null`;
- require move years to increase strictly;
- the UI, not the visitor, guarantees there are no gaps or overlaps.

This preserves the existing backend interface while removing the range-management burden from the visitor.

Relevant code:

- `web/src/types.ts`
- `web/src/lib/lived-cities.ts`
- `web/src/lib/api.ts`
- `web/src/KundliApp.tsx`
- `web/src/components/CitySearchCombobox.tsx`

The existing generation path is `fetchMonthlyDelta(...)` → `saveKundli(...)` → `/k/:slug`. The experiment should eventually use that path so its output remains compatible with the current result pages.

## Visual direction: preserve the existing Klimate Kundli language

This is an explicit user decision.

The redesigned flow may change interaction and responsive layout, but its page aesthetics must feel like the existing Klimate Kundli—not like a separate product or reskin.

Use the current homepage and wizard as the visual source of truth:

- `web/src/expt/KundliWizardLayout.tsx`
- `web/src/expt/Header.tsx`
- `web/src/components/BirthStep.tsx`
- `web/src/components/LivedCitiesStep.tsx`
- `web/src/assets/parrot-step1.svg`
- `web/src/assets/parrot-step2.svg`
- `web/src/assets/parrot-white.svg`
- `web/src/assets/star.svg`
- `web/src/index.css`

### Keep

- a predominantly white canvas;
- black typography and strong black geometric areas/actions;
- hairline neutral-grey kundli/chart construction lines;
- the project's existing typography and logo treatment;
- sharp or square geometry where the current interface uses it;
- the existing parrot illustrations and their pose changes;
- the existing magenta-purple crystal ball as the principal colour accent;
- four-point stars and the current celestial vocabulary;
- open space and the feeling of an illustrated exhibit, not a dense application shell.

### Do not repeat

A previous experimental implementation used a dark purple “mystical terminal” shell with glowing cyan/gold accents, glass-like panels, a large custom gradient orb, and dashboard-style readouts. The user rejected that direction strongly.

Do **not** bring back:

- a dark full-page palette;
- neon cyan/gold UI accents;
- cyberpunk, hacker-terminal, or game-HUD styling;
- glassmorphism or a two-panel SaaS/dashboard composition;
- oversized editorial headings unrelated to the current type system;
- a replacement crystal ball that competes with the existing artwork;
- rounded-card-heavy “AI product” styling.

The requested sense of “computer terminal, data, geography” should come from restrained details—coordinates, year stamps, grid lines, small data labels, registration marks, and geographic sequencing—not from changing the established colour world.

## Adding life without changing the identity

Motion is desired, but it should behave like atmosphere and system feedback.

### Stars

- Stars may twinkle subtly and asynchronously.
- Use varied durations and negative delays so they do not pulse together.
- Animate only opacity and a very small scale change.
- Keep most stars dim most of the time.
- Preserve the existing four-point star shape rather than replacing it with generic dots.

### Crystal ball

- Reuse the existing crystal-ball artwork.
- Add a faint clipped shimmer or slow internal fluid/gas drift inside the ball.
- While climate data is being generated, the internal movement may become slightly more active to indicate work.
- Do not move the whole ball continuously or create a new dominant gradient object.

### Parrot

- Prefer semantic pose changes over idle character animation.
- The existing birth and lived-city illustrations already provide useful states.
- If any breathing/settling motion is used, it should be nearly imperceptible.
- The parrot may supply concise contextual guidance, but it should not become a chat assistant UI.

### Interaction motion

- Button press feedback: approximately 100–160 ms, subtle scale around `0.97–0.985`.
- Screen/question entry: fast opacity plus a small transform, generally under 300 ms.
- Use CSS for deterministic animation; do not add a motion dependency for simple effects.
- Gate hover effects with `(hover: hover) and (pointer: fine)`.
- Honor `prefers-reduced-motion`; remove spatial motion while retaining helpful state changes.
- Provide a visible pause/“still” control if decorative ambient motion continues for more than five seconds.

Motion purposes, in priority order:

1. feedback that the interface received an action;
2. explaining a state change;
3. showing that generation is in progress;
4. restrained atmosphere.

If an animation serves none of those purposes, omit it.

## Responsive and mobile requirements

Mobile is a first-class target, not a later adaptation.

- Build in normal document flow. Do not position the entire wizard absolutely.
- Use `min-height: 100svh` for a stable first screen or `100dvh` where the layout must track visible browser chrome.
- Never disable pinch zoom.
- Keep input/select text at least 16 px on coarse pointers to prevent iOS focus zoom.
- Make primary touch targets at least 44 × 44 px; prefer 48 px for key actions.
- Use `touch-action: manipulation` for buttons and links.
- Provide immediate `:active` feedback.
- Apply `-webkit-tap-highlight-color` intentionally.
- Respect safe-area insets when the route enables `viewport-fit=cover`.
- Avoid nested scrolling unless a bounded list genuinely requires it.
- Ensure no horizontal overflow at 375 px.
- Test with the software keyboard open and in phone landscape.
- Keep core questions and actions before decorative content in mobile reading order.
- Do not infer touch solely from viewport width; use pointer/hover media capabilities.

Browser emulation is useful for layout but cannot prove sticky hover, keyboard resizing, overscroll, notch behavior, or physical tap feel. Final approval requires real-phone testing.

## Accessibility and comprehension

- Every input needs a visible `<label>` and nearby helper/error text.
- Connect helpers with `aria-describedby` where useful.
- Use semantic `<button>`, `<a>`, `<label>`, `<select>`, `<ol>`, and `<time>` elements.
- Decorative icons and artwork should be hidden from assistive technology; meaningful media needs appropriate text.
- Maintain visible `:focus-visible` states.
- Move focus to the new question heading after wizard transitions for screen-reader orientation.
- Announce generation and errors with an appropriate live region.
- Never rely on colour alone to communicate progress or validation.
- Disabled actions must explain what is missing through nearby text, not only reduced opacity.
- Preserve keyboard completion of the entire flow.
- Provide a skip link if decorative or repeated material precedes the form.

## Recommended implementation order

Build a vertical slice on the isolated route:

1. Read the repository instructions and confirm the worktree state.
2. Re-inspect the existing live wizard and its assets; treat them as the design system.
3. Implement the move-event state model and conversion to `LivedCity[]`.
4. Build the origin → move loop → review interaction with real city search.
5. Apply the existing Klimate Kundli visual language immediately; do not present an unstyled generic wizard for review.
6. Add only the approved ambient motion: star twinkle, ball shimmer, semantic parrot states.
7. Lazy-load the experimental route.
8. Validate desktop, 375 px mobile, and landscape.
9. Run the production build and targeted lint.
10. Exercise the journey through review using the real geocoder, but do not save junk Kundlis to the shared store merely for UI testing.
11. Test on a real phone before claiming that mobile behavior is complete.

Interaction logic should be built before polish at the code level, but the first user-facing prototype should already look unmistakably like Klimate Kundli. Flow and aesthetic are not separate approval tracks.

## Acceptance criteria

The experiment is ready for user review when:

- a first-time visitor can complete it without verbal instruction;
- no required action depends on dragging, swiping, or hover;
- birthplace and birth year are clear and labelled;
- the user can report zero, one, or multiple moves;
- the software derives a continuous residence timeline;
- review clearly shows each city and year span;
- mistakes can be corrected without restarting everything;
- clearing everything requires confirmation;
- generation uses the existing API/result pipeline;
- the new route has no effect on current production routes;
- the design is immediately recognizable as the existing Klimate Kundli;
- the only strong colour accent remains the established crystal-ball magenta-purple;
- stars and the ball feel alive but never distract from the question;
- reduced-motion users receive a calm, fully usable experience;
- there is no horizontal overflow at 375 px;
- touch targets, focus states, labels, loading feedback, and error recovery are present;
- the production frontend build succeeds.

## Questions still open for the next build

These are product choices, not research gaps. Make a conservative assumption for the test route or ask before promoting the experience:

- What should the temporary route be called?
- Should visitors enter every meaningful residence or only birthplace/current city in the conference fast path?
- How should a visitor edit an earlier move from the review screen: inline, step-back navigation, or a compact edit sheet?
- Should “Start again” exist during the flow, or only on review?
- How much parrot guidance is useful before it becomes repetitive?
- Should the event/kiosk route auto-reset after inactivity?

## Research inputs

The direction above was informed by the project's existing interface and documentation plus the following design-engineering references:

- [Emil Kowalski — Skill](https://emilkowal.ski/skill)
- [emilkowalski/skills repository](https://github.com/emilkowalski/skills)
- [emil-design-eng](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md)
- [mobile-native](https://github.com/emilkowalski/skills/blob/main/skills/mobile-native/SKILL.md)
- [animate](https://github.com/emilkowalski/skills/blob/main/skills/animate/SKILL.md)
- [apple-design](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md)
- [pick-ui-library](https://github.com/emilkowalski/skills/blob/main/skills/pick-ui-library/SKILL.md)
- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md)

No additional UI library was found necessary for the proposed wizard. The current React stack, native form controls, the existing city combobox, and CSS are sufficient unless later requirements introduce a genuinely complex component.

## Final instruction to the implementing agent

Keep the flow redesign. Keep the research. Start the implementation fresh.

Do not copy code or styling from the deleted dark prototype. Preserve the identity that already belongs to Klimate Kundli, and make its lived-cities interaction finally understandable on the first encounter.
