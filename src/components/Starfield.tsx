import styles from './Starfield.module.css'

/**
 * Fixed celestial background — 215 seeded stars (opacity .12–.82, r .4–1.9,
 * ~9% twinkling) plus two large dashed precession arcs, one copper, one
 * star-white. Ported from the redesign prototype's `buildSky`. Purely
 * decorative: pointer-events none, z-index 0, drawn once behind all content.
 */

// Deterministic LCG so the field is identical on server and client (no
// hydration mismatch) and stable between renders.
function makeStars() {
  let s = 7
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
  const stars: {
    cx: number; cy: number; r: number; opacity: number
    twinkle: boolean; dur: number; delay: number
  }[] = []
  for (let i = 0; i < 215; i++) {
    const twinkle = rnd() < 0.09
    stars.push({
      cx: rnd() * 1920,
      cy: rnd() * 1080,
      r: 0.4 + Math.pow(rnd(), 2) * 1.5,
      opacity: 0.12 + rnd() * 0.7,
      twinkle,
      dur: 4 + rnd() * 6,
      delay: rnd() * 7,
    })
  }
  return stars
}

const STARS = makeStars()

export default function Starfield() {
  return (
    <div className={styles.field} aria-hidden="true">
      <svg
        viewBox="0 0 1920 1080"
        preserveAspectRatio="xMidYMid slice"
        className={styles.svg}
      >
        {STARS.map((st, i) => (
          <circle
            key={i}
            cx={st.cx}
            cy={st.cy}
            r={st.r}
            fill="#CFD6EC"
            opacity={st.opacity}
            style={
              st.twinkle
                ? { animation: `axTw ${st.dur}s ${st.delay}s ease-in-out infinite` }
                : undefined
            }
          />
        ))}
        <circle cx={1960} cy={-90} r={640} fill="none" stroke="rgba(184,115,51,.13)" strokeDasharray="1 7" />
        <circle cx={-130} cy={1170} r={540} fill="none" stroke="rgba(233,231,242,.07)" strokeDasharray="1 6" />
      </svg>
    </div>
  )
}
