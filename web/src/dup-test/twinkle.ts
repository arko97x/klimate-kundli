// Shared by the /dup-test landing and the flow's background stars.

// Twinkle modelled on a classic glint loop, played rarely: each star rests at
// full size, then briefly twists away to --twinkle-min (0 vanishes, 0.3 dips
// to a pinprick) and pops back from it still turning clockwise, a thinner
// diagonal star flashing as it overshoots. The twinkle is the first ~14% of a
// long 7–13s cycle (see TWINKLE_TIMING), so nearly every star is visible at
// any moment. The rotation jumps 45deg -> -45deg at the smallest point; for a
// four-point star that's a quarter turn, so it doesn't read as a snap.
// Tailwind v4's translate utilities use the standalone `translate` property,
// so animating `transform` doesn't fight the centring.
export const TWINKLE_CSS = `
.dup-star { --twinkle-min: 0; }
@keyframes dup-twinkle {
  0%    { transform: scale(1) rotate(0deg); }
  5%    { transform: scale(var(--twinkle-min)) rotate(45deg); animation-timing-function: step-end; }
  5.01% { transform: scale(var(--twinkle-min)) rotate(-45deg); }
  10%   { transform: scale(1.08) rotate(-6deg); }
  14%, 100% { transform: scale(1) rotate(0deg); }
}
@keyframes dup-glint {
  0%, 7%, 13%, 100% { transform: rotate(40deg) scale(0); }
  10% { transform: rotate(55deg) scale(0.6); }
}
.dup-star > .dup-star-main { animation: dup-twinkle var(--twinkle-dur) ease-in-out var(--twinkle-delay) infinite backwards; }
.dup-star > .dup-star-glint { transform: scale(0); opacity: 0.75; animation: dup-glint var(--twinkle-dur) ease-in-out var(--twinkle-delay) infinite backwards; }
@media (prefers-reduced-motion: reduce) {
  .dup-star > .dup-star-main, .dup-star > .dup-star-glint { animation: none; }
}
`

// Per-star [cycle length, first twinkle after load], in seconds. Hand-spread
// so no two stars start together; the unequal cycles keep them drifting
// apart afterwards rather than falling into a rhythm.
export const TWINKLE_TIMING: [number, number][] = [
  [9.1, 1.2],
  [11.7, 4.6],
  [7.9, 7.4],
  [12.9, 2.8],
  [8.3, 5.9],
  [10.1, 0.5],
  [11.1, 8.6],
  [7.3, 3.7],
  [9.7, 6.6],
]
