// lib/unknown-time-notice.ts
// Deterministic stand-in for the Ascendant/Lagna section when the birth time is
// unknown. Starts with the same ## heading the model section would, so the client
// renders it in place (and attaches the Ascendant readout card via bodiesForHeading).
// It states the limitation plainly instead of interpreting an angle that is, at
// noon, uniform across the whole zodiac. Lives here rather than in the route so
// the batch eval harness (scripts/eval-readings.mjs) emits the identical text.
export function unknownTimeAngleNotice(planetSection: string): string {
  const heading = planetSection === 'lagna' ? '## The Lagna (Ascendant)' : '## The Ascendant'
  return `${heading}

Birth time is unknown for this chart, so noon has been used as a placeholder. The Ascendant — and every house placement that follows from it — depends on the exact minute of birth: it advances a full sign roughly every two hours, so across a single day it can land in any of the twelve signs. With no time to anchor it, no honest reading of the rising sign, the chart ruler, the houses, or the Midheaven can be given here.

This section is deliberately left uninterpreted rather than filled with claims the data cannot support. The rest of the reading stands on firmer ground: planetary signs, dignities, and the sign-based aspects between planets do not depend on birth time and remain accurate. If you can recover even an approximate birth time, re-casting the chart will unlock this section and sharpen the Moon and the houses throughout.`
}
