// lib/interpretation-engine.ts
// Structured astrological reasoning layer for AXIS
//
// Architecture: sits between astro-calc.ts (raw positions) and the Claude prompt.
// Derives first-principles facts (dignity, house environment, dispositor chain,
// aspects with applying/separating, contradictions, dasha, yogas) and formats them
// as a structured context block injected into every /api/reading request.
//
// To extend: add entries to the knowledge constants below.
// The engine functions are data-driven — additions propagate automatically.

import { ChartData, DualChartData, PlanetPosition } from './astro-calc'

// ── PLANET KNOWLEDGE ─────────────────────────────────────────────────────────

const PLANET_CORE: Record<string, {
  coreFunction: string
  drives: string
  shadow: string
}> = {
  Sun: {
    coreFunction: 'identity, will, vitality, ego, the conscious self, authority',
    drives: 'need to matter, to be recognized as significant, to express the essential self',
    shadow: 'pride, need for constant validation, inability to admit weakness or need'
  },
  Moon: {
    coreFunction: 'emotional instinct, subconscious habit, security needs, the mother, memory',
    drives: 'need for emotional safety, belonging, and nurturing connection',
    shadow: 'emotional reactivity, clinging to the past, moodiness, irrational fear'
  },
  Mercury: {
    coreFunction: 'mind, communication, perception, reasoning, information processing',
    drives: 'need to understand, to exchange ideas, to make connections between concepts',
    shadow: 'over-analysis, anxiety, scattered thinking, using intellect to avoid feeling'
  },
  Venus: {
    coreFunction: 'love, beauty, pleasure, values, attraction, harmony, relationship',
    drives: 'need for connection, beauty, sensory pleasure, and relational harmony',
    shadow: 'vanity, dependency, prioritizing harmony over truth, inability to be alone'
  },
  Mars: {
    coreFunction: 'assertion, desire, drive, anger, courage, conflict, sexual energy',
    drives: 'need to act, to assert, to pursue desire, to overcome obstacles',
    shadow: 'aggression, impulsivity, combativeness, inability to modulate anger'
  },
  Jupiter: {
    coreFunction: 'expansion, wisdom, philosophy, faith, abundance, growth, meaning',
    drives: 'need for meaning, growth, and connection to something larger than self',
    shadow: 'excess, overconfidence, grandiosity, laziness through over-abundance'
  },
  Saturn: {
    coreFunction: 'structure, discipline, limitation, time, karma, responsibility, mastery',
    drives: 'need for security through earned achievement and demonstrated competence',
    shadow: 'rigidity, chronic fear, self-limitation, emotional contraction, depression'
  },
  Uranus: {
    coreFunction: 'disruption, innovation, liberation, rebellion, sudden change, awakening',
    drives: 'need for radical freedom, authenticity, liberation from conventional constraint',
    shadow: 'chaos, instability, willful contrarianism, inability to commit'
  },
  Neptune: {
    coreFunction: 'dissolution, spirituality, imagination, compassion, illusion, transcendence',
    drives: 'need to transcend ego boundaries, to merge with something infinite',
    shadow: 'delusion, escapism, addiction, victim patterns, losing self in others'
  },
  Pluto: {
    coreFunction: 'transformation, power, depth, destruction and rebirth, the unconscious',
    drives: 'need for total transformation, power, and truth at any cost',
    shadow: 'obsession, control, destructive rage, psychological manipulation'
  },
  Rahu: {
    coreFunction: 'desire, obsession, karmic hunger, the direction of soul evolution, ambition',
    drives: 'karmic hunger for the sign/house qualities — what the soul is moving toward in this life',
    shadow: 'insatiable craving, illusion, overreach, inflation in pursuit of the new'
  },
  Ketu: {
    coreFunction: 'release, detachment, past-life mastery, liberation, dissolution of ego',
    drives: 'karmic release — moving away from the sign/house qualities that have been over-developed',
    shadow: 'disconnection, inability to fully engage, self-undoing through detachment'
  }
}

// ── SIGN KNOWLEDGE ───────────────────────────────────────────────────────────

const SIGN_DATA: Record<string, {
  element: string
  modality: string
  ruler: string
  coreNeed: string
  modifies: string
  keywords: string[]
}> = {
  Aries: {
    element: 'Fire', modality: 'Cardinal', ruler: 'Mars',
    coreNeed: 'assertion through initiation and action',
    modifies: 'makes the planet direct, urgent, impulsive, independently motivated — drives toward initiation over completion; asserts before reflecting',
    keywords: ['initiation', 'assertion', 'urgency', 'courage', 'independence', 'directness']
  },
  Taurus: {
    element: 'Earth', modality: 'Fixed', ruler: 'Venus',
    coreNeed: 'security through stability and sensory grounding',
    modifies: 'makes the planet patient, persistent, comfort-seeking, resistant to change — drives toward consolidation and material/sensory security over adaptation',
    keywords: ['stability', 'persistence', 'sensory', 'loyalty', 'endurance', 'possessiveness']
  },
  Gemini: {
    element: 'Air', modality: 'Mutable', ruler: 'Mercury',
    coreNeed: 'stimulation through variety, information, and mental exchange',
    modifies: 'makes the planet curious, adaptable, dual-natured, verbally expressive — drives toward mental variety over sustained emotional depth',
    keywords: ['curiosity', 'adaptability', 'communication', 'duality', 'wit', 'versatility']
  },
  Cancer: {
    element: 'Water', modality: 'Cardinal', ruler: 'Moon',
    coreNeed: 'emotional safety through belonging and intimate connection',
    modifies: 'makes the planet emotionally sensitive, protective, deeply attachment-oriented — drives toward nurturing and defending close bonds; adds strong instinct to withdraw under threat',
    keywords: ['nurturing', 'protection', 'attachment', 'emotional depth', 'memory', 'home']
  },
  Leo: {
    element: 'Fire', modality: 'Fixed', ruler: 'Sun',
    coreNeed: 'to matter — to be genuinely significant to those chosen',
    modifies: 'makes the planet proud, loyal, warmly expressive, recognition-seeking — drives toward self-expression and the need to be seen as significant by those it has chosen; pride activates as armour under rejection',
    keywords: ['recognition', 'loyalty', 'pride', 'generosity', 'self-expression', 'warmth']
  },
  Virgo: {
    element: 'Earth', modality: 'Mutable', ruler: 'Mercury',
    coreNeed: 'usefulness through precision and service',
    modifies: 'makes the planet analytical, self-critical, service-oriented, precise — drives toward perfection and practical utility; the critical eye turns inward before outward',
    keywords: ['precision', 'service', 'analysis', 'improvement', 'health', 'discernment']
  },
  Libra: {
    element: 'Air', modality: 'Cardinal', ruler: 'Venus',
    coreNeed: 'harmony through relationship and balance',
    modifies: 'makes the planet relational, diplomatic, harmony-seeking — direct assertion must pass through relational calculation and the need to preserve balance; can produce decision paralysis and indirect expression of needs',
    keywords: ['balance', 'harmony', 'diplomacy', 'fairness', 'aesthetics', 'relationship']
  },
  Scorpio: {
    element: 'Water', modality: 'Fixed', ruler: 'Mars/Pluto',
    coreNeed: 'transformation through total depth and merger',
    modifies: 'makes the planet intense, probing, secretive, all-or-nothing — drives toward psychological depth, hidden power, and total commitment or total withdrawal; does not release easily',
    keywords: ['depth', 'intensity', 'transformation', 'secrecy', 'power', 'merger', 'loyalty']
  },
  Sagittarius: {
    element: 'Fire', modality: 'Mutable', ruler: 'Jupiter',
    coreNeed: 'freedom through meaning and expansion',
    modifies: 'makes the planet expansive, optimistic, freedom-seeking — drives toward broad horizons and philosophical understanding; exits when emotional weight becomes too heavy; needs room to range',
    keywords: ['freedom', 'expansion', 'philosophy', 'optimism', 'adventure', 'meaning']
  },
  Capricorn: {
    element: 'Earth', modality: 'Cardinal', ruler: 'Saturn',
    coreNeed: 'mastery through achievement and earned respect',
    modifies: 'makes the planet disciplined, ambitious, pragmatic, emotionally controlled — drives toward tangible achievement; emotional expression is deferred in favour of function and appearances',
    keywords: ['discipline', 'ambition', 'responsibility', 'mastery', 'pragmatism', 'control']
  },
  Aquarius: {
    element: 'Air', modality: 'Fixed', ruler: 'Saturn/Uranus',
    coreNeed: 'to be uniquely themselves while belonging to something larger',
    modifies: 'makes the planet idealistic, independently-minded, collectively-oriented — drives toward intellectual and humanitarian expression at the expense of personal intimate warmth; detaches when pressured toward convention',
    keywords: ['independence', 'originality', 'humanitarianism', 'detachment', 'intellect', 'rebellion']
  },
  Pisces: {
    element: 'Water', modality: 'Mutable', ruler: 'Jupiter/Neptune',
    coreNeed: 'union through dissolution — permeable boundaries between self and other',
    modifies: 'makes the planet diffuse, empathic, spiritually oriented, boundary-dissolving — drives toward compassion and imagination but undermines clear definition, direct assertion, and self-maintenance',
    keywords: ['empathy', 'dissolution', 'spirituality', 'imagination', 'compassion', 'surrender']
  }
}

// ── HOUSE KNOWLEDGE ──────────────────────────────────────────────────────────

