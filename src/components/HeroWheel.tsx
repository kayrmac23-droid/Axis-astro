import { createElement as h, ReactElement } from 'react'

/**
 * Hero instrument — dual-zodiac ring. Outer tropical ring, inner sidereal ring
 * rotated by −offset (the Lahiri ayanamsa), a copper wedge spanning the two 0°
 * marks, core cross-hair with a gold glow, legend chips and an offset
 * annotation box. Ported from the redesign prototype's `buildHero`.
 *
 * `offset` is the ayanamsa in degrees for the selected epoch; the sidereal ring
 * and the annotation follow it live via the epoch slider.
 */

const VS = '︎'
const SG = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(g => g + VS)
const MONO = "var(--font-mono)"

function dms(v: number) {
  v = Math.max(0, v)
  let d = Math.floor(v)
  let m = Math.round((v - d) * 60)
  if (m === 60) { d++; m = 0 }
  return d + '°' + String(m).padStart(2, '0') + '′'
}

function pt(L: number, r: number): [number, number] {
  const a = (-90 - L) * Math.PI / 180
  return [500 + r * Math.cos(a), 500 + r * Math.sin(a)]
}

export default function HeroWheel({ offset }: { offset: number }) {
  const A0 = offset
  const LINE = 'rgba(233,231,242,.30)'
  const LINE2 = 'rgba(233,231,242,.5)'
  const NUM = '#9B98BC'
  const EASE = 'transform .5s cubic-bezier(.65,0,.35,1)'
  const kids: ReactElement[] = []

  const ring = (rIn: number, rOut: number, gR: number, fs: number, color: string, rot: number) => {
    const g: ReactElement[] = [
      h('circle', { key: 'o', cx: 500, cy: 500, r: rOut, fill: 'none', stroke: LINE2, strokeWidth: 1.3 }),
      h('circle', { key: 'i', cx: 500, cy: 500, r: rIn, fill: 'none', stroke: LINE, strokeWidth: 1.1 }),
    ]
    for (let i = 0; i < 12; i++) {
      const p1 = pt(i * 30, rIn), p2 = pt(i * 30, rOut)
      g.push(h('line', { key: 'l' + i, x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: LINE, strokeWidth: 1 }))
      const c = pt(i * 30 + 15, gR)
      g.push(h('text', {
        key: 'g' + i, x: c[0], y: c[1], textAnchor: 'middle', dominantBaseline: 'central',
        fontSize: fs, fill: color,
        style: rot ? { transform: `rotate(${rot}deg)`, transformOrigin: `${c[0]}px ${c[1]}px`, transition: EASE } : undefined,
      }, SG[i]))
    }
    return g
  }

  const scale = (rEdge: number, numR: number, fs: number) => {
    const g: ReactElement[] = []
    for (let d = 0; d < 360; d++) {
      const maj = d % 10 === 0, mid = d % 5 === 0, len = maj ? 15 : (mid ? 9.5 : 5.5)
      const p1 = pt(d, rEdge), p2 = pt(d, rEdge - len)
      g.push(h('line', { key: 't' + d, x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: maj ? LINE2 : LINE, strokeWidth: maj ? 1.1 : 0.6, opacity: maj ? 0.9 : 0.6 }))
      if (maj) {
        const np = pt(d, numR)
        g.push(h('text', { key: 'n' + d, x: np[0], y: np[1], textAnchor: 'middle', dominantBaseline: 'middle', fontSize: fs, fill: NUM, opacity: 0.9, fontFamily: MONO, transform: `rotate(${-d} ${np[0]} ${np[1]})` }, String(d)))
      }
    }
    return g
  }

  kids.push(h('circle', { key: 'outer', cx: 500, cy: 500, r: 460, fill: 'none', stroke: 'rgba(233,231,242,.16)', strokeWidth: 1 }))

  if (A0 > 0.05) {
    const o1 = pt(0, 436), o2 = pt(A0, 436), i2 = pt(A0, 215), i1 = pt(0, 215)
    kids.push(h('path', { key: 'wedge', d: `M${o1[0]},${o1[1]} A436,436 0 0 0 ${o2[0]},${o2[1]} L${i2[0]},${i2[1]} A215,215 0 0 1 ${i1[0]},${i1[1]} Z`, fill: 'rgba(184,115,51,.10)', stroke: 'rgba(216,148,85,.35)', strokeWidth: 1 }))
  }

  kids.push(
    h('line', { key: 'tz', x1: 500, y1: 288, x2: 500, y2: 52, stroke: '#E9E7F2', strokeWidth: 1.4, opacity: 0.85 }),
    h('circle', { key: 'tzc', cx: 500, cy: 58, r: 3, fill: '#E9E7F2' }),
  )

  kids.push(h('g', { key: 'trop' }, ring(375, 435, 405, 30, '#DCA05F', 0).concat(scale(373, 352, 9))))

  for (let i = 0; i < 12; i++) {
    const p = pt(i * 30, 478)
    kids.push(h('text', { key: 'dl' + i, x: p[0], y: p[1], textAnchor: 'middle', dominantBaseline: 'middle', fontSize: 12, letterSpacing: 1, fill: '#8F8CAB', fontFamily: MONO }, i * 30 + '°'))
  }

  const sid = ring(245, 305, 275, 22, '#C08A50', A0).concat(scale(243, 224, 8))
  sid.push(
    h('line', { key: 'sz', x1: 500, y1: 288, x2: 500, y2: 70, stroke: '#D89455', strokeWidth: 1.6, opacity: 0.9 }),
    h('circle', { key: 'szc', cx: 500, cy: 76, r: 3.2, fill: '#D89455' }),
  )
  kids.push(h('g', { key: 'sid', style: { transform: `rotate(${-A0}deg)`, transformOrigin: '500px 500px', transition: EASE } }, sid))

  const core: ReactElement[] = [
    h('circle', { key: 'c1', cx: 500, cy: 500, r: 150, fill: 'none', stroke: LINE, strokeWidth: 1, opacity: 0.8 }),
    h('circle', { key: 'c2', cx: 500, cy: 500, r: 95, fill: 'none', stroke: LINE, strokeWidth: 1, opacity: 0.6 }),
  ]
  ;[0, 90, 180, 270].forEach(ax => {
    const q1 = pt(ax, 18), q2 = pt(ax, 150), fp = pt(ax, 159), lp = pt(ax, 177)
    core.push(
      h('line', { key: 'a' + ax, x1: q1[0], y1: q1[1], x2: q2[0], y2: q2[1], stroke: LINE, strokeWidth: 1, opacity: 0.85 }),
      h('rect', { key: 'r' + ax, x: fp[0] - 3.4, y: fp[1] - 3.4, width: 6.8, height: 6.8, fill: 'none', stroke: 'rgba(233,231,242,.45)', strokeWidth: 1, transform: `rotate(45 ${fp[0]} ${fp[1]})` }),
      h('text', { key: 't' + ax, x: lp[0], y: lp[1], textAnchor: 'middle', dominantBaseline: 'middle', fontSize: 9.5, fill: '#6F6C8E', fontFamily: MONO }, ax + '°'),
    )
  })
  ;[[435, 500], [565, 500]].forEach(([x, y], i) =>
    core.push(h('path', { key: 's' + i, d: `M${x},${y - 7} L${x + 1.9},${y - 1.9} L${x + 7},${y} L${x + 1.9},${y + 1.9} L${x},${y + 7} L${x - 1.9},${y + 1.9} L${x - 7},${y} L${x - 1.9},${y - 1.9} Z`, fill: '#E9D9BC', opacity: 0.9 })),
  )
  core.push(
    h('circle', { key: 'glow', cx: 500, cy: 500, r: 46, fill: 'url(#axHeroGlow)' }),
    h('line', { key: 'x1', x1: 500, y1: 483, x2: 500, y2: 517, stroke: '#F0B978', strokeWidth: 1, opacity: 0.9 }),
    h('line', { key: 'x2', x1: 483, y1: 500, x2: 517, y2: 500, stroke: '#F0B978', strokeWidth: 1, opacity: 0.9 }),
    h('circle', { key: 'dot', cx: 500, cy: 500, r: 3.6, fill: '#2CC8C0' }),
  )
  kids.push(h('g', { key: 'core' }, core))

  kids.push(h('g', { key: 'chips' }, [
    h('line', { key: 'l1', x1: 726, y1: 130, x2: 806, y2: 96, stroke: 'rgba(233,231,242,.35)', strokeWidth: 1, strokeDasharray: '2 5' }),
    h('text', { key: 't1', x: 812, y: 92, fontSize: 12, letterSpacing: 4, fill: 'rgba(233,231,242,.75)', fontFamily: MONO }, 'TROPICAL'),
    h('line', { key: 'l2', x1: 712, y1: 292, x2: 800, y2: 252, stroke: 'rgba(216,148,85,.45)', strokeWidth: 1, strokeDasharray: '2 5' }),
    h('text', { key: 't2', x: 806, y: 248, fontSize: 12, letterSpacing: 4, fill: 'rgba(216,148,85,.85)', fontFamily: MONO }, 'SIDEREAL'),
  ]))

  const mid = pt(Math.max(A0, 3) / 2, 444)
  kids.push(h('g', { key: 'annot' }, [
    h('path', { key: 'ld', d: `M238,168 L330,168 L${mid[0]},${mid[1]}`, fill: 'none', stroke: 'rgba(233,231,242,.4)', strokeWidth: 1, strokeDasharray: '2 5' }),
    h('rect', { key: 'bx', x: 60, y: 128, width: 176, height: 88, fill: 'rgba(2,3,10,.82)', stroke: '#D89455', strokeWidth: 1 }),
    h('text', { key: 'v', x: 82, y: 166, fontSize: 21, fontWeight: 700, letterSpacing: 1, fill: '#E9E7F2', fontFamily: MONO }, dms(A0)),
    h('text', { key: 'a1', x: 82, y: 188, fontSize: 10, letterSpacing: 3, fill: '#D89455', fontFamily: MONO }, 'LAHIRI'),
    h('text', { key: 'a2', x: 82, y: 203, fontSize: 10, letterSpacing: 3, fill: '#D89455', fontFamily: MONO }, 'OFFSET'),
  ]))

  return h('svg', {
    viewBox: '0 0 1000 1000', role: 'img',
    'aria-label': 'Dual-zodiac instrument: tropical ring outside, sidereal ring inside, offset by the Lahiri ayanamsa',
    style: { width: '100%', height: 'auto', display: 'block' },
  }, [
    h('defs', { key: 'd' }, h('radialGradient', { id: 'axHeroGlow', cx: '.5', cy: '.5', r: '.5' }, [
      h('stop', { key: 1, offset: '0', stopColor: 'rgba(240,185,120,.55)' }),
      h('stop', { key: 2, offset: '.45', stopColor: 'rgba(216,148,85,.16)' }),
      h('stop', { key: 3, offset: '1', stopColor: 'rgba(216,148,85,0)' }),
    ])),
    ...kids,
  ])
}

export { dms as heroDms }
