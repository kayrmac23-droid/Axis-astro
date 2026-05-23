import styles from './ConstellationDecor.module.css'

type Star = { x: number; y: number; size: number }
type Constellation = {
  name: string
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
  stars: Star[]
  lines: [number, number][]
}

const CONSTELLATIONS: Constellation[] = [
  {
    name: 'Cassiopeia',
    position: 'topLeft',
    stars: [
      { x: 10, y: 80, size: 1.0 },
      { x: 25, y: 45, size: 1.2 },
      { x: 45, y: 60, size: 1.5 },
      { x: 65, y: 35, size: 1.0 },
      { x: 85, y: 65, size: 1.1 },
    ],
    lines: [[0,1],[1,2],[2,3],[3,4]],
  },
  {
    name: 'Orion',
    position: 'topRight',
    stars: [
      { x: 30, y: 20, size: 1.4 },
      { x: 55, y: 30, size: 1.1 },
      { x: 70, y: 45, size: 1.5 },
      { x: 75, y: 50, size: 0.9 },
      { x: 80, y: 55, size: 1.0 },
      { x: 60, y: 75, size: 1.3 },
      { x: 40, y: 70, size: 1.1 },
    ],
    lines: [[0,1],[1,2],[2,3],[3,4],[2,5],[5,6],[0,6]],
  },
  {
    name: 'Ursa Major',
    position: 'bottomLeft',
    stars: [
      { x: 15, y: 50, size: 1.3 },
      { x: 30, y: 45, size: 1.1 },
      { x: 45, y: 50, size: 1.2 },
      { x: 60, y: 55, size: 1.4 },
      { x: 70, y: 70, size: 1.0 },
      { x: 60, y: 80, size: 1.1 },
      { x: 75, y: 30, size: 1.0 },
    ],
    lines: [[0,1],[1,2],[2,3],[3,4],[4,5],[3,6]],
  },
  {
    name: 'Lyra',
    position: 'bottomRight',
    stars: [
      { x: 50, y: 20, size: 1.5 },
      { x: 35, y: 50, size: 1.0 },
      { x: 65, y: 50, size: 1.1 },
      { x: 30, y: 75, size: 0.9 },
      { x: 70, y: 75, size: 1.0 },
    ],
    lines: [[0,1],[0,2],[1,3],[2,4],[3,4]],
  },
]

export default function ConstellationDecor() {
  return (
    <div className={styles.constellations} aria-hidden="true">
      {CONSTELLATIONS.map(c => (
        <svg key={c.name}
             className={`${styles.constellation} ${styles[c.position]}`}
             viewBox="0 0 100 100">
          {c.lines.map(([a, b], i) => (
            <line key={i}
                  x1={c.stars[a].x} y1={c.stars[a].y}
                  x2={c.stars[b].x} y2={c.stars[b].y}
                  stroke="var(--axis-copper-faint)" strokeWidth="0.5" />
          ))}
          {c.stars.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.size}
                    fill="var(--axis-copper-dim)" opacity="0.6" />
          ))}
        </svg>
      ))}
    </div>
  )
}