const HOUSE_DATA: Record<number, {
  domain: string
  modifies: string
}> = {
  1: {
    domain: 'self, body, persona, first impressions, instinctive approach',
    modifies: 'makes the planet visible and instinctive — it becomes part of how the person leads with themselves; others feel it immediately; the person often identifies with it as core self'
  },
  2: {
    domain: 'self-worth, material resources, values, the relationship between worth and security',
    modifies: 'ties the planet\'s domain to self-worth and security — the person\'s sense of their own value is routed through whatever this planet represents; struggles here become struggles with worthiness'
  },
  3: {
    domain: 'communication, daily mind, siblings, immediate environment, learning',
    modifies: 'makes the planet express through communication, thinking, and daily exchange — it shapes the texture of ordinary mental life and how this person speaks and processes information'
  },
  4: {
    domain: 'private self, emotional foundations, home, roots, inner world',
    modifies: 'privatizes the planet\'s energy entirely — whatever this planet represents turns inward toward home, intimate bonds, and emotional foundations; it does not operate through public presence or social performance'
  },
  5: {
    domain: 'creativity, romance, pleasure, self-expression, play, children',
    modifies: 'makes the planet playful, expressive, romantic — it operates through spontaneous self-expression, creative output, and the experience of joy; wants to be enjoyed rather than disciplined'
  },
  6: {
    domain: 'work, health, routine, service, the body in daily function',
    modifies: 'makes the planet express through work, discipline, and practical service — the function is channelled into daily maintenance and bodily health; can produce anxiety through over-focus on imperfection'
  },
  7: {
    domain: 'one-on-one partnership, the other, open opposition',
    modifies: 'routes the planet\'s energy through close relationship — the person may project these qualities onto partners or attract them in others rather than owning them directly; relational patterns here tend to repeat across significant partnerships'
  },
  8: {
    domain: 'transformation, shared resources, depth, sexuality, psychological intensity, power, what is hidden',
    modifies: 'drives the planet\'s energy into deep, hidden, psychologically intense territory — it operates through intimacy, shared power, crisis, and what cannot be easily spoken; attachments formed here run deep and do not release cleanly'
  },
  9: {
    domain: 'philosophy, meaning, higher education, travel, belief systems, expansion',
    modifies: 'makes the planet expansive and meaning-oriented — it reaches outward toward something larger than personal circumstance; operates through ideological or spiritual exploration and the search for a coherent worldview'
  },
  10: {
    domain: 'career, public reputation, vocation, legacy, authority',
    modifies: 'makes the planet operate publicly — career, achievement, and how the person wants to be known are coloured by this planet\'s function and challenges; visible to the world in a way that other houses are not'
  },
  11: {
    domain: 'community, collective, friends, hopes, the future, shared purpose',
    modifies: 'routes the planet\'s energy through groups, networks, and collective purpose — the function expresses best within a community or movement; individual expression becomes secondary to shared vision'
  },
  12: {
    domain: 'hidden self, solitude, the unconscious, spirituality, what is invisible even to the person',
    modifies: 'submerges the planet\'s energy below conscious awareness — it may be hard to access directly and often expresses through isolation, spiritual practice, dreams, or crises that seem to come from nowhere; both gift and blind spot through what is unseen'
  }
}

// ── ESSENTIAL DIGNITIES ──────────────────────────────────────────────────────

const DIGNITIES: Record<string, {
  domicile: string[]
  exaltation: string
  detriment: string[]
  fall: string
}> = {
  Sun:     { domicile: ['Leo'],              exaltation: 'Aries',       detriment: ['Aquarius'],              fall: 'Libra'      },
  Moon:    { domicile: ['Cancer'],           exaltation: 'Taurus',      detriment: ['Capricorn'],             fall: 'Scorpio'    },
  Mercury: { domicile: ['Gemini', 'Virgo'],  exaltation: 'Virgo',       detriment: ['Sagittarius', 'Pisces'], fall: 'Pisces'     },
  Venus:   { domicile: ['Taurus', 'Libra'],  exaltation: 'Pisces',      detriment: ['Aries', 'Scorpio'],      fall: 'Virgo'      },
  Mars:    { domicile: ['Aries', 'Scorpio'], exaltation: 'Capricorn',   detriment: ['Taurus', 'Libra'],       fall: 'Cancer'     },
  Jupiter: { domicile: ['Sagittarius', 'Pisces'], exaltation: 'Cancer', detriment: ['Gemini', 'Virgo'],       fall: 'Capricorn'  },
  Saturn:  { domicile: ['Capricorn', 'Aquarius'], exaltation: 'Libra',  detriment: ['Cancer', 'Leo'],         fall: 'Aries'      },
  Rahu:    { domicile: ['Gemini', 'Virgo'],  exaltation: 'Taurus',      detriment: ['Sagittarius', 'Pisces'], fall: 'Scorpio'    },
  Ketu:    { domicile: ['Sagittarius', 'Pisces'], exaltation: 'Scorpio', detriment: ['Gemini', 'Virgo'],      fall: 'Taurus'     },
}

// ── RULERSHIPS ───────────────────────────────────────────────────────────────

// Traditional (Western) — used for tropical dispositor chains
const SIGN_RULERS_TRADITIONAL: Record<string, string> = {
  Aries: 'Mars', Taurus: 'Venus', Gemini: 'Mercury', Cancer: 'Moon',
  Leo: 'Sun', Virgo: 'Mercury', Libra: 'Venus', Scorpio: 'Mars',
  Sagittarius: 'Jupiter', Capricorn: 'Saturn', Aquarius: 'Saturn', Pisces: 'Jupiter'
}

// Vedic — no outer planets; identical to traditional in this case
const SIGN_RULERS_VEDIC: Record<string, string> = { ...SIGN_RULERS_TRADITIONAL }

// ── NAKSHATRA KNOWLEDGE ──────────────────────────────────────────────────────

const NAKSHATRA_DATA: Record<string, {
  ruler: string
  deity: string
  theme: string
  psychologicalQuality: string
}> = {
  'Ashwini':          { ruler: 'Ketu',    deity: 'Ashwini Kumaras (divine physicians)',  theme: 'initiation, healing, swift beginnings',             psychologicalQuality: 'urgent forward movement; healing impulse; eagerness that precedes full awareness' },
  'Bharani':          { ruler: 'Venus',   deity: 'Yama (god of death and dharma)',        theme: 'bearing, creation and destruction, moral weight',   psychologicalQuality: 'capacity to hold intense experience — creation and destruction simultaneously; deep accountability' },
  'Krittika':         { ruler: 'Sun',     deity: 'Agni (fire god)',                       theme: 'purification, cutting away, clarity',               psychologicalQuality: 'razor-sharp discernment; capacity to cut through what is false; heat that purifies or burns' },
  'Rohini':           { ruler: 'Moon',    deity: 'Brahma (creator)',                      theme: 'growth, fertility, beauty, attachment',             psychologicalQuality: 'deep sensory and aesthetic richness; intense attachment to the beautiful; creative fertility' },
  'Mrigashira':       { ruler: 'Mars',    deity: 'Soma (moon god)',                       theme: 'seeking, gentle exploration, searching',            psychologicalQuality: 'perpetual searching quality — alert, curious, never quite arrived; gentleness combined with restlessness' },
  'Ardra':            { ruler: 'Rahu',    deity: 'Rudra (storm god)',                     theme: 'tempest, destruction making way for renewal',       psychologicalQuality: 'raw emotional intensity; grief that transforms; the storm that clears what was stagnant' },
  'Punarvasu':        { ruler: 'Jupiter', deity: 'Aditi (mother of gods, infinite)',      theme: 'return, renewal, restoration, optimism',            psychologicalQuality: 'capacity to return to essential self after being lost; optimism as a deep structural feature' },
  'Pushya':           { ruler: 'Saturn',  deity: 'Brihaspati (divine teacher)',           theme: 'nourishment, spiritual sustenance, steady care',    psychologicalQuality: 'deep nurturing instinct; capacity to sustain others across time; spiritual nourishment given reliably' },
  'Ashlesha':         { ruler: 'Mercury', deity: 'Nagas (serpent gods)',                  theme: 'coiling, penetrating insight, kundalini',           psychologicalQuality: 'penetrating psychological intelligence; capacity to see beneath surfaces; can heal or poison' },
  'Magha':            { ruler: 'Ketu',    deity: 'Pitrs (ancestors)',                     theme: 'ancestral power, throne, lineage, authority',       psychologicalQuality: 'connection to ancestral legacy; natural authority; pride in lineage and inheritance' },
  'Purva Phalguni':   { ruler: 'Venus',   deity: 'Bhaga (god of pleasure)',               theme: 'rest, pleasure, creativity, relational delight',    psychologicalQuality: 'deep capacity for pleasure and creative enjoyment; relational warmth; the delight of being alive' },
  'Uttara Phalguni':  { ruler: 'Sun',     deity: 'Aryaman (patron of covenant)',          theme: 'sustained partnership, covenant, reliability',      psychologicalQuality: 'reliability in partnership; capacity to honor long-term commitments; fair dealing' },
  'Hasta':            { ruler: 'Moon',    deity: 'Savitar (solar deity of skill)',        theme: 'skill, craftsmanship, precise dexterity',           psychologicalQuality: 'precise practical intelligence; capacity to manifest ideas in material form with exactness' },
  'Chitra':           { ruler: 'Mars',    deity: 'Vishvakarma (divine architect)',        theme: 'beauty, luminous form, creation',                   psychologicalQuality: 'strong aesthetic drive; need to create beautiful, meaningful form; luminous originality' },
  'Swati':            { ruler: 'Rahu',    deity: 'Vayu (wind god)',                       theme: 'independence, movement, flexibility',               psychologicalQuality: 'capacity to bend without breaking; deep need for freedom; movement as essential to psychological health' },
  'Vishakha':         { ruler: 'Jupiter', deity: 'Indra-Agni (king of gods and fire)',   theme: 'goal-oriented ambition, burning purpose, victory',  psychologicalQuality: 'fierce goal-directedness; will to achieve across long time horizons; difficulty resting in the incomplete' },
  'Anuradha':         { ruler: 'Saturn',  deity: 'Mitra (god of friendship)',             theme: 'devotion, deep loyalty, cooperation',               psychologicalQuality: 'capacity for sustained devoted loyalty across difficulty; depth of bond that endures' },
  'Jyeshtha':         { ruler: 'Mercury', deity: 'Indra (king of gods)',                  theme: 'eldership, protective authority, leadership',       psychologicalQuality: 'protective responsibility toward those in one\'s care; elder instinct; can be overbearing or heroic' },
  'Mula':             { ruler: 'Ketu',    deity: 'Nirriti (goddess of dissolution)',      theme: 'root investigation, dissolution, going to source',  psychologicalQuality: 'compulsion to investigate beneath surfaces; capacity to dismantle what is false; the search for original cause' },
  'Purva Ashadha':    { ruler: 'Venus',   deity: 'Apas (water goddesses)',                theme: 'invincibility, purification, early victory',        psychologicalQuality: 'undefeated inner confidence; cleansing and relentless; early success that requires humility to sustain' },
  'Uttara Ashadha':   { ruler: 'Sun',     deity: 'Vishvadevas (universal gods)',          theme: 'lasting achievement, universal principles',         psychologicalQuality: 'slow arc toward permanent achievement; capacity to defer reward; victory through principle rather than personal will' },
  'Shravana':         { ruler: 'Moon',    deity: 'Vishnu (preserver)',                    theme: 'listening, learning, preservation, connection',     psychologicalQuality: 'gift of genuine listening; capacity to preserve and transmit knowledge; connection as primary mode of being' },
  'Dhanishtha':       { ruler: 'Mars',    deity: 'Eight Vasus (gods of abundance)',       theme: 'abundance, rhythm, fame, timing',                   psychologicalQuality: 'natural sense of rhythm and timing; capacity for abundance; resonance of the person who knows when to act' },
  'Shatabhisha':      { ruler: 'Rahu',    deity: 'Varuna (god of cosmic law and healing)', theme: 'healing, concealment, independent intelligence',  psychologicalQuality: 'depth of healing capacity; instinct to conceal and protect; independent intelligence that works in private' },
  'Purva Bhadrapada': { ruler: 'Jupiter', deity: 'Aja Ekapada (one-footed serpent)',      theme: 'fierce transcendence, ascetic fire, burning ego',   psychologicalQuality: 'capacity to sacrifice comfort for higher purpose; intensity that burns away the ordinary; ascetic streak' },
  'Uttara Bhadrapada':{ ruler: 'Saturn',  deity: 'Ahir Budhnya (serpent of the deep)',   theme: 'patient depth, containment, earned wisdom',         psychologicalQuality: 'deep-ocean stillness; patient wisdom through sustained depth; wisdom earned through containment' },
  'Revati':           { ruler: 'Mercury', deity: 'Pushan (god of journeys)',              theme: 'completion, nourishing the path, abundance',        psychologicalQuality: 'compassion that nourishes those on the path; gentle completion; abundance from having fully arrived' }
}

