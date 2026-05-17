import styles from './AstrolabeDecor.module.css'

export default function AstrolabeDecor() {
  return (
    <div className={styles.container}>
      <div className={styles.engineStatus}>
        <span className={styles.statusPulse} />
        SYSTEM: ACTIVE // PLUTO: JPL_HORIZONS_DE440
      </div>

      <svg className={styles.astrolabe} viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ad-satin-silver" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EBF0F5" />
            <stop offset="50%" stopColor="#D5DCED" />
            <stop offset="100%" stopColor="#BCC5D6" />
          </linearGradient>

          <linearGradient id="ad-matte-obsidian" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0D0F12" />
            <stop offset="100%" stopColor="#1A1D24" />
          </linearGradient>

          <filter id="ad-plate-shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#000000" floodOpacity="0.6" />
          </filter>

          <filter id="ad-inner-shadow">
            <feComponentTransfer in="SourceAlpha">
              <feFuncA type="linear" slope="1" />
            </feComponentTransfer>
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feOffset dx="0" dy="3" />
            <feComposite operator="out" in2="SourceGraphic" result="inverse" />
            <feFlood floodColor="black" floodOpacity="0.7" result="color" />
            <feComposite operator="in" in2="inverse" result="shadow" />
            <feComposite operator="over" in2="SourceGraphic" />
          </filter>
        </defs>

        {/* Outer bezel */}
        <circle cx="250" cy="250" r="240" fill="#07080a" />

        {/* Sidereal platter — animates to −23.85° Lahiri offset */}
        <g className={styles.siderealPlatter} filter="url(#ad-plate-shadow)">
          <circle cx="250" cy="250" r="185" fill="url(#ad-matte-obsidian)" stroke="#222936" strokeWidth="1" />

          <g stroke="#1C2330" strokeWidth="1" strokeDasharray="2,2">
            <line x1="250" y1="65" x2="250" y2="435" />
            <line x1="65" y1="250" x2="435" y2="250" />
          </g>

          <circle cx="250" cy="250" r="175" fill="none" stroke="#2a3547" strokeWidth="1" strokeDasharray="1,5" opacity="0.4" />
        </g>

        {/* Tropical ring */}
        <g filter="url(#ad-plate-shadow)">
          <path
            d="M 250,15 A 235,235 0 1,0 250,485 A 235,235 0 1,0 250,15 Z M 250,65 A 185,185 0 1,1 250,435 A 185,185 0 1,1 250,65 Z"
            fill="url(#ad-satin-silver)"
            filter="url(#ad-inner-shadow)"
          />
          <circle cx="250" cy="250" r="230" fill="none" stroke="#717E94" strokeWidth="1" strokeDasharray="1,3" opacity="0.5" />
          <circle cx="250" cy="250" r="190" fill="none" stroke="#717E94" strokeWidth="1" strokeDasharray="2,8" opacity="0.3" />
        </g>

        {/* MC meridian axis */}
        <g>
          <line x1="250" y1="30" x2="250" y2="250" stroke="#D4AF37" strokeWidth="1.5" strokeLinecap="round" />
          <polygon points="250,22 247,32 253,32" fill="#D4AF37" />
          <text x="250" y="16" fill="#D4AF37" fontFamily="Space Mono, monospace" fontSize="10" textAnchor="middle" letterSpacing="1">MC</text>
        </g>

        {/* Center pivot */}
        <circle cx="250" cy="250" r="8" fill="#0D0F12" stroke="#717E94" strokeWidth="1.5" />
        <circle cx="250" cy="250" r="3" fill="#D4AF37" />

        {/* Lahiri offset label — fades in after precession settles */}
        <text x="250" y="278" className={styles.ayanamsaCounter}
          fontFamily="Space Mono, monospace" fontSize="9" fill="#717E94" textAnchor="middle">
          LAHIRI −23.85°
        </text>
      </svg>
    </div>
  )
}
