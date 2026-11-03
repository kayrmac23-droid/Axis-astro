// Formats a degree WITHIN a sign as D°MM' (e.g. 14°22'). Client-safe and tiny,
// shared by the natal context (interpretation-engine.ts) and the synastry block.
//
// Arcminutes are rounded, so 19.9958° rounds to 60' and carries to 20°00'. At
// the top of the sign that carry would reach 30°00' — or, as the old copy did,
// wrap to 0°00' while the sign label stays the same, which reads as 30° off.
// The sign is printed by the caller and is not changed here, so the value is
// clamped to the last arcminute of its own sign instead.
export function fmtDeg(deg: number): string {
  const total = Math.min(Math.round(deg * 60), 30 * 60 - 1)
  return `${Math.floor(total / 60)}°${String(total % 60).padStart(2, '0')}'`
}