// ── ASPECT DEFINITIONS ───────────────────────────────────────────────────────

const ASPECT_DEFS = [
  { name: 'Conjunction', angle: 0,   orb: 8, glyph: '☌', nature: 'merger — the two planets operate as a single intensified unit; their energies amplify each other, for better or worse; the combined effect is harder to modulate than either alone', quality: 'intensifying' },
  { name: 'Sextile',     angle: 60,  orb: 6, glyph: '⚹', nature: 'latent cooperation — the planets can work in concert when intentional, but the ease requires activation and tends to go unnoticed because it creates no friction', quality: 'cooperative' },
  { name: 'Square',      angle: 90,  orb: 8, glyph: '□', nature: 'productive friction — the planets pull in incompatible directions; this conflict returns again and again without clean resolution; the most generative difficult aspect', quality: 'tense' },
  { name: 'Trine',       angle: 120, orb: 8, glyph: '△', nature: 'natural flow — the planets work together easily and automatically; the gift may be so effortless it goes unexamined and underdeveloped', quality: 'flowing' },
  { name: 'Opposition',  angle: 180, orb: 8, glyph: '☍', nature: 'polarization — the person tends to identify with one pole and project the other onto partners or adversaries; what feels external is often an unintegrated internal tension', quality: 'polarizing' }
]

// ── VIMSHOTTARI DASHA ────────────────────────────────────────────────────────

const DASHA_LORDS_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury']
const DASHA_YEARS_MAP: Record<string, number> = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7,
  Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17
}
// Nakshatra index (0–26) → index into DASHA_LORDS_ORDER; repeats in groups of 9
const NAKSHATRA_TO_DASHA_IDX: number[] = [
  0, 1, 2, 3, 4, 5, 6, 7, 8,  // Ashwini–Ashlesha
  0, 1, 2, 3, 4, 5, 6, 7, 8,  // Magha–Jyeshtha
  0, 1, 2, 3, 4, 5, 6, 7, 8   // Mula–Revati
]
const NAKSHATRAS_ORDERED = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishtha', 'Shatabhisha',
  'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
]

export interface DashaInfo {
  mahadasha: string
  mahaDashaEndDate: string  // YYYY-MM
  antardasha: string
  antarDashaEndDate: string // YYYY-MM
}

export function computeVimshottariDasha(chartData: DualChartData): DashaInfo | null {
  const moon = chartData.sidereal.planets.find(p => p.name === 'Moon')
  if (!moon || !moon.nakshatra) return null

  const nakshatraIdx = NAKSHATRAS_ORDERED.indexOf(moon.nakshatra)
  if (nakshatraIdx < 0) return null

  const dashaLordIdx  = NAKSHATRA_TO_DASHA_IDX[nakshatraIdx]
  const nakshatraSize = 360 / 27
  const posInNakshatra = moon.longitude % nakshatraSize
  const fractionElapsed = posInNakshatra / nakshatraSize

  const startDashaYears = DASHA_YEARS_MAP[DASHA_LORDS_ORDER[dashaLordIdx]]
  const elapsedYears    = fractionElapsed * startDashaYears

  const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000
  const bd = chartData.birthData

  // Birth time in UTC milliseconds
  const totalLocalMinutes = bd.hour * 60 + bd.minute - Math.round(bd.timezone * 60)
  const birthMS = Date.UTC(
    bd.year, bd.month - 1, bd.day,
    Math.floor(totalLocalMinutes / 60),
    ((totalLocalMinutes % 60) + 60) % 60
  )

  // When the starting dasha actually began (before birth by elapsedYears)
  const firstDashaStartMS = birthMS - elapsedYears * MS_PER_YEAR
  const now = Date.now()

  let t      = firstDashaStartMS
  let lordI  = dashaLordIdx
  let mahadasha      = ''
  let mahaDashaEndMS = 0

  for (let i = 0; i < 20; i++) {
    const lord  = DASHA_LORDS_ORDER[lordI % 9]
    const years = DASHA_YEARS_MAP[lord]
    const endMS = t + years * MS_PER_YEAR
    if (now <= endMS) {
      mahadasha      = lord
      mahaDashaEndMS = endMS
      break
    }
    t = endMS
    lordI++
  }

  if (!mahadasha) return null

  const mahaDashaStartMS = t
  const mahaDashaYears   = DASHA_YEARS_MAP[mahadasha]
  const startAntarI      = DASHA_LORDS_ORDER.indexOf(mahadasha)

  let at          = mahaDashaStartMS
  let antardasha  = ''
  let antarEndMS  = 0

  for (let i = 0; i < 9; i++) {
    const antarLord  = DASHA_LORDS_ORDER[(startAntarI + i) % 9]
    const antarYears = (DASHA_YEARS_MAP[antarLord] / 120) * mahaDashaYears
    const antarEnd   = at + antarYears * MS_PER_YEAR
    if (now <= antarEnd) {
      antardasha = antarLord
      antarEndMS = antarEnd
      break
    }
    at = antarEnd
  }

  if (!antardasha) return null

  const fmtDate = (ms: number) => {
    const d = new Date(ms)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  return {
    mahadasha,
    mahaDashaEndDate:  fmtDate(mahaDashaEndMS),
    antardasha,
    antarDashaEndDate: fmtDate(antarEndMS),
  }
}

// ── YOGA DETECTION ────────────────────────────────────────────────────────────

const SIGNS_ORDERED = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
]

