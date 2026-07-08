'use client'
import React from 'react'
import Link from 'next/link'
import styles from './LandingPage.module.css'

/* ─── Why Two Systems Section ─────────────────────── */
function WhyTwoSystems() {
  return (
    <section className={styles.whySection}>
      <div className={styles.whyInner}>
        <div className={styles.whyLeft}>
          <p className={styles.sectionLabel}>The Problem</p>
          <h2 className={styles.sectionHeadline}>Why do two systems tell different stories?</h2>
          <p className={styles.sectionBody}>
            Tropical astrology maps the sky as seen from Earth. Sidereal maps the stars as they truly are.
          </p>
          <p className={styles.sectionBody}>
            Both are real. But each reveals something different.
          </p>
        </div>
        <div className={styles.whyRight}>
          <div className={styles.systemsRow}>
            {/* Tropical */}
            <div className={styles.systemCard}>
              <div className={styles.miniWheel}>
                <svg viewBox="-60 -60 120 120" width="80" height="80">
                  <circle cx="0" cy="0" r="55" fill="none" stroke="rgba(184,115,51,0.4)" strokeWidth="1"/>
                  <circle cx="0" cy="0" r="38" fill="none" stroke="rgba(184,115,51,0.25)" strokeWidth="0.8"/>
                  {Array.from({length:12}).map((_,i) => {
                    const a = (i*30-90)*Math.PI/180
                    return <line key={i} x1={Math.cos(a)*38} y1={Math.sin(a)*38} x2={Math.cos(a)*55} y2={Math.sin(a)*55} stroke="rgba(184,115,51,0.3)" strokeWidth="0.5"/>
                  })}
                  <circle cx="0" cy="0" r="5" fill="rgba(184,115,51,0.6)"/>
                </svg>
              </div>
              <p className={styles.systemCardLabel}>Tropical</p>
              <p className={styles.systemCardSub}>Your psyche<br/>The self you know</p>
            </div>

            <div className={styles.plusSign}>+</div>

            {/* The Gap */}
            <div className={styles.gapCard}>
              <div className={styles.gapStar}>✦</div>
              <p className={styles.gapLabel}>The Gap</p>
              <p className={styles.gapSub}>Where the two systems diverge.</p>
            </div>

            <div className={styles.plusSign}>+</div>

            {/* Sidereal */}
            <div className={styles.systemCard}>
              <div className={styles.miniWheel}>
                <svg viewBox="-60 -60 120 120" width="80" height="80">
                  <circle cx="0" cy="0" r="55" fill="none" stroke="rgba(184,115,51,0.25)" strokeWidth="1"/>
                  <circle cx="0" cy="0" r="38" fill="none" stroke="rgba(184,115,51,0.4)" strokeWidth="0.8"/>
                  {Array.from({length:12}).map((_,i) => {
                    const a = (i*30-90)*Math.PI/180
                    return <line key={i} x1={Math.cos(a)*38} y1={Math.sin(a)*38} x2={Math.cos(a)*55} y2={Math.sin(a)*55} stroke="rgba(184,115,51,0.3)" strokeWidth="0.5"/>
                  })}
                  <circle cx="0" cy="0" r="5" fill="rgba(184,115,51,0.4)"/>
                </svg>
              </div>
              <p className={styles.systemCardLabel}>Sidereal</p>
              <p className={styles.systemCardSub}>Your karma<br/>The self you&apos;re becoming</p>
            </div>

            <div className={styles.equalsSign}>=</div>

            {/* The AXIS reading — both charts plus the gap, never merged */}
            <div className={`${styles.systemCard} ${styles.synthesisCard}`}>
              <div className={styles.miniWheel}>
                <svg viewBox="-60 -60 120 120" width="80" height="80">
                  <circle cx="0" cy="0" r="55" fill="none" stroke="rgba(184,115,51,0.5)" strokeWidth="1.2"/>
                  <circle cx="0" cy="0" r="38" fill="none" stroke="rgba(184,115,51,0.5)" strokeWidth="1"/>
                  {Array.from({length:12}).map((_,i) => {
                    const a = (i*30-90)*Math.PI/180
                    return <line key={i} x1={Math.cos(a)*38} y1={Math.sin(a)*38} x2={Math.cos(a)*55} y2={Math.sin(a)*55} stroke="rgba(184,115,51,0.4)" strokeWidth="0.6"/>
                  })}
                  <line x1="-30" y1="0" x2="30" y2="0" stroke="rgba(184,115,51,0.6)" strokeWidth="0.8"/>
                  <line x1="0" y1="-30" x2="0" y2="30" stroke="rgba(184,115,51,0.6)" strokeWidth="0.8"/>
                  <circle cx="0" cy="0" r="6" fill="rgba(184,115,51,0.8)"/>
                </svg>
              </div>
              <p className={`${styles.systemCardLabel} ${styles.synthesisLabel}`}>The AXIS Reading</p>
              <p className={styles.systemCardSub}>Both charts, held apart<br/>The distance made legible</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── Sample Reading Section ──────────────────────── */
function SampleReading() {
  return (
    <section className={styles.sampleSection}>
      <div className={styles.sampleInner}>
        <div className={styles.sampleLeft}>
          <p className={styles.sectionLabel}>Sample Reading</p>
          <h2 className={styles.sectionHeadline}>Two perspectives.<br/>The gap between.</h2>
          <p className={styles.sectionBody}>
            See how AXIS brings clarity to the parts of your chart that never seemed to make sense—until now.
          </p>
          <button className={styles.outlineBtn}>View Full Sample Reading &nbsp;→</button>
        </div>
        <div className={styles.sampleRight}>
          <div className={styles.sampleCards}>
            {/* Card 1 */}
            <div className={styles.sampleCard}>
              <p className={styles.cardTag}>Tropical View</p>
              <p className={styles.cardTagSub}>Psychological Blueprint</p>
              <div className={styles.cardIcon}>☿</div>
              <p className={styles.cardPlanet}>Sun in Gemini</p>
              <p className={styles.cardDesc}>Curious. Adaptable. You seek connection through ideas and communication.</p>
            </div>
            <div className={styles.sampleArrow}>→</div>
            {/* Card 2 */}
            <div className={styles.sampleCard}>
              <p className={styles.cardTag}>Sidereal View</p>
              <p className={styles.cardTagSub}>Karmic Blueprint</p>
              <div className={styles.cardIcon}>♉</div>
              <p className={styles.cardPlanet}>Sun in Taurus</p>
              <p className={styles.cardDesc}>Steady. Sensual. Your soul seeks stability, security and lasting value.</p>
            </div>
            <div className={styles.sampleArrow}>→</div>
            {/* Card 3 */}
            <div className={styles.sampleCard}>
              <p className={styles.cardTag}>The Contrast</p>
              <p className={styles.cardTagSub}>&nbsp;</p>
              <div className={styles.cardIconDual}>
                <span>◎</span>
              </div>
              <p className={styles.cardPlanet}>Why it feels contradictory</p>
              <p className={styles.cardDesc}>Your mind seeks variety, but your soul seeks stability. Inner tension creates confusion.</p>
            </div>
            <div className={styles.sampleArrow}>→</div>
            {/* Card 4 — The Gap */}
            <div className={`${styles.sampleCard} ${styles.sampleCardSynthesis}`}>
              <p className={styles.cardTag}>The Gap</p>
              <p className={styles.cardTagSub}>&nbsp;</p>
              <div className={styles.cardIcon}>✦</div>
              <p className={styles.cardPlanet}>The Distance</p>
              <p className={styles.cardDesc}>Your mind&apos;s variety and your soul&apos;s stability never merge into one instruction. AXIS names exactly where they pull apart—and how you live between them.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ─── How It Works Section ────────────────────────── */
function HowItWorks() {
  const steps = [
    {
      num: '1.',
      title: 'Enter Your Data',
      desc: 'Add your birth details in seconds.',
      icon: '◯',
    },
    {
      num: '2.',
      title: 'We Analyze Both Systems',
      desc: 'Our algorithm calculates Tropical and Sidereal placements.',
      icon: '◎',
    },
    {
      num: '3.',
      title: 'Read The Gap',
      desc: 'Get both readings in full—then the third, which names the distance between them.',
      icon: '✦',
    },
  ]
  return (
    <section className={styles.howSection}>
      <div className={styles.howInner}>
        <div className={styles.howLeft}>
          <p className={styles.sectionLabel}>How It Works</p>
          <h2 className={styles.sectionHeadline}>Clarity in<br/>three steps.</h2>
        </div>
        <div className={styles.howRight}>
          {steps.map((step, i) => (
            <div key={i} className={styles.stepCard}>
              <div className={styles.stepIcon}>{step.icon}</div>
              <div>
                <p className={styles.stepNum}>{step.num} {step.title}</p>
                <p className={styles.stepDesc}>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Cosmic horizon image strip */}
      <div className={styles.horizonStrip} aria-hidden="true">
        <div className={styles.horizonGlow} />
      </div>
    </section>
  )
}

/* ─── Footer ──────────────────────────────────────── */
function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        {/* Brand */}
        <div className={styles.footerBrand}>
          <p className={styles.footerLogo}>AXIS</p>
          <p className={styles.footerLogoSub}>Dual-System Astrology</p>
          <p className={styles.footerTagline}>Bridging ancient wisdom with modern clarity.</p>
          <div className={styles.footerSocials}>
            <a href="#" className={styles.socialIcon} aria-label="Instagram">IG</a>
            <a href="#" className={styles.socialIcon} aria-label="TikTok">TK</a>
            <a href="#" className={styles.socialIcon} aria-label="YouTube">YT</a>
            <a href="#" className={styles.socialIcon} aria-label="X / Twitter">X</a>
          </div>
        </div>

        {/* CTA */}
        <div className={styles.footerCta}>
          <p className={styles.footerCtaHeadline}>Ready to read the distance?</p>
          <Link href="/#get-reading" className={styles.footerCtaBtn}>Get Your Reading &nbsp;→</Link>
        </div>

        {/* Links */}
        <div className={styles.footerLinks}>
          <div className={styles.footerCol}>
            <p className={styles.footerColTitle}>Company</p>
            <a href="/about" className={styles.footerLink}>About AXIS</a>
            <a href="/method" className={styles.footerLink}>Our Mission</a>
            <a href="#" className={styles.footerLink}>Careers</a>
            <a href="#" className={styles.footerLink}>Contact</a>
          </div>
          <div className={styles.footerCol}>
            <p className={styles.footerColTitle}>Resources</p>
            <a href="#" className={styles.footerLink}>Learning Center</a>
            <a href="#" className={styles.footerLink}>Blog</a>
            <a href="#" className={styles.footerLink}>FAQ</a>
            <a href="#" className={styles.footerLink}>Empowerment</a>
          </div>
          <div className={styles.footerCol}>
            <p className={styles.footerColTitle}>Legal</p>
            <a href="#" className={styles.footerLink}>Terms of Service</a>
            <a href="#" className={styles.footerLink}>Privacy Policy</a>
            <a href="#" className={styles.footerLink}>Refund Policy</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

/* ─── Main export ─────────────────────────────────── */
export default function LandingPage() {
  return (
    <>
      <WhyTwoSystems />
      <SampleReading />
      <HowItWorks />
      <SiteFooter />
    </>
  )
}
