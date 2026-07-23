'use client'
/* ============================================================
   PreviewLanding — the AXIS home view, ported from
   public/preview.html (doctrine-audited source of truth).

   Markup and CSS values are preserved verbatim; the inline
   <script> behaviour (starfield, dual-zodiac instrument, epoch
   scrubber, scroll-reveal) is ported into a single guarded
   useEffect that builds the SVG imperatively exactly as the
   source did. The placeholder calibration form is replaced by
   the real <BirthForm>, wired to the live cast flow; the cast
   CTAs scroll to it. preview.html's SPA router, its sub-pages
   (method / sample / protocol / synastry — already real routes),
   its duplicate top-bar (the global SiteHeader supplies nav),
   and its placeholder-form / synastry-mini script blocks are
   intentionally dropped.
   ============================================================ */
import { useEffect, useRef } from 'react'
import Link from 'next/link'
import BirthForm from '@/components/BirthForm'
import styles from './PreviewLanding.module.css'

interface PreviewLandingProps {
  onSubmit: (formData: Record<string, string>) => void
  loading: boolean
  error: string | null
  onRetry: () => void
}

export default function PreviewLanding({ onSubmit, loading, error, onRetry }: PreviewLandingProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const calibRef = useRef<HTMLElement>(null)
  const built = useRef(false)

  const scrollToCast = () =>
    calibRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  useEffect(() => {
    if (built.current) return
    built.current = true

    const NS = 'http://www.w3.org/2000/svg'
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    function el(tag: string, attrs: Record<string, string | number>, parent?: Element) {
      const e = document.createElementNS(NS, tag)
      for (const k in attrs) e.setAttribute(k, String(attrs[k]))
      if (parent) parent.appendChild(e)
      return e
    }
    function pt(L: number, r: number): [number, number] {
      const a = (-90 - L) * Math.PI / 180
      return [500 + r * Math.cos(a), 500 + r * Math.sin(a)]
    }
    function f2(n: number) { return Number(n.toFixed(2)) }

    /* ---------- starfield ---------- */
    ;(function () {
      const g = document.getElementById('starsG')
      if (!g) return
      let i, x, y, r, o, s
      for (i = 0; i < 215; i++) {
        x = Math.random() * 1920; y = Math.random() * 1080
        r = .4 + Math.pow(Math.random(), 2) * 1.5; o = .12 + Math.random() * .7
        s = el('circle', { cx: f2(x), cy: f2(y), r: f2(r), fill: '#CFD6EC', opacity: f2(o) }, g)
        if (!reduce && Math.random() < .09) { s.setAttribute('class', styles.tw); (s as SVGElement).style.animationDelay = (Math.random() * 7) + 's'; (s as SVGElement).style.animationDuration = (4 + Math.random() * 6) + 's' }
      }
      for (i = 0; i < 42; i++) {
        const t = Math.random()
        x = 1530 + 330 * t + (Math.random() - .5) * 170; y = -40 + 1160 * t + (Math.random() - .5) * 90
        if (x < 0 || x > 1920) continue
        el('circle', { cx: f2(x), cy: f2(y), r: f2(.3 + Math.random() * .9), fill: '#CFD6EC', opacity: f2(.08 + Math.random() * .35) }, g)
      }
      ;[[300, 180], [560, 830], [1210, 240], [1470, 700]].forEach(function (p) {
        el('circle', { cx: p[0], cy: p[1], r: 1.8, fill: '#E4E9F8', opacity: .85 }, g)
        el('line', { x1: p[0] - 13, y1: p[1], x2: p[0] + 13, y2: p[1], stroke: 'rgba(210,218,240,.4)', 'stroke-width': .6 }, g)
        el('line', { x1: p[0], y1: p[1] - 13, x2: p[0], y2: p[1] + 13, stroke: 'rgba(210,218,240,.4)', 'stroke-width': .6 }, g)
      })
    })()

    /* ---------- instrument ---------- */
    const LINE = 'rgba(233,231,242,.30)', LINE2 = 'rgba(233,231,242,.5)', NUM = '#9B98BC'
    const GLYPH_OUT = '#DCA05F', GLYPH_IN = '#C08A50'
    const innerGlyphs: Element[] = []
    const A0 = 24.2167
    function ayan(y: number) { const t = y - 285, a = 0.013860 * t + 2.87e-8 * t * t; return a < 0 ? 0 : a }
    function fmtA(a: number) { let d = Math.floor(a), m = Math.round((a - d) * 60); if (m === 60) { d++; m = 0 } return d + '°' + (m < 10 ? '0' : '') + m + '′' }

    function ringSet(parent: Element, rIn: number, rOut: number, glyphR: number, glyphS: number, color: string, store: Element[] | null) {
      el('circle', { cx: 500, cy: 500, r: rOut, fill: 'none', stroke: LINE2, 'stroke-width': 1.3 }, parent)
      el('circle', { cx: 500, cy: 500, r: rIn, fill: 'none', stroke: LINE, 'stroke-width': 1.1 }, parent)
      let i
      for (i = 0; i < 12; i++) {
        const p1 = pt(i * 30, rIn), p2 = pt(i * 30, rOut)
        el('line', { x1: f2(p1[0]), y1: f2(p1[1]), x2: f2(p2[0]), y2: f2(p2[1]), stroke: LINE, 'stroke-width': 1 }, parent)
      }
      for (i = 0; i < 12; i++) {
        const L = i * 30 + 15, c = pt(L, glyphR)
        const wrap = el('g', { 'data-cx': f2(c[0]), 'data-cy': f2(c[1]) }, parent)
        ;(wrap as SVGElement).style.color = color
        const inner = el('g', { transform: 'translate(' + f2(c[0] - glyphS * 12) + ' ' + f2(c[1] - glyphS * 12) + ') scale(' + glyphS + ')' }, wrap)
        el('use', { href: '#z' + i }, inner)
        if (store) store.push(wrap)
      }
    }
    function scaleRing(parent: Element, rEdge: number, numR: number, fs: number) {
      for (let d = 0; d < 360; d++) {
        const maj = d % 10 === 0, mid = d % 5 === 0
        const len = maj ? 15 : (mid ? 9.5 : 5.5)
        const p1 = pt(d, rEdge), p2 = pt(d, rEdge - len)
        el('line', { x1: f2(p1[0]), y1: f2(p1[1]), x2: f2(p2[0]), y2: f2(p2[1]), stroke: maj ? LINE2 : LINE, 'stroke-width': maj ? 1.1 : .6, opacity: maj ? .9 : .6 }, parent)
        if (maj) {
          const np = pt(d, numR)
          const t = el('text', {
            x: f2(np[0]), y: f2(np[1]), 'text-anchor': 'middle', 'dominant-baseline': 'middle',
            'font-size': fs, fill: NUM, opacity: .9, transform: 'rotate(' + (-d) + ' ' + f2(np[0]) + ' ' + f2(np[1]) + ')'
          }, parent)
          t.textContent = String(d)
        }
      }
    }

    const tropG = document.getElementById('tropG'), sidG = document.getElementById('sidG'),
      sidRot = document.getElementById('sidRot'), coreG = document.getElementById('coreG'),
      wedgeG = document.getElementById('wedgeG'), disc = document.getElementById('disc'),
      annot = document.getElementById('annot'), leader = document.getElementById('leader'),
      annotVal = document.getElementById('annotVal')

    if (tropG && sidG && sidRot && coreG && wedgeG && disc && annot && leader && annotVal) {
      /* tropical (outer) */
      ringSet(tropG, 375, 435, 405, 1.62, GLYPH_OUT, null)
      scaleRing(tropG, 373, 352, 9)
      for (let i = 0; i < 12; i++) {
        const L = i * 30, p = pt(L, 478)
        const t = el('text', { x: f2(p[0]), y: f2(p[1]), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 12, 'letter-spacing': 1, fill: '#8F8CAB' }, tropG)
        t.textContent = L + '°'
      }
      /* sidereal (inner, rotated) */
      ringSet(sidG, 245, 305, 275, 1.22, GLYPH_IN, innerGlyphs)
      scaleRing(sidG, 243, 224, 8)
      el('line', { x1: 500, y1: 288, x2: 500, y2: 70, stroke: '#D89455', 'stroke-width': 1.6, opacity: .9 }, sidG)
      el('circle', { cx: 500, cy: 76, r: 3.2, fill: '#D89455' }, sidG)

      /* core */
      el('circle', { cx: 500, cy: 500, r: 150, fill: 'none', stroke: LINE, 'stroke-width': 1, opacity: .8 }, coreG)
      el('circle', { cx: 500, cy: 500, r: 95, fill: 'none', stroke: LINE, 'stroke-width': 1, opacity: .6 }, coreG)
      ;([[0, '0°'], [90, '90°'], [180, '180°'], [270, '270°']] as [number, string][]).forEach(function (ax) {
        const q1 = pt(ax[0], 18), q2 = pt(ax[0], 150)
        el('line', { x1: f2(q1[0]), y1: f2(q1[1]), x2: f2(q2[0]), y2: f2(q2[1]), stroke: LINE, 'stroke-width': 1, opacity: .85 }, coreG)
        const fp = pt(ax[0], 159)
        el('rect', { x: f2(fp[0] - 3.4), y: f2(fp[1] - 3.4), width: 6.8, height: 6.8, fill: 'none', stroke: 'rgba(233,231,242,.45)', 'stroke-width': 1, transform: 'rotate(45 ' + f2(fp[0]) + ' ' + f2(fp[1]) + ')' }, coreG)
        const lp = pt(ax[0], 177)
        const tt = el('text', { x: f2(lp[0]), y: f2(lp[1]), 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': 9.5, fill: '#6F6C8E' }, coreG)
        tt.textContent = ax[1]
      })
      ;([[435, 500], [565, 500]] as [number, number][]).forEach(function (s) {
        el('path', { d: 'M' + s[0] + ',' + (s[1] - 7) + ' L' + (s[0] + 1.9) + ',' + (s[1] - 1.9) + ' L' + (s[0] + 7) + ',' + s[1] + ' L' + (s[0] + 1.9) + ',' + (s[1] + 1.9) + ' L' + s[0] + ',' + (s[1] + 7) + ' L' + (s[0] - 1.9) + ',' + (s[1] + 1.9) + ' L' + (s[0] - 7) + ',' + s[1] + ' L' + (s[0] - 1.9) + ',' + (s[1] - 1.9) + ' Z', fill: '#E9D9BC', opacity: .9 }, coreG)
      })
      for (let i = 0; i < 9; i++) {
        const ang = Math.random() * Math.PI * 2, rr = 30 + Math.random() * 105
        el('circle', { cx: f2(500 + rr * Math.cos(ang)), cy: f2(500 + rr * Math.sin(ang)), r: f2(.7 + Math.random() * .7), fill: '#CFD6EC', opacity: f2(.2 + Math.random() * .35) }, coreG)
      }
      el('circle', { cx: 500, cy: 500, r: 46, fill: 'url(#coreGlow)' }, coreG)
      el('line', { x1: 500, y1: 483, x2: 500, y2: 517, stroke: '#F0B978', 'stroke-width': 1, opacity: .9 }, coreG)
      el('line', { x1: 483, y1: 500, x2: 517, y2: 500, stroke: '#F0B978', 'stroke-width': 1, opacity: .9 }, coreG)
      el('circle', { cx: 500, cy: 500, r: 3.6, fill: '#F0B978' }, coreG)

      /* tropical zero marker (cream) */
      el('line', { x1: 500, y1: 288, x2: 500, y2: 52, stroke: '#E9E7F2', 'stroke-width': 1.4, opacity: .85 }, wedgeG)
      el('circle', { cx: 500, cy: 58, r: 3, fill: '#E9E7F2' }, wedgeG)
      const wedgePath = el('path', { d: '', fill: 'rgba(240,230,214,.07)', stroke: 'rgba(240,230,214,.16)', 'stroke-width': 1 }, wedgeG)

      const setOffset = (A: number) => {
        sidRot!.setAttribute('transform', 'rotate(' + (-A) + ' 500 500)')
        innerGlyphs.forEach(function (g) {
          g.setAttribute('transform', 'rotate(' + A + ' ' + g.getAttribute('data-cx') + ' ' + g.getAttribute('data-cy') + ')')
        })
        if (A < 0.05) { wedgePath.setAttribute('d', '') }
        else {
          const o1 = pt(0, 436), o2 = pt(A, 436), i2 = pt(A, 215), i1 = pt(0, 215)
          wedgePath.setAttribute('d', 'M' + f2(o1[0]) + ',' + f2(o1[1]) + ' A436,436 0 0 0 ' + f2(o2[0]) + ',' + f2(o2[1]) +
            ' L' + f2(i2[0]) + ',' + f2(i2[1]) + ' A215,215 0 0 1 ' + f2(i1[0]) + ',' + f2(i1[1]) + ' Z')
        }
        annotVal!.textContent = fmtA(A)
        const mid = pt(Math.max(A, 3) / 2, 444)
        leader!.setAttribute('d', 'M238,168 L330,168 L' + f2(mid[0]) + ',' + f2(mid[1]))
      }
      setOffset(A0)

      /* settle animation */
      if (reduce) { (annot as HTMLElement).style.opacity = '1' }
      else {
        let t0: number | null = null
        const DUR = 6200
        disc.setAttribute('transform', 'rotate(-14 500 500)')
        const step = (ts: number) => {
          if (t0 === null) t0 = ts
          const p = Math.min((ts - t0) / DUR, 1), e = 1 - Math.pow(1 - p, 3)
          disc.setAttribute('transform', 'rotate(' + f2(-14 * (1 - e)) + ' 500 500)')
          if (p < 1) requestAnimationFrame(step); else (annot as HTMLElement).style.opacity = '1'
        }
        requestAnimationFrame(step)
      }

      /* epoch scrubber */
      const slider = document.getElementById('epochSlider') as HTMLInputElement | null
      const yearOut = document.getElementById('epochYear')
      const offOut = document.getElementById('epochOff')
      if (slider && yearOut && offOut) {
        const scrub = () => {
          const y = parseInt(slider.value, 10), A = ayan(y)
          setOffset(A)
          yearOut.textContent = y + ' CE'
          if (A < 0.05) { offOut.innerHTML = '<span class="' + styles.agree + '">THE TWO ZODIACS AGREE</span>' }
          else { offOut.textContent = 'OFFSET ' + fmtA(A) + (y === 2026 ? '' : ' · IN 285 CE THE ZODIACS AGREED') }
        }
        slider.addEventListener('input', scrub)
      }
    }

    /* ---------- scroll reveal ---------- */
    let io: IntersectionObserver | null = null
    if ('IntersectionObserver' in window && !reduce) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add(styles.in); io!.unobserve(en.target) } })
      }, { threshold: .12 })
    }
    const root = rootRef.current
    if (root) {
      root.querySelectorAll('.' + styles.rv).forEach(function (n) {
        if (io) io.observe(n); else n.classList.add(styles.in)
      })
    }
  }, [])

  return (
    <div className={styles.root} ref={rootRef}>
      {/* ======================= SKY ======================= */}
      <div className={styles.sky} aria-hidden="true">
        <svg viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id="milky" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="rgba(140,155,200,0)" />
              <stop offset=".5" stopColor="rgba(140,155,200,.075)" />
              <stop offset="1" stopColor="rgba(140,155,200,0)" />
            </linearGradient>
          </defs>
          <rect x="1440" y="-320" width="360" height="1840" fill="url(#milky)" transform="rotate(16 1650 540)" />
          <rect x="1500" y="-320" width="150" height="1840" fill="url(#milky)" transform="rotate(16 1650 540)" opacity=".7" />
          <circle cx="1960" cy="-90" r="640" fill="none" stroke="rgba(184,115,51,.13)" strokeDasharray="1 7" />
          <circle cx="1990" cy="-60" r="780" fill="none" stroke="rgba(150,160,200,.07)" strokeDasharray="1 6" />
          <circle cx="-130" cy="1170" r="540" fill="none" stroke="rgba(233,231,242,.07)" strokeDasharray="1 6" />
          <g id="starsG"></g>
          <g id="constellations" stroke="rgba(120,132,170,.26)" strokeWidth="1" fill="none">
            <polyline points="900,118 962,72 1024,112 1086,66 1148,100" />
            <polyline points="1560,418 1626,378 1706,382 1760,424 1826,458 1878,478" />
            <polyline points="1706,382 1760,424" />
            <polyline points="1717,662 1738,724 1758,736 1778,748 1793,652" />
            <polyline points="1738,724 1745,818" />
            <polyline points="1778,748 1815,812" />
            <polyline points="1660,962 1700,1002 1676,1052" />
            <polyline points="1700,1002 1636,1010" />
          </g>
          <g id="constDots" fill="rgba(165,175,210,.55)">
            <circle cx="900" cy="118" r="1.7" /><circle cx="962" cy="72" r="1.9" /><circle cx="1024" cy="112" r="1.6" /><circle cx="1086" cy="66" r="1.9" /><circle cx="1148" cy="100" r="1.5" />
            <circle cx="1560" cy="418" r="1.7" /><circle cx="1626" cy="378" r="1.6" /><circle cx="1706" cy="382" r="1.8" /><circle cx="1760" cy="424" r="1.6" /><circle cx="1826" cy="458" r="1.5" />
            <circle cx="1717" cy="662" r="2.1" /><circle cx="1793" cy="652" r="1.7" /><circle cx="1738" cy="724" r="1.6" /><circle cx="1758" cy="736" r="1.6" /><circle cx="1778" cy="748" r="1.6" /><circle cx="1815" cy="812" r="2" /><circle cx="1745" cy="818" r="1.5" />
            <circle cx="1660" cy="962" r="2.3" /><circle cx="1700" cy="1002" r="1.5" /><circle cx="1636" cy="1010" r="1.4" /><circle cx="1676" cy="1052" r="1.4" />
          </g>
          <g fontSize="10" letterSpacing="5" fill="rgba(110,118,152,.55)">
            <text x="1024" y="152" textAnchor="middle">CASSIOPEIA</text>
            <text x="1690" y="342" textAnchor="middle">URSA MAJOR</text>
            <text x="1668" y="742" textAnchor="end">ORION</text>
            <text x="1662" y="936" textAnchor="middle">CANIS MAJOR</text>
          </g>
        </svg>
      </div>

      <div className={styles.content}>
        {/* ======================= HERO ======================= */}
        <div className={styles.hero} id="axis-hero">
          <div className={styles.heroCopy}>
            <h1 className={styles.wordmark}>AXIS</h1>
            <div className={styles.wmRule}></div>
            <div className={styles.wmLabel}>DUAL-SYSTEM ASTROLOGY</div>
            <div className={styles.heroDoctwrap}>
              <p className={styles.heroDoct}>Tropical maps the psychological architecture of a self.</p>
              <div className={styles.heroHair}></div>
              <p className={styles.heroDoct}>Sidereal maps the incarnational conditions it navigates.</p>
              <p className={styles.heroClose}>The <span className={styles.dvg}>divergence</span> is where this chart actually lives.</p>
            </div>
            <p className={styles.heroLede}>One birth, charted against two zodiacs — the seasonal and the stellar — separated by <span className={styles.num}>24°13′</span> of precession. AXIS computes both and reads what lives in the difference.</p>
            <div className={styles.ctas}>
              <button type="button" className={`${styles.btn} ${styles.btnSolid}`} onClick={scrollToCast}>CAST YOUR DUAL CHART</button>
              <Link className={`${styles.btn} ${styles.btnOutline}`} href="/sample">SAMPLE DOSSIER</Link>
            </div>
            <div className={styles.heroMicro}>VSOP87 EPHEMERIS · LAHIRI AYANAMSA · NO HOROSCOPES</div>
          </div>
          <div className={styles.heroRight}>
            <div className={styles.wheelbox}>
              <svg id="instrument" viewBox="0 0 1000 1000" role="img" aria-label="Live dual-zodiac instrument: tropical ring outside, sidereal ring inside, offset by the Lahiri ayanamsa">
                <defs>
                  <radialGradient id="coreGlow" cx=".5" cy=".5" r=".5">
                    <stop offset="0" stopColor="rgba(240,185,120,.55)" />
                    <stop offset=".45" stopColor="rgba(216,148,85,.16)" />
                    <stop offset="1" stopColor="rgba(216,148,85,0)" />
                  </radialGradient>
                  <g id="z0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12,20 V9 M12,9 C12,5.2 9.6,3.6 7.6,4.6 C5.4,5.7 5.2,9 7.4,10.6 M12,9 C12,5.2 14.4,3.6 16.4,4.6 C18.6,5.7 18.8,9 16.6,10.6" /></g>
                  <g id="z1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5,4 C6.5,7.5 9,9.2 12,9.2 C15,9.2 17.5,7.5 19,4" /><circle cx="12" cy="14.6" r="5" /></g>
                  <g id="z2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6.8,5.8 V18.2 M17.2,5.8 V18.2 M4,4.4 C6.6,6.7 17.4,6.7 20,4.4 M4,19.6 C6.6,17.3 17.4,17.3 20,19.6" /></g>
                  <g id="z3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20,10.6 C17.8,7.3 13.8,5.5 9.6,6.3" /><circle cx="7.4" cy="8.6" r="2.6" /><path d="M4,13.4 C6.2,16.7 10.2,18.5 14.4,17.7" /><circle cx="16.6" cy="15.4" r="2.6" /></g>
                  <g id="z4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.2" cy="15.4" r="3" /><path d="M7.2,12.4 C6.6,7.6 9.4,4.6 12.6,4.6 C15.8,4.6 17.8,7 17.4,10 C17.1,12.4 15.2,13.8 15.2,16.4 C15.2,18.4 16.8,19.6 18.8,18.8" /></g>
                  <g id="z5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4,8.6 C4,6.4 6.7,6.4 6.7,8.6 V15.8 M6.7,9.8 C6.7,7.2 9.9,7.2 9.9,9.4 V15.8 M9.9,9.8 C9.9,7.2 13.1,7.2 13.1,9.4 V14.2 C13.1,16.8 14.6,18.2 16.8,18 M16.9,10.6 C13.9,11.9 13,14.6 14.3,18.8" /></g>
                  <g id="z6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4,17.6 H20 M4,13.6 H8.6 C7.2,12.4 6.6,10.9 7,9.2 C7.6,6.9 9.6,5.4 12,5.4 C14.4,5.4 16.4,6.9 17,9.2 C17.4,10.9 16.8,12.4 15.4,13.6 H20" /></g>
                  <g id="z7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4,8.6 C4,6.4 6.7,6.4 6.7,8.6 V15.6 M6.7,9.8 C6.7,7.2 9.9,7.2 9.9,9.4 V15.6 M9.9,9.8 C9.9,7.2 13.1,7.2 13.1,9.4 V13.8 C13.1,16.6 14.8,18 17.4,18 H20.2 M20.2,18 L18,16.1 M20.2,18 L18.2,20.1" /></g>
                  <g id="z8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5,19 L18.6,5.4 M18.6,5.4 L12.2,6 M18.6,5.4 L18,11.8 M7.8,11.4 L12.6,16.2" /></g>
                  <g id="z9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4,6.4 C5.8,6.2 6.8,7.2 7.3,9 L9.4,15.8 L11.7,7.6 C12.2,5.9 13.6,5.6 14.4,6.4 M11.7,7.6 L13.9,14.4 C14.7,16.9 17,18 18.6,16.9 C20.3,15.7 19.8,13 18,12.7 C16.5,12.4 15.4,13.7 15.9,15.3" /></g>
                  <g id="z10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4,9.6 L7.2,6.9 L10.4,9.6 L13.6,6.9 L16.8,9.6 L20,6.9 M4,16.9 L7.2,14.2 L10.4,16.9 L13.6,14.2 L16.8,16.9 L20,14.2" /></g>
                  <g id="z11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M7.4,4 C4.6,8 4.6,16 7.4,20 M16.6,4 C19.4,8 19.4,16 16.6,20 M5.4,12 H18.6" /></g>
                </defs>
                <g id="disc">
                  <circle cx="500" cy="500" r="460" fill="none" stroke="rgba(233,231,242,.16)" strokeWidth="1" />
                  <g id="wedgeG"></g>
                  <g id="tropG"></g>
                  <g id="sidRot"><g id="sidG"></g></g>
                  <g id="coreG"></g>
                  <g id="ringChips">
                    <line x1="726" y1="130" x2="806" y2="96" stroke="rgba(233,231,242,.35)" strokeWidth="1" strokeDasharray="2 5" />
                    <text x="812" y="92" fontSize="12" letterSpacing="4" fill="rgba(233,231,242,.75)">TROPICAL</text>
                    <line x1="712" y1="292" x2="800" y2="252" stroke="rgba(216,148,85,.45)" strokeWidth="1" strokeDasharray="2 5" />
                    <text x="806" y="248" fontSize="12" letterSpacing="4" fill="rgba(216,148,85,.85)">SIDEREAL</text>
                  </g>
                </g>
                <g id="annot" style={{ opacity: 0, transition: 'opacity 1.4s ease' }}>
                  <path id="leader" d="" fill="none" stroke="rgba(233,231,242,.4)" strokeWidth="1" strokeDasharray="2 5" />
                  <rect x="60" y="128" width="176" height="88" fill="rgba(2,3,10,.82)" stroke="rgba(233,231,242,.26)" strokeWidth="1" />
                  <text id="annotVal" x="82" y="166" fontSize="21" fontWeight="700" letterSpacing="1" fill="#E9E7F2">24°13′</text>
                  <text x="82" y="188" fontSize="9" letterSpacing="3" fill="#8F8CAB">LAHIRI</text>
                  <text x="82" y="203" fontSize="9" letterSpacing="3" fill="#8F8CAB">OFFSET</text>
                </g>
              </svg>
            </div>
            <div className={styles.epoch}>
              <span className={styles.eLab}>285 CE</span>
              <input type="range" id="epochSlider" min="285" max="2100" defaultValue="2026" step="1" aria-label="Epoch year" />
              <span className={styles.eLab}>2100 CE</span>
            </div>
            <div className={styles.epochRead}><b id="epochYear">2026 CE</b> — SCRUB THE EPOCH · <span id="epochOff">OFFSET 24°13′</span></div>
          </div>
        </div>

        {/* ======================= TWO MAPS ======================= */}
        <section className={`${styles.band} ${styles.rv}`}>
          <p className={styles.kicker}>{'// THE TWO MAPS'}</p>
          <div className={styles.twomaps}>
            <div>
              <p className={styles.mapLabel}>TROPICAL <em>— THE SELF YOU RECOGNISE</em></p>
              <p>Anchored to the equinox — the year&apos;s own geometry. The tropical chart maps the symbolic architecture of conscious identity: ego structure, relational patterns, cognitive style, the shape of the defences. It is the territory of how a person organises a sense of self, what they construct in response to the world, and the drives that sit closest to waking awareness.</p>
            </div>
            <div className={styles.neq}>≠</div>
            <div>
              <p className={styles.mapLabel}>SIDEREAL <em>— THE SELF BENEATH</em></p>
              <p>Anchored to the stars as the sky actually stands. The sidereal chart maps incarnational patterning: the body this person arrived in, the circumstances and inherited tendencies they entered with, the karmic emphases and deep instinctive orientations that pre-date the constructed identity. Not fate — the specific terrain a life is walked across.</p>
            </div>
          </div>
          <p className={styles.bridge}>These are not inner versus outer. They are two different layers of a single life — and AXIS never averages them into a blur.</p>
        </section>

        {/* ======================= CALIBRATION (real cast flow) ======================= */}
        <section className={`${styles.band} ${styles.rv}`} id="get-reading" ref={calibRef}>
          <p className={styles.kicker}>{'// CALIBRATION'}</p>
          <h2 className={styles.secH}>Cast your dual chart.</h2>
          <div className={styles.prose}>
            <p>Three facts calibrate the instrument. AXIS resolves the timezone from the place, computes both zodiacs from the same instant, and streams the dossier section by section as it is written.</p>
          </div>
          <div className={styles.calibPanel}>
            <BirthForm onSubmit={onSubmit} loading={loading} submitLabel="Cast chart" />
            {error && (
              <div className={styles.calcError}>
                <p className={styles.calcErrorMsg}>{error}</p>
                <button className={styles.calcRetryBtn} onClick={onRetry} disabled={loading}>Try again</button>
              </div>
            )}
          </div>
          <p className={styles.calibMeta}>Tropical reveals the self you know. Sidereal reveals the self underneath it. That divergence is AXIS.</p>
        </section>
      </div>

      {/* ======================= FOOTER ======================= */}
      <footer className={styles.footer}>
        <div className={styles.col}>
          Δ 24°13′ · LAHIRI<br />WIDENING 50.2564″ / YR<br />ZERO POINT · c. 285 CE
        </div>
        <div className={styles.col}>
          <Link href="/method">METHOD</Link>
          <Link href="/sample">SAMPLE</Link>
          <span className={styles.footerDead}>PROTOCOL</span>
          <button type="button" className={styles.footerCta} onClick={scrollToCast}>CAST A CHART →</button>
        </div>
        <div className={styles.col}>
          <span className={styles.fbrand}>AXIS — DUAL-SYSTEM ASTROLOGY</span><br />
          NO HOROSCOPES · NO PREDICTIONS<br />NO AFFIRMATIONS<br />
          VSOP87 · ELP2000 · JPL DE440 · TRUE NODE
        </div>
      </footer>
    </div>
  )
}