export function detectMajorYogas(chart: ChartData): string[] {
  const yogas: string[] = []
  const lagnaIdx = SIGNS_ORDERED.indexOf(chart.ascendantSign)
  if (lagnaIdx < 0) return yogas

  const houseSign = (h: number): string => SIGNS_ORDERED[(lagnaIdx + h - 1) % 12]
  const signLord  = (sign: string): string => SIGN_RULERS_VEDIC[sign] || ''
  const KENDRAS   = [1, 4, 7, 10]

  // Pancha Mahapurusha Yogas — angular + dignified planets
  const MAHAPURUSHA = [
    { planet: 'Mars',    ownSigns: ['Aries', 'Scorpio'],          exaltSign: 'Capricorn', yoga: 'Ruchaka' },
    { planet: 'Mercury', ownSigns: ['Gemini', 'Virgo'],           exaltSign: 'Virgo',     yoga: 'Bhadra'  },
    { planet: 'Jupiter', ownSigns: ['Sagittarius', 'Pisces'],     exaltSign: 'Cancer',    yoga: 'Hamsa'   },
    { planet: 'Venus',   ownSigns: ['Taurus', 'Libra'],           exaltSign: 'Pisces',    yoga: 'Malavya' },
    { planet: 'Saturn',  ownSigns: ['Capricorn', 'Aquarius'],     exaltSign: 'Libra',     yoga: 'Shasha'  },
  ]

  for (const { planet, ownSigns, exaltSign, yoga } of MAHAPURUSHA) {
    const p = chart.planets.find(pl => pl.name === planet)
    if (!p) continue
    const inStrength = ownSigns.includes(p.sign) || p.sign === exaltSign
    if (inStrength && KENDRAS.includes(p.house)) {
      const digType = ownSigns.includes(p.sign) ? 'own sign' : 'exaltation'
      yogas.push(`${yoga} Yoga: ${planet} in ${p.sign} (${digType}) in House ${p.house} — strong angular dignity amplifies this planet's significations across the chart`)
    }
  }

  // Raja Yoga — conjunction of a kendra lord and a trikona lord
  // Use filter-based dedup instead of Set spread to stay compatible with ES5 target
  const TRIKONAS     = [1, 5, 9]
  const kendraLordsRaw  = KENDRAS.map(h => signLord(houseSign(h))).filter(Boolean) as string[]
  const trikonaLordsRaw = TRIKONAS.map(h => signLord(houseSign(h))).filter(Boolean) as string[]
  const kendraLords  = kendraLordsRaw.filter((v, i, a) => a.indexOf(v) === i)
  const trikonaLords = trikonaLordsRaw.filter((v, i, a) => a.indexOf(v) === i)

  for (const kl of kendraLords) {
    for (const tl of trikonaLords) {
      if (kl === tl) continue  // 1st-house lord is already in both lists; skip self-conjunction
      const klP = chart.planets.find(p => p.name === kl)
      const tlP = chart.planets.find(p => p.name === tl)
      if (!klP || !tlP) continue
      if (klP.house === tlP.house) {
        const klH = KENDRAS.find(h => signLord(houseSign(h)) === kl)
        const tlH = TRIKONAS.find(h => signLord(houseSign(h)) === tl)
        yogas.push(`Raja Yoga: ${kl} (lord of House ${klH}) and ${tl} (lord of House ${tlH}) conjunct in House ${klP.house} — kendra and trikona rulers aligned`)
      }
    }
  }

  // Viparita Raja Yoga — 6th/8th/12th lords placed in dusthana houses
  const DUSTHANAS = [6, 8, 12]
  const dusthanaLords = DUSTHANAS.map(h => signLord(houseSign(h))).filter(Boolean)
  const placed: string[] = []

  for (const dl of dusthanaLords) {
    const p = chart.planets.find(pl => pl.name === dl)
    if (p && DUSTHANAS.includes(p.house)) {
      placed.push(`${dl} in House ${p.house}`)
    }
  }
  if (placed.length >= 2) {
    yogas.push(`Viparita Raja Yoga: ${placed.join(', ')} — difficulty-house lords confined in difficulty houses; potential for unexpected advancement through adversity`)
  }

  return yogas
}

// ── ENGINE FUNCTIONS ──────────────────────────────────────────────────────────

function angleDiff(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360
  if (diff > 180) diff = 360 - diff
  return diff
}

function computeDignity(planetName: string, signName: string): { status: string; description: string } {
  const d = DIGNITIES[planetName]
  if (!d) return { status: 'peregrine', description: 'no special dignity or debility — neutral; operates according to sign and house character without exceptional ease or difficulty' }

  if (d.domicile.includes(signName)) {
    // Check for simultaneous exaltation (e.g. Mercury in Virgo)
    const alsoExalted = d.exaltation === signName
    return {
      status: alsoExalted ? 'DOMICILE + EXALTATION' : 'DOMICILE',
      description: alsoExalted
        ? `${planetName} in both domicile and exaltation — maximum self-expression at its most elevated; can tip into over-expression`
        : `${planetName} in its own sign — full access to its natural function; no foreign interference; maximum self-expression`
    }
  }
  if (d.exaltation === signName) {
    return { status: 'EXALTATION', description: `${planetName} in exaltation — honoured and elevated; expresses at its highest potential; can tip into over-expression or idealisation of the function` }
  }
  if (d.detriment.includes(signName)) {
    return { status: 'DETRIMENT', description: `${planetName} in detriment — in the sign opposite its domicile; the natural function is frustrated, redirected, or expressed in complicated ways; must work against the grain of the sign to assert itself` }
  }
  if (d.fall === signName) {
    return { status: 'FALL', description: `${planetName} in fall — opposite exaltation; at its most challenged; must work hardest for results others achieve more naturally; can produce significant difficulty or, through that effort, uncommon depth and resilience` }
  }
  return { status: 'peregrine', description: 'no special dignity or debility — neutral placement' }
}

// Returns a compact dignity label for the elite chart block
function dignityLabel(planetName: string, signName: string): string {
  const d = DIGNITIES[planetName]
  if (!d) return 'Peregrine'
  const isDomicile   = d.domicile.includes(signName)
  const isExaltation = d.exaltation === signName
  const isDetriment  = d.detriment.includes(signName)
  const isFall       = d.fall === signName
  if (isDomicile && isExaltation) return 'Domicile + Exaltation ✓'
  if (isDomicile)   return 'Domicile ✓'
  if (isExaltation) return 'Exaltation ✓'
  if (isDetriment)  return 'Detriment'
  if (isFall)       return 'Fall'
  return 'Peregrine'
}

interface Aspect {
  planet1: string
  planet2: string
  aspectName: string
  glyph: string
  orb: number
  applying: boolean  // true = orb decreasing (planets converging on exact aspect)
  nature: string
  quality: string
}

function computeAspects(planets: PlanetPosition[], filter?: string[]): Aspect[] {
  const aspects: Aspect[] = []
  const candidates = planets.filter(p => p.name !== 'Ketu') // Ketu tracked via Rahu axis

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const p1 = candidates[i]
      const p2 = candidates[j]

      if (filter && filter.length > 0 && !filter.includes(p1.name) && !filter.includes(p2.name)) continue

      const diff = angleDiff(p1.longitude, p2.longitude)
      for (const def of ASPECT_DEFS) {
        const orb = Math.abs(diff - def.angle)
        if (orb <= def.orb) {
          // Applying/separating: compare orb tomorrow using each planet's daily motion
          const p1LonTom = p1.longitude + (p1.dailyMotion ?? 0)
          const p2LonTom = p2.longitude + (p2.dailyMotion ?? 0)
          const diffTom  = angleDiff(p1LonTom, p2LonTom)
          const orbTom   = Math.abs(diffTom - def.angle)
          const applying = orbTom < orb

          aspects.push({
            planet1: p1.name,
            planet2: p2.name,
            aspectName: def.name,
            glyph: def.glyph,
            orb: Math.round(orb * 10) / 10,
            applying,
            nature: def.nature,
            quality: def.quality,
          })
          break
        }
      }
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb) // tightest first
}

function getDispositor(planet: PlanetPosition, allPlanets: PlanetPosition[], vedic = false): string {
  const rulers = vedic ? SIGN_RULERS_VEDIC : SIGN_RULERS_TRADITIONAL
  const rulerName = rulers[planet.sign]
  const rulerPlanet = allPlanets.find(p => p.name === rulerName)
  if (!rulerPlanet) return `${planet.name} in ${planet.sign} → ruler is ${rulerName} (not separately placed in chart)`

  const rulerDignity = computeDignity(rulerName, rulerPlanet.sign)
  return `${planet.name} in ${planet.sign} → ruled by ${rulerName} → ${rulerName} in ${rulerPlanet.sign} H${rulerPlanet.house}${rulerPlanet.retrograde ? ' (R)' : ''} [${rulerDignity.status}] — the sign of ${planet.name} is governed by a planet placed in ${rulerPlanet.sign} H${rulerPlanet.house}; whatever ${rulerName} does modifies what ${planet.name} can deliver`
}

function buildConflicts(planet: PlanetPosition, aspects: Aspect[], _allPlanets: PlanetPosition[]): string[] {
  const conflicts: string[] = []
  const pData = PLANET_CORE[planet.name]
  const sData = SIGN_DATA[planet.sign]
  if (!pData || !sData) return conflicts

  const dignity = computeDignity(planet.name, planet.sign)
  if (dignity.status === 'DETRIMENT') {
    conflicts.push(`${planet.name} is in DETRIMENT in ${planet.sign}: its core drive (${pData.drives}) runs against the grain of ${planet.sign}'s need (${sData.coreNeed}). Direct expression is complicated; the energy is present but frustrated or redirected`)
  }
  if (dignity.status === 'FALL') {
    conflicts.push(`${planet.name} is in FALL in ${planet.sign}: the deepest dignity challenge — both the planet's function and the sign's character resist easy alignment; this placement requires significant effort and often produces either chronic difficulty or, through that struggle, unusual psychological depth`)
  }

  aspects
    .filter(a => (a.planet1 === planet.name || a.planet2 === planet.name) && a.aspectName === 'Square')
    .forEach(sq => {
      const other = sq.planet1 === planet.name ? sq.planet2 : sq.planet1
      const otherData = PLANET_CORE[other]
      if (otherData) {
        conflicts.push(`${planet.name} square ${other} (orb ${sq.orb}°, ${sq.applying ? 'applying' : 'separating'}): ${planet.name}'s drive (${pData.drives}) in ongoing incompatible tension with ${other}'s function (${otherData.coreFunction}). This conflict recurs without clean resolution — generative but perpetually unresolved`)
      }
    })

  aspects
    .filter(a => (a.planet1 === planet.name || a.planet2 === planet.name) && a.aspectName === 'Opposition')
    .forEach(opp => {
      const other = opp.planet1 === planet.name ? opp.planet2 : opp.planet1
      const otherData = PLANET_CORE[other]
      if (otherData) {
        conflicts.push(`${planet.name} opposite ${other} (orb ${opp.orb}°, ${opp.applying ? 'applying' : 'separating'}): polarisation dynamic — person tends to over-identify with ${planet.name}'s function and project ${other}'s (${otherData.coreFunction}) onto partners or external situations`)
      }
    })

  // Conjunctions with natural malefics create a fusion that complicates the benefic planet's function
  const MALEFICS = new Set(['Saturn', 'Mars', 'Rahu', 'Ketu'])
  aspects
    .filter(a => (a.planet1 === planet.name || a.planet2 === planet.name) && a.aspectName === 'Conjunction')
    .forEach(conj => {
      const other = conj.planet1 === planet.name ? conj.planet2 : conj.planet1
      const otherData = PLANET_CORE[other]
      if (otherData && MALEFICS.has(other) && !MALEFICS.has(planet.name)) {
        conflicts.push(`${planet.name} conjunct ${other} (orb ${conj.orb}°, ${conj.applying ? 'applying' : 'separating'}): close fusion with a natural malefic — ${planet.name}'s function (${pData.coreFunction}) is intensified and complicated by ${other}'s character (${otherData.coreFunction}); the energies merge rather than simply conflict, making modulation harder`)
      }
    })

  return conflicts
}

// ── FORMATTERS ────────────────────────────────────────────────────────────────

// Formats degree as D°MM' (e.g. 14°22')
function fmtDeg(deg: number): string {
  const d = Math.floor(deg)
  const m = Math.round((deg - d) * 60)
  return `${d}°${String(m).padStart(2, '0')}'`
}

/**
 * Produces the compact, human-readable elite chart block injected at the top of
 * every user message.  Format matches the task specification:
 *
 *   TROPICAL CHART
 *   Sun: Leo 14°22' · House 4 · Domicile ✓ · direct
 *   ...
 *   ASPECTS (tightest first)
 *   Sun □ Saturn (orb 2°14' · applying) — Saturn in House 1
 *   ...
 *   CHART RULER
 *   Ascendant: Aries · Ruler: Mars · Mars in House 8, Scorpio, Peregrine
 */
export function formatEliteChartBlock(chart: ChartData, system: 'tropical' | 'sidereal'): string {
  const vedic = system === 'sidereal'
  const lines: string[] = []

  lines.push(`${system.toUpperCase()} CHART`)
  lines.push(`Ascendant: ${chart.ascendantSign} ${fmtDeg(chart.ascendantDegree)} · House 1`)
  lines.push(`MC (Midheaven): ${chart.midheavenSign} ${fmtDeg(chart.midheavenDegree)} · career/public axis (not the Whole Sign 10th-house cusp)`)
  lines.push('')

  // All planetary positions
  for (const p of chart.planets) {
    const dig  = dignityLabel(p.name, p.sign)
    const dir  = p.retrograde ? 'retrograde ℞' : 'direct'
    let line   = `${p.name}: ${p.sign} ${fmtDeg(p.degree)} · House ${p.house} · ${dig} · ${dir}`
    if (vedic && p.nakshatra) {
      line += ` · ${p.nakshatra} Pada ${p.nakshatraPada}`
    }
    lines.push(line)
  }
  lines.push('')

  // Chart ruler / Lagna lord
  const rulers    = vedic ? SIGN_RULERS_VEDIC : SIGN_RULERS_TRADITIONAL
  const rulerName = rulers[chart.ascendantSign]
  const rulerP    = chart.planets.find(p => p.name === rulerName)
  if (rulerP) {
    const rulerDig = dignityLabel(rulerName, rulerP.sign)
    lines.push(`${vedic ? 'LAGNA LORD' : 'CHART RULER'}: Ascendant ${chart.ascendantSign} · Ruler: ${rulerName} · ${rulerName} in House ${rulerP.house}, ${rulerP.sign}, ${rulerDig}`)
  }

  return lines.join('\n')
}

// ── CONTEXT FORMATTERS ────────────────────────────────────────────────────────

// Evidence-weighted Moon cross-reference — replaces the old categorical boolean approach.
// Returns a structured evidence block describing the Moon's attachment/detachment axis
// based on multiple weighted indicators rather than a single sign-element verdict.
interface MoonEvidenceResult {
  attachmentIndicators: string[]
  detachmentIndicators: string[]
  complicatingFactors: string[]
  netBalance: 'attachment-dominated' | 'detachment-dominated' | 'balanced'
}

function computeMoonEvidence(moon: PlanetPosition, allAspects: Aspect[]): MoonEvidenceResult {
  const moonSignData  = SIGN_DATA[moon.sign]
  const moonDig       = computeDignity('Moon', moon.sign)
  const moonAspects   = allAspects.filter(a => a.planet1 === 'Moon' || a.planet2 === 'Moon')

  const attachmentIndicators: string[] = []
  const detachmentIndicators: string[] = []
  const complicatingFactors:  string[] = []

  // Sign-based evidence (moderate weight — weaker than house or aspect)
  if (moonSignData) {
    if (moonSignData.element === 'Water') {
      attachmentIndicators.push(`Moon in ${moon.sign} (Water: deep bonding instinct, does not release emotional bonds easily)`)
    } else if (moonSignData.element === 'Earth') {
      attachmentIndicators.push(`Moon in ${moon.sign} (Earth: security through constancy, attaches slowly but deeply)`)
    } else if (moonSignData.element === 'Air') {
      detachmentIndicators.push(`Moon in ${moon.sign} (Air: emotional processing through distance and analysis; needs mental room)`)
    } else if (moonSignData.element === 'Fire') {
      complicatingFactors.push(`Moon in ${moon.sign} (Fire: emotionally responsive and warm but also needs freedom; attachment is present but may not be possessive)`)
    }
  }

  // House-based evidence (strong weight — domain where emotional life plays out)
  if (moon.house === 8) {
    attachmentIndicators.push(`Moon in H8 (transformation/depth: emotional life runs at psychological depth; bonds here do not release cleanly, even after they appear to have ended outwardly)`)
  } else if (moon.house === 4) {
    attachmentIndicators.push(`Moon in H4 (private foundations: emotional life rooted in home and intimate bonds; fiercely protective of what it considers its own)`)
  } else if (moon.house === 2) {
    attachmentIndicators.push(`Moon in H2 (self-worth: emotional security tied to what it possesses or values; attachment carries a possessive quality)`)
  } else if (moon.house === 12) {
    complicatingFactors.push(`Moon in H12 (hidden self: emotional life operates largely below conscious awareness; attachment pattern may be opaque even to the person themselves)`)
  } else if (moon.house === 11) {
    detachmentIndicators.push(`Moon in H11 (collective: emotional needs met through groups and shared purpose rather than intimate possession; warm but non-possessive)`)
  } else if (moon.house === 9) {
    detachmentIndicators.push(`Moon in H9 (expansion: emotional needs include freedom and philosophical space; genuine attachment, but cannot survive prolonged confinement)`)
  } else if (moon.house === 3) {
    detachmentIndicators.push(`Moon in H3 (daily mind: emotional needs channelled through communication and variety; less intense fixity in personal bonds)`)
  }

  // Dignity-based evidence
  if (moonDig.status === 'EXALTATION') {
    attachmentIndicators.push(`Moon in exaltation (${moon.sign}): emotional nature at its most settled and receptive; stable, grounded attachment patterns`)
  } else if (moonDig.status === 'FALL') {
    complicatingFactors.push(`Moon in fall (${moon.sign}): emotional functioning under significant pressure; neither attachment nor detachment operates cleanly or predictably`)
  } else if (moonDig.status === 'DETRIMENT') {
    complicatingFactors.push(`Moon in detriment (${moon.sign}): emotional instinct works against the sign's character; instinctive responses are complicated and may not match the outward presentation`)
  }

  // Aspect-based evidence (specific, high weight)
  for (const asp of moonAspects) {
    const otherName = asp.planet1 === 'Moon' ? asp.planet2 : asp.planet1
    const orbStr    = `orb ${asp.orb}°`
    const isHard    = ['Conjunction', 'Square', 'Opposition'].includes(asp.aspectName)
    if (otherName === 'Saturn') {
      complicatingFactors.push(`Moon ${asp.glyph} Saturn (${orbStr}): emotional contraction and reserve — attachment may be deep but expressed obliquely, withheld, or blocked under pressure`)
    }
    if (otherName === 'Uranus' && isHard) {
      detachmentIndicators.push(`Moon ${asp.glyph} Uranus (${orbStr}): sudden emotional detachment; unpredictable availability; freedom needs can override sustained attachment without warning`)
    }
    if (otherName === 'Neptune' && isHard) {
      complicatingFactors.push(`Moon ${asp.glyph} Neptune (${orbStr}): emotional boundaries are porous; attachment and dissolution are both heightened; bonds may be idealised or confused`)
    }
    if (otherName === 'Pluto' && isHard) {
      attachmentIndicators.push(`Moon ${asp.glyph} Pluto (${orbStr}): intense psychological bonding; does not release what it has merged with — the person may carry bonds internally long after they appear to have ended outwardly`)
    }
    if (otherName === 'Mars' && isHard) {
      complicatingFactors.push(`Moon ${asp.glyph} Mars (${orbStr}): emotional life charged with reactive energy; intensity and impulsiveness complicate both attachment and detachment`)
    }
  }

  // Compute net balance from evidence counts (complicating factors are neutral for this)
  const attachScore = attachmentIndicators.length
  const detachScore = detachmentIndicators.length
  let netBalance: 'attachment-dominated' | 'detachment-dominated' | 'balanced'
  if (attachScore > detachScore + 1)      netBalance = 'attachment-dominated'
  else if (detachScore > attachScore + 1) netBalance = 'detachment-dominated'
  else                                     netBalance = 'balanced'

  return { attachmentIndicators, detachmentIndicators, complicatingFactors, netBalance }
}

function formatMoonEvidenceBlock(moon: PlanetPosition, chart: ChartData, focalPlanetName: string): string {
  const allAspects  = computeAspects(chart.planets)
  const evidence    = computeMoonEvidence(moon, allAspects)
  const moonDig     = computeDignity('Moon', moon.sign)
  const lines: string[] = []

  lines.push(`MOON EMOTIONAL EVIDENCE (cross-reference before making behavioural claims about ${focalPlanetName}):`)
  lines.push(`Moon: ${moon.sign} ${moon.degree.toFixed(1)}° | H${moon.house}${moon.retrograde ? ' (R)' : ''} [${moonDig.status}]`)
  lines.push('')

  if (evidence.attachmentIndicators.length > 0) {
    lines.push('Attachment indicators:')
    evidence.attachmentIndicators.forEach(e => lines.push(`  + ${e}`))
  }
  if (evidence.detachmentIndicators.length > 0) {
    lines.push('Detachment / independence indicators:')
    evidence.detachmentIndicators.forEach(e => lines.push(`  - ${e}`))
  }
  if (evidence.complicatingFactors.length > 0) {
    lines.push('Complicating factors:')
    evidence.complicatingFactors.forEach(e => lines.push(`  ~ ${e}`))
  }

  const netNote = evidence.netBalance === 'attachment-dominated'
    ? `Attachment indicators dominate. Name ${focalPlanetName}'s impulse AND the Moon's capacity (or inability) to follow through — both, not one or the other alone.`
    : evidence.netBalance === 'detachment-dominated'
      ? `Detachment indicators dominate. The Moon may reinforce or enable ${focalPlanetName}'s independence or capacity to exit. Still name both sides.`
      : `Mixed evidence. Do not declare attachment or detachment dominant — name the tension between ${focalPlanetName}'s drive and the Moon's contradictory pull.`

  lines.push('')
  lines.push(`Evidence balance: ${netNote}`)

  return lines.join('\n')
}

function formatPlanetBlock(planet: PlanetPosition, chart: ChartData, system: 'tropical' | 'sidereal'): string {
  const pData = PLANET_CORE[planet.name]
  const sData = SIGN_DATA[planet.sign]
  const hData = HOUSE_DATA[planet.house]
  const vedic = system === 'sidereal'

  const dignity  = computeDignity(planet.name, planet.sign)
  const aspects  = computeAspects(chart.planets, [planet.name])
  const dispositorChain = getDispositor(planet, chart.planets, vedic)
  const conflicts = buildConflicts(planet, aspects, chart.planets)

  const lines: string[] = []
  lines.push(`── ${planet.name.toUpperCase()} ──────────────────────────────`)
  lines.push(`Placement: ${planet.sign} ${planet.degree.toFixed(1)}° | House ${planet.house}${planet.retrograde ? ' (Retrograde ℞)' : ' (Direct)'}`)
  if (planet.nakshatra) lines.push(`Nakshatra: ${planet.nakshatra} Pada ${planet.nakshatraPada}`)

  // Evidence-weighted Moon cross-reference for Sun and Mars
  if (planet.name === 'Sun' || planet.name === 'Mars') {
    const moon = chart.planets.find(p => p.name === 'Moon')
    if (moon) {
      lines.push('')
      lines.push(formatMoonEvidenceBlock(moon, chart, planet.name))
    }
  }
  lines.push('')

  lines.push(`CORE FUNCTION OF ${planet.name.toUpperCase()}: ${pData ? `${pData.coreFunction} | ${pData.drives}` : ''}`)
  lines.push('')

  lines.push(`SIGN (${planet.sign}): ${sData ? `${sData.element} ${sData.modality} | Ruler: ${sData.ruler} | Core need: ${sData.coreNeed} | Keywords: ${sData.keywords.join(', ')}` : ''}`)
  lines.push('')

  lines.push(`DIGNITY: ${dignity.status} — ${dignity.description}`)
  lines.push('')

  lines.push(`HOUSE H${planet.house}: ${hData ? hData.domain : ''}`)
  lines.push('')

  lines.push('DISPOSITOR / RULERSHIP CHAIN:')
  lines.push(dispositorChain)
  lines.push('')

  if (aspects.length > 0) {
    lines.push('ASPECTS (tightest first):')
    aspects.forEach(a => {
      const other  = a.planet1 === planet.name ? a.planet2 : a.planet1
      const appSep = a.applying ? 'applying' : 'separating'
      const otherP = chart.planets.find(p => p.name === other)
      const hInfo  = otherP ? ` | ${other} H${otherP.house}` : ''
      lines.push(`• ${a.aspectName} ${other} (${a.orb}°, ${appSep}, ${a.quality})${hInfo}`)
    })
    lines.push('')
  }

  if (conflicts.length > 0) {
    lines.push('TENSIONS / CONTRADICTIONS:')
    conflicts.forEach(c => lines.push(`• ${c}`))
    lines.push('')
  }

  // Nakshatra block for sidereal
  if (vedic && planet.nakshatra) {
    const nData = NAKSHATRA_DATA[planet.nakshatra]
    if (nData) {
      lines.push(`NAKSHATRA CONTEXT — ${planet.nakshatra.toUpperCase()} (Pada ${planet.nakshatraPada}):`)
      lines.push(`Ruler: ${nData.ruler} | Deity: ${nData.deity}`)
      lines.push(`Theme: ${nData.theme}`)
      lines.push(`Psychological quality: ${nData.psychologicalQuality}`)
      lines.push('')
    }
  }

  return lines.join('\n')
}

function formatAscendantBlock(chart: ChartData, section: 'tropical' | 'sidereal'): string {
  const vedic     = section === 'sidereal'
  const rulers    = vedic ? SIGN_RULERS_VEDIC : SIGN_RULERS_TRADITIONAL
  const signName  = chart.ascendantSign
  const sData     = SIGN_DATA[signName]
  const rulerName = rulers[signName]
  const rulerPlanet = chart.planets.find(p => p.name === rulerName)
  const firstHousePlanets = chart.planets.filter(p => p.house === 1)

  const lines: string[] = []
  lines.push(`── ${vedic ? 'LAGNA' : 'ASCENDANT'} ──────────────────────────────`)
  lines.push(`${signName} ${chart.ascendantDegree.toFixed(1)}°`)
  lines.push('')

  if (sData) {
    lines.push(`SIGN CHARACTER: ${sData.element} ${sData.modality} | Core need: ${sData.coreNeed}`)
    lines.push(`Keywords: ${sData.keywords.join(', ')}`)
  }
  lines.push('')

  lines.push(`${vedic ? 'LAGNA LORD' : 'CHART RULER'}: ${rulerName}`)
  if (rulerPlanet) {
    const rulerDig   = computeDignity(rulerName, rulerPlanet.sign)
    const rulerHData = HOUSE_DATA[rulerPlanet.house]
    lines.push(`${rulerName} is placed in ${rulerPlanet.sign} H${rulerPlanet.house}${rulerPlanet.retrograde ? ' (R)' : ''} [${rulerDig.status}]`)
    lines.push(`Ruler dignity: ${rulerDig.description}`)
    if (rulerHData) lines.push(`Ruler operates in: ${rulerHData.domain}`)
  }
  lines.push('')

  if (firstHousePlanets.length > 0) {
    lines.push('PLANETS IN THE 1ST HOUSE:')
    firstHousePlanets.forEach(p => {
      const dig   = computeDignity(p.name, p.sign)
      const pData = PLANET_CORE[p.name]
      lines.push(`• ${p.name} in ${p.sign} [${dig.status}]: ${pData?.coreFunction || ''}`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

// House domain groupings for thematic convergence detection
function getHouseDomain(house: number): string {
  const domains: Record<number, string> = {
    1:  'self-identity-body',
    2:  'resources-self-worth',
    3:  'mind-communication',
    4:  'private-foundations-roots',
    5:  'creativity-expression-pleasure',
    6:  'service-health-routine',
    7:  'partnership-the-other',
    8:  'depth-transformation-shared-power',
    9:  'meaning-expansion-beliefs',
    10: 'career-public-reputation',
    11: 'community-collective-future',
    12: 'hidden-self-transcendence'
  }
  return domains[house] || 'other'
}

// Returns true when two house domains are thematically related (same life arena, different house)
function houseDomainsRelated(h1: number, h2: number): boolean {
  if (h1 === h2) return false
  const relatedGroups = [
    [1, 5, 9],      // fire trine: self-expression axis
    [2, 8],         // resources / shared resources axis
    [2, 10],        // value / career-worth axis
    [3, 6],         // mind / daily work axis
    [3, 9],         // mind / belief axis
    [4, 10],        // roots / public axis
    [4, 12],        // private / hidden axis
    [5, 11],        // creative self / collective axis
    [6, 12],        // service / hidden axis
    [7, 1],         // self / other axis
    [8, 10],        // shared power / public authority axis
  ]
  return relatedGroups.some(g => g.includes(h1) && g.includes(h2))
}

function formatSynthesisBlock(chartData: DualChartData): string {
  const lines: string[] = []
  lines.push('CROSS-SYSTEM CONCORDANCE / DIVERGENCE MAP:')
  lines.push('(For each planet: note what each system produces, where they converge or diverge, and what that tension creates in lived experience.)')
  lines.push('')

  const majorPlanets = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']
  majorPlanets.forEach(pName => {
    const trop = chartData.tropical.planets.find(p => p.name === pName)
    const sid  = chartData.sidereal.planets.find(p => p.name === pName)
    if (!trop || !sid) return

    const tropDig    = computeDignity(pName, trop.sign)
    const sidDig     = computeDignity(pName, sid.sign)
    const signShift  = trop.sign  !== sid.sign
    const houseShift = trop.house !== sid.house

    lines.push(`${pName}:`)
    lines.push(`  Tropical: ${trop.sign} H${trop.house} [${tropDig.status}]${trop.retrograde ? ' ℞' : ''}`)
    lines.push(`  Sidereal: ${sid.sign} H${sid.house} [${sidDig.status}]${sid.retrograde ? ' ℞' : ''}`)

    if (!signShift && !houseShift) {
      lines.push(`  ✓ CONCORDANCE: same sign and house — this ${pName} theme is load-bearing and certain across both systems`)
      if (tropDig.status !== 'peregrine') {
        lines.push(`  Dignity consistent: [${tropDig.status}] in both — strengthens the certainty of this placement's character`)
      }
    } else {
      if (!signShift && houseShift) {
        lines.push(`  ~ SAME-SIGN CONCORDANCE: ${trop.sign} in both systems — the essential quality of this ${pName} is fixed across both frameworks; only the life domain shifts (H${trop.house} Tropical → H${sid.house} Sidereal)`)
        if (tropDig.status === sidDig.status && tropDig.status !== 'peregrine') {
          lines.push(`    Dignity consistent: [${tropDig.status}] in both — the strength or challenge of this ${pName} is a cross-system fact, not an artifact of framework`)
        }
      }

      if (signShift) {
        const tropSData = SIGN_DATA[trop.sign]
        const sidSData  = SIGN_DATA[sid.sign]
        lines.push(`  ⚑ SIGN SHIFT: ${trop.sign} (${tropSData?.element} ${tropSData?.modality}) → ${sid.sign} (${sidSData?.element} ${sidSData?.modality})`)
        lines.push(`    Tropical layer: "${tropSData?.coreNeed}" — ${trop.sign} quality produces this as conscious drive or constructed identity`)
        lines.push(`    Sidereal layer: "${sidSData?.coreNeed}" — ${sid.sign} quality operates at the essential / instinctive level`)

        // Element analysis
        const tropElem = tropSData?.element || ''
        const sidElem  = sidSData?.element  || ''
        if (tropElem === sidElem) {
          lines.push(`    Element continuity: both signs share the ${tropElem} element — the ${pName} operates in the same elemental register across both systems, through different sign expression`)
        } else {
          lines.push(`    Element shift: ${tropElem} → ${sidElem} — the fundamental quality of ${pName}'s expression changes: ${tropElem} (${trop.sign}) at the constructed level vs. ${sidElem} (${sid.sign}) at the essential level`)
        }

        // Dignity direction
        const tropStrong = ['DOMICILE', 'EXALTATION', 'DOMICILE + EXALTATION'].includes(tropDig.status)
        const tropWeak   = ['DETRIMENT', 'FALL'].includes(tropDig.status)
        const sidStrong  = ['DOMICILE', 'EXALTATION', 'DOMICILE + EXALTATION'].includes(sidDig.status)
        const sidWeak    = ['DETRIMENT', 'FALL'].includes(sidDig.status)

        if (tropStrong && sidStrong) {
          lines.push(`    Dignity concordance: ${pName} is dignified in both systems — strength of expression is a consistent cross-system fact`)
        } else if (tropWeak && sidWeak) {
          lines.push(`    Challenge concordance: ${pName} is challenged in both systems [${tropDig.status} / ${sidDig.status}] — difficulty with this function is load-bearing across both frameworks`)
        } else if ((tropStrong && sidWeak) || (tropWeak && sidStrong)) {
          const direction = tropStrong
            ? `a strong constructed ${pName} (${tropDig.status}) masking a pressured essential ${pName} (${sidDig.status})`
            : `a challenged constructed ${pName} (${tropDig.status}) beneath which the essential ${pName} is stronger (${sidDig.status})`
          lines.push(`    Dignity reversal: ${direction} — this gap between the two layers is psychologically significant`)
        } else if (tropDig.status !== sidDig.status) {
          lines.push(`    Dignity shifts: [${tropDig.status}] → [${sidDig.status}]`)
        }

        // Dispositor convergence check
        const tropRulerName = SIGN_RULERS_TRADITIONAL[trop.sign]
        const sidRulerName  = SIGN_RULERS_VEDIC[sid.sign]
        if (tropRulerName && sidRulerName && tropRulerName === sidRulerName) {
          const tropRulerP = chartData.tropical.planets.find(p => p.name === tropRulerName)
          if (tropRulerP) {
            const rulerDig = dignityLabel(tropRulerName, tropRulerP.sign)
            lines.push(`    Dispositor convergence: both systems' ${pName} are ultimately ruled by ${tropRulerName} (in ${tropRulerP.sign} H${tropRulerP.house} [${rulerDig}]) — the ruler chain converges on the same planet despite the sign shift`)
          }
        }
      }

      if (houseShift) {
        const tropHData   = HOUSE_DATA[trop.house]
        const sidHData    = HOUSE_DATA[sid.house]
        const tropDomain  = getHouseDomain(trop.house)
        const sidDomain   = getHouseDomain(sid.house)
        const related     = houseDomainsRelated(trop.house, sid.house)

        lines.push(`  ⚑ HOUSE SHIFT: H${trop.house} (${tropHData?.domain}) → H${sid.house} (${sidHData?.domain})`)
        if (related) {
          lines.push(`    Domain relation: H${trop.house} and H${sid.house} are thematically related (${tropDomain} / ${sidDomain}) — ${pName} operates in a similar life arena in both systems through different mechanisms`)
        } else {
          lines.push(`    Domain shift: the life arena where ${pName} operates changes significantly: ${tropDomain} (Tropical) → ${sidDomain} (Sidereal)`)
        }
      }
    }

    // Cusp detection: flag planets within 3° of a sign boundary in either system
    const tropNearEnd   = trop.degree > 27
    const tropNearStart = trop.degree < 3
    const sidNearEnd    = sid.degree  > 27
    const sidNearStart  = sid.degree  < 3
    const tropOnCusp    = tropNearEnd || tropNearStart
    const sidOnCusp     = sidNearEnd  || sidNearStart

    if (tropOnCusp || sidOnCusp) {
      const nextSign = (s: string) => SIGNS_ORDERED[(SIGNS_ORDERED.indexOf(s) + 1) % 12]
      const prevSign = (s: string) => SIGNS_ORDERED[(SIGNS_ORDERED.indexOf(s) + 11) % 12]
      if (tropNearEnd)   lines.push(`  ⊕ CUSP (Tropical): ${fmtDeg(trop.degree)} ${trop.sign} — within 3° of the ${trop.sign}/${nextSign(trop.sign)} boundary`)
      if (tropNearStart) lines.push(`  ⊕ CUSP (Tropical): ${fmtDeg(trop.degree)} ${trop.sign} — within 3° of the ${prevSign(trop.sign)}/${trop.sign} boundary`)
      if (sidNearEnd)    lines.push(`  ⊕ CUSP (Sidereal): ${fmtDeg(sid.degree)} ${sid.sign} — within 3° of the ${sid.sign}/${nextSign(sid.sign)} boundary`)
      if (sidNearStart)  lines.push(`  ⊕ CUSP (Sidereal): ${fmtDeg(sid.degree)} ${sid.sign} — within 3° of the ${prevSign(sid.sign)}/${sid.sign} boundary`)
      if (tropOnCusp && !sidOnCusp) {
        lines.push(`    The Tropical cusp resolves into the body of ${sid.sign} in the Sidereal chart — what reads as boundary ambiguity at the psychological level becomes more settled at the essential level`)
      } else if (!tropOnCusp && sidOnCusp) {
        lines.push(`    The ayanamsa shift places Sidereal ${pName} near a sign boundary despite a non-cusp Tropical position — boundary ambiguity exists at the essential level but not at the psychological`)
      } else {
        lines.push(`    ${pName} is near a sign boundary in both systems — adjacent-sign qualities blend into its expression at both the psychological and essential levels`)
      }
    }

    lines.push('')
  })

  // Ascendant / Lagna comparison with sign character
  const tropAsc = chartData.tropical.ascendantSign
  const sidAsc  = chartData.sidereal.ascendantSign
  const tropAscData = SIGN_DATA[tropAsc]
  const sidAscData  = SIGN_DATA[sidAsc]
  lines.push('ASCENDANT / LAGNA:')
  lines.push(`  Tropical ASC: ${tropAsc} ${fmtDeg(chartData.tropical.ascendantDegree)} — ${tropAscData?.element} ${tropAscData?.modality}, core need: ${tropAscData?.coreNeed}`)
  lines.push(`  Sidereal Lagna: ${sidAsc} ${fmtDeg(chartData.sidereal.ascendantDegree)} — ${sidAscData?.element} ${sidAscData?.modality}, core need: ${sidAscData?.coreNeed}`)
  if (tropAsc !== sidAsc) {
    lines.push(`  ⚑ SHIFT: The constructed persona (${tropAsc}: ${tropAscData?.coreNeed}) differs from the essential soul-body orientation (${sidAsc}: ${sidAscData?.coreNeed})`)
    const sameElem = tropAscData?.element === sidAscData?.element
    if (sameElem) {
      lines.push(`  Element continuity: both Ascendants share the ${tropAscData?.element} element — the orientation of self-presentation is consistent in quality despite different sign expression`)
    } else {
      lines.push(`  Element shift: ${tropAscData?.element} (${tropAsc}) → ${sidAscData?.element} (${sidAsc}) — the fundamental quality of self-presentation differs between the two systems`)
    }
  } else {
    lines.push(`  ✓ CONCORDANCE: same sign in both systems — persona and soul orientation are aligned; this ASC quality is especially load-bearing`)
  }

  // MC comparison
  const tropMC = chartData.tropical.midheavenSign
  const sidMC  = chartData.sidereal.midheavenSign
  lines.push('')
  lines.push(`MC (career/public axis):`)
  lines.push(`  Tropical MC: ${tropMC} ${fmtDeg(chartData.tropical.midheavenDegree)}`)
  lines.push(`  Sidereal MC: ${sidMC} ${fmtDeg(chartData.sidereal.midheavenDegree)}`)
  if (tropMC !== sidMC) {
    lines.push(`  ⚑ MC SHIFT: ${tropMC} → ${sidMC} — the constructed professional orientation differs from the essential karmic direction`)
  } else {
    lines.push(`  ✓ MC CONCORDANCE: same sign in both systems`)
  }
  lines.push('')

  // Dasha and yogas
  const dasha = computeVimshottariDasha(chartData)
  if (dasha) {
    lines.push('ACTIVE VIMSHOTTARI DASHA:')
    lines.push(`  Mahadasha: ${dasha.mahadasha} (until ${dasha.mahaDashaEndDate})`)
    lines.push(`  Antardasha: ${dasha.antardasha} (until ${dasha.antarDashaEndDate})`)
    lines.push(`  Note: the dasha period sets the karmic timing context for the synthesis — use it to illuminate which planets and themes are currently active, not as a predictive verdict.`)
    lines.push('')
  }

  const yogas = detectMajorYogas(chartData.sidereal)
  if (yogas.length > 0) {
    lines.push('MAJOR YOGAS (Sidereal chart):')
    yogas.forEach(y => lines.push(`  • ${y}`))
    lines.push('')
  }

  return lines.join('\n')
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

const SECTION_PLANET_MAP: Record<string, Record<string, string[]>> = {
  tropical: {
    sun:            ['Sun'],
    moon:           ['Moon'],
    ascendant:      [],
    mercury:        ['Mercury'],
    venus:          ['Venus'],
    mars:           ['Mars'],
    jupiter_saturn: ['Jupiter', 'Saturn'],
    key_aspects:    []
  },
  sidereal: {
    lagna:          [],
    sun:            ['Sun'],
    moon:           ['Moon'],
    mercury:        ['Mercury'],
    venus:          ['Venus'],
    mars:           ['Mars'],
    jupiter_saturn: ['Jupiter', 'Saturn'],
    rahu_ketu:      ['Rahu']
  }
}

export function buildInterpretationContext(
  chartData: DualChartData,
  section: 'tropical' | 'sidereal' | 'synthesis',
  planetSection: string
): string {
  const divider = '═'.repeat(60)
  const birthTimeUnknown = chartData.birthData.birthTimeUnknown === true

  // Prepend birth time caveat when applicable
  const birthTimeCaveat = birthTimeUnknown
    ? `⚠ BIRTH TIME UNKNOWN — NOON APPROXIMATION USED\n` +
      `The birth time was not provided. 12:00 noon has been used as a fallback.\n` +
      `The following data is UNRELIABLE and must NOT be stated with confidence:\n` +
      `  • Ascendant / Lagna (could be any sign within ±6 hours of noon)\n` +
      `  • All house placements (follow from an uncertain Ascendant)\n` +
      `  • Midheaven / MC\n` +
      `  • Moon position (Moon moves ~0.5°/hour; position may be off by several degrees)\n` +
      `  • Vimshottari Dasha timing (depends on exact Moon nakshatra position)\n` +
      `Where birth time is unknown, focus interpretation on the planetary sign positions, ` +
      `dignities, and sign-based aspects — which are accurate — rather than house placements ` +
      `or Ascendant-derived conclusions. Open any Ascendant or house section with an explicit ` +
      `acknowledgment that birth time is unknown.\n`
    : ''

  const header  = `\n${divider}\nSTRUCTURED INTERPRETATION CONTEXT\n(First-principles reasoning scaffold — use these facts as the foundation for every interpretive claim)\n${divider}\n${birthTimeCaveat}`

  if (section === 'synthesis') {
    return header + formatSynthesisBlock(chartData)
  }

  const chart  = section === 'sidereal' ? chartData.sidereal : chartData.tropical
  const system = section === 'sidereal' ? 'sidereal' : 'tropical'
  const lines: string[] = [header]

  if (planetSection === 'ascendant' || planetSection === 'lagna') {
    lines.push(formatAscendantBlock(chart, system))

    const tropAsc = chartData.tropical.ascendantSign
    const sidAsc  = chartData.sidereal.ascendantSign
    if (tropAsc !== sidAsc) {
      lines.push('CROSS-CHART NOTE:')
      lines.push(`Tropical ASC: ${tropAsc} | Sidereal Lagna: ${sidAsc} — sign differs between systems`)
    }

    // Dasha and yogas for lagna section (most relevant)
    if (section === 'sidereal') {
      const dasha = computeVimshottariDasha(chartData)
      if (dasha) {
        lines.push('')
        lines.push('ACTIVE VIMSHOTTARI DASHA:')
        lines.push(`Mahadasha: ${dasha.mahadasha} (until ${dasha.mahaDashaEndDate})`)
        lines.push(`Antardasha: ${dasha.antardasha} (until ${dasha.antarDashaEndDate})`)
        lines.push('Note: reference this dasha period where it genuinely illuminates the current life chapter; do not force it into the interpretation.')
      }
      const yogas = detectMajorYogas(chart)
      if (yogas.length > 0) {
        lines.push('')
        lines.push('MAJOR YOGAS DETECTED:')
        yogas.forEach(y => lines.push(`• ${y}`))
      }
    }
    return lines.join('\n')
  }

  if (planetSection === 'key_aspects') {
    const allAspects = computeAspects(chart.planets)
    lines.push('ALL MAJOR ASPECTS (tightest first):')
    lines.push('')
    allAspects.forEach(a => {
      const p1Data = PLANET_CORE[a.planet1]
      const p2Data = PLANET_CORE[a.planet2]
      const appSep = a.applying ? 'applying' : 'separating'
      lines.push(`${a.planet1} ${a.glyph} ${a.planet2} (orb ${a.orb}°, ${appSep}, ${a.quality})`)
      if (p1Data && p2Data) {
        lines.push(`  ${a.planet1}: ${p1Data.coreFunction}`)
        lines.push(`  ${a.planet2}: ${p2Data.coreFunction}`)
        lines.push(`  Dynamic: ${a.nature}`)
      }
      lines.push('')
    })
    return lines.join('\n')
  }

  const targetPlanets = SECTION_PLANET_MAP[section]?.[planetSection] || []

  targetPlanets.forEach(pName => {
    const planet = chart.planets.find(p => p.name === pName)
    if (!planet) return
    lines.push(formatPlanetBlock(planet, chart, system))
    lines.push('')
  })

  // Ketu simplified block
  if (planetSection === 'rahu_ketu') {
    const ketu = chart.planets.find(p => p.name === 'Ketu')
    if (ketu) {
      const ketuSData = SIGN_DATA[ketu.sign]
      lines.push('── KETU (SOUTH NODE) ─────────────────────────────')
      lines.push(`Placement: ${ketu.sign} ${ketu.degree.toFixed(1)}° | House ${ketu.house}`)
      if (ketu.nakshatra) {
        lines.push(`Nakshatra: ${ketu.nakshatra} Pada ${ketu.nakshatraPada}`)
        const nData = NAKSHATRA_DATA[ketu.nakshatra]
        if (nData) {
          lines.push(`Nakshatra ruler: ${nData.ruler} | Deity: ${nData.deity}`)
          lines.push(`Theme: ${nData.theme}`)
          lines.push(`Quality: ${nData.psychologicalQuality}`)
        }
      }
      if (ketuSData) {
        lines.push('')
        lines.push(`KETU IN ${ketu.sign.toUpperCase()}: the qualities of ${ketu.sign} (${ketuSData.keywords.join(', ')}) represent what the soul has mastered and now needs to release attachment to; the soul is moving toward Rahu's sign/house`)
      }
      lines.push('')
    }
  }

  // Jupiter/Saturn direct relationship note
  if (planetSection === 'jupiter_saturn') {
    const jup = chart.planets.find(p => p.name === 'Jupiter')
    const sat = chart.planets.find(p => p.name === 'Saturn')
    if (jup && sat) {
      const jupSatAspects = computeAspects([jup, sat])
      if (jupSatAspects.length > 0) {
        lines.push('JUPITER–SATURN DIRECT RELATIONSHIP:')
        jupSatAspects.forEach(a => {
          const appSep = a.applying ? 'applying' : 'separating'
          lines.push(`${a.aspectName} (orb ${a.orb}°, ${appSep}): ${a.nature}`)
          lines.push(`Jupiter = expansion, faith, abundance | Saturn = contraction, discipline, limitation — these two forces are in direct ${a.aspectName.toLowerCase()} in this chart`)
        })
        lines.push('')
      }
    }
  }

  // Sidereal sections: include dasha and yoga data
  if (section === 'sidereal' && targetPlanets.length > 0) {
    const dasha = computeVimshottariDasha(chartData)
    if (dasha) {
      lines.push('─'.repeat(40))
      lines.push('ACTIVE VIMSHOTTARI DASHA:')
      lines.push(`Mahadasha: ${dasha.mahadasha} (until ${dasha.mahaDashaEndDate})`)
      lines.push(`Antardasha: ${dasha.antardasha} (until ${dasha.antarDashaEndDate})`)
      lines.push('Note: reference this dasha where it genuinely illuminates the current chapter; do not force it.')
      lines.push('')
    }
    const yogas = detectMajorYogas(chart)
    if (yogas.length > 0) {
      lines.push('MAJOR YOGAS DETECTED:')
      yogas.forEach(y => lines.push(`• ${y}`))
      lines.push('')
    }
  }

  // Cross-chart accuracy note for tropical
  if (section === 'tropical' && targetPlanets.length > 0) {
    lines.push('─'.repeat(40))
    lines.push('CROSS-CHART ACCURACY NOTE:')
    targetPlanets.forEach(pName => {
      const tropP = chartData.tropical.planets.find(p => p.name === pName)
      const sidP  = chartData.sidereal.planets.find(p => p.name === pName)
      if (tropP && sidP) {
        const signShift  = tropP.sign  !== sidP.sign
        const houseShift = tropP.house !== sidP.house
        if (signShift || houseShift) {
          lines.push(`${pName}: Tropical ${tropP.sign} H${tropP.house} vs. Sidereal ${sidP.sign} H${sidP.house}${signShift ? ` — sign shifts (${tropP.sign} → ${sidP.sign})` : ''}`)
        } else {
          lines.push(`${pName}: same sign and house in both systems (${tropP.sign} H${tropP.house}) — this placement is certain across both frameworks`)
        }
      }
    })
    lines.push('')
  }

  return lines.join('\n')
}
