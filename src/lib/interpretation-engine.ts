// lib/interpretation-engine.ts
// Structured astrological reasoning layer for AXIS
//
// Architecture: this module sits between astro-calc.ts (raw positions) and the
// Claude prompt. It derives first-principles facts — dignity, sign modification,
// house environment, dispositor chain, aspects, contradictions — and formats them
// as a structured context block injected into the AI prompt.
//
// Claude then interprets from this scaffold rather than reconstructing facts from
// scratch, reducing generic astrology clichés and hallucinated dignities/aspects.
//
// To extend: add planets/signs/houses/nakshatras to the knowledge constants below.
// The engine functions are data-driven — adding knowledge propagates automatically.

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
  { name: 'Conjunction', angle: 0,   orb: 8, nature: 'merger — the two planets operate as a single intensified unit; their energies amplify each other, for better or worse; the combined effect is harder to modulate than either alone', quality: 'intensifying' },
  { name: 'Sextile',     angle: 60,  orb: 6, nature: 'latent cooperation — the planets can work in concert when intentional, but the ease requires activation and tends to go unnoticed because it creates no friction', quality: 'cooperative' },
  { name: 'Square',      angle: 90,  orb: 8, nature: 'productive friction — the planets pull in incompatible directions; this conflict returns again and again without clean resolution; the most generative difficult aspect', quality: 'tense' },
  { name: 'Trine',       angle: 120, orb: 8, nature: 'natural flow — the planets work together easily and automatically; the gift may be so effortless it goes unexamined and underdeveloped', quality: 'flowing' },
  { name: 'Opposition',  angle: 180, orb: 8, nature: 'polarization — the person tends to identify with one pole and project the other onto partners or adversaries; what feels external is often an unintegrated internal tension', quality: 'polarizing' }
]

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
    return { status: 'DOMICILE', description: `${planetName} in its own sign — full access to its natural function; no foreign interference; maximum self-expression` }
  }
  if (d.exaltation === signName) {
    return { status: 'EXALTATION', description: `${planetName} in exaltation — honored and elevated; expresses at its highest potential; can tip into over-expression or idealization of the function` }
  }
  if (d.detriment.includes(signName)) {
    return { status: 'DETRIMENT', description: `${planetName} in detriment — in the sign opposite its domicile; the natural function is frustrated, redirected, or expressed in complicated ways; must work against the grain of the sign to assert itself` }
  }
  if (d.fall === signName) {
    return { status: 'FALL', description: `${planetName} in fall — opposite exaltation; at its most challenged; must work hardest for results others achieve more naturally; can produce significant difficulty or, through that effort, uncommon depth and resilience` }
  }
  return { status: 'peregrine', description: 'no special dignity or debility — neutral placement' }
}

interface Aspect {
  planet1: string
  planet2: string
  aspectName: string
  orb: number
  nature: string
  quality: string
}

function computeAspects(planets: PlanetPosition[], filter?: string[]): Aspect[] {
  const aspects: Aspect[] = []
  const candidates = planets.filter(p => p.name !== 'Ketu') // Ketu is tracked via Rahu axis

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const p1 = candidates[i]
      const p2 = candidates[j]

      // If filter provided, at least one planet must be in the filter
      if (filter && filter.length > 0 && !filter.includes(p1.name) && !filter.includes(p2.name)) continue

      const diff = angleDiff(p1.longitude, p2.longitude)
      for (const def of ASPECT_DEFS) {
        const orb = Math.abs(diff - def.angle)
        if (orb <= def.orb) {
          aspects.push({ planet1: p1.name, planet2: p2.name, aspectName: def.name, orb: Math.round(orb * 10) / 10, nature: def.nature, quality: def.quality })
          break
        }
      }
    }
  }

  return aspects.sort((a, b) => a.orb - b.orb) // tightest aspects first
}

function getDispositor(planet: PlanetPosition, allPlanets: PlanetPosition[], vedic = false): string {
  const rulers = vedic ? SIGN_RULERS_VEDIC : SIGN_RULERS_TRADITIONAL
  const rulerName = rulers[planet.sign]
  const rulerPlanet = allPlanets.find(p => p.name === rulerName)
  if (!rulerPlanet) return `${planet.name} in ${planet.sign} → ruler is ${rulerName} (not separately placed in chart)`

  const rulerDignity = computeDignity(rulerName, rulerPlanet.sign)
  return `${planet.name} in ${planet.sign} → ruled by ${rulerName} → ${rulerName} in ${rulerPlanet.sign} H${rulerPlanet.house}${rulerPlanet.retrograde ? ' (R)' : ''} [${rulerDignity.status}] — the sign of ${planet.name} is governed by a planet placed in ${rulerPlanet.sign} H${rulerPlanet.house}; whatever ${rulerName} does modifies what ${planet.name} can deliver`
}

function buildConflicts(planet: PlanetPosition, aspects: Aspect[], allPlanets: PlanetPosition[]): string[] {
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

  // Square aspects — the most conflicted
  aspects
    .filter(a => (a.planet1 === planet.name || a.planet2 === planet.name) && a.aspectName === 'Square')
    .forEach(sq => {
      const other = sq.planet1 === planet.name ? sq.planet2 : sq.planet1
      const otherData = PLANET_CORE[other]
      if (otherData) {
        conflicts.push(`${planet.name} square ${other} (orb ${sq.orb}°): ${planet.name}'s drive (${pData.drives}) in ongoing incompatible tension with ${other}'s function (${otherData.coreFunction}). This conflict recurs without clean resolution — it is generative but perpetually unresolved`)
      }
    })

  // Opposition — projection dynamic
  aspects
    .filter(a => (a.planet1 === planet.name || a.planet2 === planet.name) && a.aspectName === 'Opposition')
    .forEach(opp => {
      const other = opp.planet1 === planet.name ? opp.planet2 : opp.planet1
      const otherData = PLANET_CORE[other]
      if (otherData) {
        conflicts.push(`${planet.name} opposite ${other} (orb ${opp.orb}°): polarization dynamic — person tends to over-identify with ${planet.name}'s function and project ${other}'s (${otherData.coreFunction}) onto partners or external situations; what is experienced as "coming from outside" may be unintegrated inner tension`)
      }
    })

  return conflicts
}

// ── CONTEXT FORMATTERS ────────────────────────────────────────────────────────

function formatPlanetBlock(planet: PlanetPosition, chart: ChartData, system: 'tropical' | 'sidereal'): string {
  const pData = PLANET_CORE[planet.name]
  const sData = SIGN_DATA[planet.sign]
  const hData = HOUSE_DATA[planet.house]
  const vedic = system === 'sidereal'

  const dignity = computeDignity(planet.name, planet.sign)
  const aspects = computeAspects(chart.planets, [planet.name])
  const dispositorChain = getDispositor(planet, chart.planets, vedic)
  const conflicts = buildConflicts(planet, aspects, chart.planets)

  const lines: string[] = []
  lines.push(`── ${planet.name.toUpperCase()} ──────────────────────────────`)
  lines.push(`Placement: ${planet.sign} ${planet.degree.toFixed(1)}° | House ${planet.house}${planet.retrograde ? ' (Retrograde)' : ''}`)
  if (planet.nakshatra) lines.push(`Nakshatra: ${planet.nakshatra} Pada ${planet.nakshatraPada}`)
  lines.push('')

  lines.push(`CORE FUNCTION OF ${planet.name.toUpperCase()}:`)
  if (pData) {
    lines.push(`Function: ${pData.coreFunction}`)
    lines.push(`Drives: ${pData.drives}`)
    lines.push(`Shadow: ${pData.shadow}`)
  }
  lines.push('')

  lines.push(`SIGN MODIFICATION (${planet.sign}):`)
  if (sData) {
    lines.push(`${sData.element} ${sData.modality} | Ruled by ${sData.ruler} | Core need: ${sData.coreNeed}`)
    lines.push(`Effect on ${planet.name}: ${sData.modifies}`)
    lines.push(`Keywords: ${sData.keywords.join(', ')}`)
  }
  lines.push('')

  lines.push(`DIGNITY STATUS: ${dignity.status}`)
  lines.push(dignity.description)
  lines.push('')

  lines.push(`HOUSE ENVIRONMENT (H${planet.house}):`)
  if (hData) {
    lines.push(`Domain: ${hData.domain}`)
    lines.push(`Effect on ${planet.name}: ${hData.modifies}`)
  }
  lines.push('')

  lines.push('DISPOSITOR / RULERSHIP CHAIN:')
  lines.push(dispositorChain)
  lines.push('')

  if (aspects.length > 0) {
    lines.push('ASPECTS (tightest first):')
    aspects.forEach(a => {
      const other = a.planet1 === planet.name ? a.planet2 : a.planet1
      const otherData = PLANET_CORE[other]
      lines.push(`• ${a.aspectName} ${other} (orb ${a.orb}°, ${a.quality})`)
      lines.push(`  ${other}: ${otherData?.coreFunction || 'unknown function'}`)
      lines.push(`  Dynamic: ${a.nature}`)
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

  // First-principles synthesis note
  if (pData && sData && hData) {
    lines.push('FIRST-PRINCIPLES SYNTHESIS NOTE:')
    lines.push(
      `${planet.name} (${pData.coreFunction}) filtered through ${planet.sign} (${sData.coreNeed}, ${dignity.status}) ` +
      `in H${planet.house} (${hData.domain}): ` +
      `the planet's drive is ${dignity.status === 'DOMICILE' || dignity.status === 'EXALTATION' ? 'amplified and well-expressed' : dignity.status === 'DETRIMENT' ? 'frustrated — must find indirect or redirected expression' : dignity.status === 'FALL' ? 'deeply challenged — operates against significant internal resistance' : 'unmodified by dignity, operating according to sign and house character alone'}. ` +
      `The house places this energy in the domain of ${hData.domain}.`
    )
  }

  return lines.join('\n')
}

function formatAscendantBlock(chart: ChartData, section: 'tropical' | 'sidereal'): string {
  const vedic = section === 'sidereal'
  const rulers = vedic ? SIGN_RULERS_VEDIC : SIGN_RULERS_TRADITIONAL
  const signName = chart.ascendantSign
  const sData = SIGN_DATA[signName]
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

  lines.push(`CHART RULER: ${rulerName}`)
  if (rulerPlanet) {
    const rulerDig = computeDignity(rulerName, rulerPlanet.sign)
    const rulerHData = HOUSE_DATA[rulerPlanet.house]
    lines.push(`${rulerName} is placed in ${rulerPlanet.sign} H${rulerPlanet.house}${rulerPlanet.retrograde ? ' (R)' : ''} [${rulerDig.status}]`)
    lines.push(`Ruler dignity: ${rulerDig.description}`)
    if (rulerHData) lines.push(`Ruler operates in: ${rulerHData.domain}`)
  }
  lines.push('')

  if (firstHousePlanets.length > 0) {
    lines.push('PLANETS IN THE 1ST HOUSE:')
    firstHousePlanets.forEach(p => {
      const dig = computeDignity(p.name, p.sign)
      const pData = PLANET_CORE[p.name]
      lines.push(`• ${p.name} in ${p.sign} [${dig.status}]: ${pData?.coreFunction || ''}`)
    })
    lines.push('')
  }

  return lines.join('\n')
}

function formatSynthesisBlock(chartData: DualChartData): string {
  const lines: string[] = []
  lines.push('CROSS-SYSTEM CONCORDANCE / DIVERGENCE MAP:')
  lines.push('')

  const majorPlanets = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']
  majorPlanets.forEach(pName => {
    const trop = chartData.tropical.planets.find(p => p.name === pName)
    const sid = chartData.sidereal.planets.find(p => p.name === pName)
    if (!trop || !sid) return

    const tropDig = computeDignity(pName, trop.sign)
    const sidDig = computeDignity(pName, sid.sign)
    const signShift = trop.sign !== sid.sign
    const houseShift = trop.house !== sid.house

    lines.push(`${pName}:`)
    lines.push(`  Tropical: ${trop.sign} H${trop.house} [${tropDig.status}]`)
    lines.push(`  Sidereal: ${sid.sign} H${sid.house} [${sidDig.status}]`)

    if (!signShift && !houseShift) {
      lines.push(`  ✓ CONCORDANCE: same sign and house in both systems — this theme is load-bearing and certain`)
    } else {
      if (signShift) {
        const tropSData = SIGN_DATA[trop.sign]
        const sidSData = SIGN_DATA[sid.sign]
        lines.push(`  ⚑ SIGN SHIFT: ${trop.sign} (${tropSData?.element} ${tropSData?.modality}) → ${sid.sign} (${sidSData?.element} ${sidSData?.modality})`)
        lines.push(`    Tropical layer: ${trop.sign} energy — ${tropSData?.coreNeed}`)
        lines.push(`    Sidereal layer: ${sid.sign} energy — ${sidSData?.coreNeed}`)
        if (tropDig.status !== sidDig.status) {
          lines.push(`    Dignity shifts: ${tropDig.status} → ${sidDig.status}`)
        }
      }
      if (houseShift) {
        const tropHData = HOUSE_DATA[trop.house]
        const sidHData = HOUSE_DATA[sid.house]
        lines.push(`  ⚑ HOUSE SHIFT: H${trop.house} (${tropHData?.domain}) → H${sid.house} (${sidHData?.domain})`)
      }
    }
    lines.push('')
  })

  // Ascendant comparison
  const tropAsc = chartData.tropical.ascendantSign
  const sidAsc = chartData.sidereal.ascendantSign
  lines.push(`ASCENDANT / LAGNA:`)
  lines.push(`  Tropical ASC: ${tropAsc}`)
  lines.push(`  Sidereal Lagna: ${sidAsc}`)
  if (tropAsc !== sidAsc) {
    const tropS = SIGN_DATA[tropAsc]
    const sidS = SIGN_DATA[sidAsc]
    lines.push(`  ⚑ SHIFT: ${tropAsc} (${tropS?.coreNeed}) → ${sidAsc} (${sidS?.coreNeed})`)
    lines.push(`  The constructed persona differs from the essential soul-body orientation`)
  } else {
    lines.push(`  ✓ CONCORDANCE: same sign in both systems — the persona and soul orientation align fully`)
  }

  return lines.join('\n')
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

// Planets relevant for each section
const SECTION_PLANET_MAP: Record<string, Record<string, string[]>> = {
  tropical: {
    sun:            ['Sun'],
    moon:           ['Moon'],
    ascendant:      [],           // handled separately via formatAscendantBlock
    mercury:        ['Mercury'],
    venus:          ['Venus'],
    mars:           ['Mars'],
    jupiter_saturn: ['Jupiter', 'Saturn'],
    key_aspects:    []            // handled separately
  },
  sidereal: {
    lagna:          [],           // handled via formatAscendantBlock
    sun:            ['Sun'],
    moon:           ['Moon'],
    mercury:        ['Mercury'],
    venus:          ['Venus'],
    mars:           ['Mars'],
    jupiter_saturn: ['Jupiter', 'Saturn'],
    rahu_ketu:      ['Rahu']          // Ketu handled separately below (simpler block)
  }
}

export function buildInterpretationContext(
  chartData: DualChartData,
  section: 'tropical' | 'sidereal' | 'synthesis',
  planetSection: string
): string {
  const divider = '═'.repeat(60)
  const header = `\n${divider}\nSTRUCTURED INTERPRETATION CONTEXT\n(First-principles reasoning layer — use these facts as the foundation for interpretation)\n${divider}\n`

  if (section === 'synthesis') {
    return header + formatSynthesisBlock(chartData)
  }

  const chart = section === 'sidereal' ? chartData.sidereal : chartData.tropical
  const system = section === 'sidereal' ? 'sidereal' : 'tropical'
  const lines: string[] = [header]

  if (planetSection === 'ascendant' || planetSection === 'lagna') {
    lines.push(formatAscendantBlock(chart, system))

    // Cross-chart note for ascendant
    const tropAsc = chartData.tropical.ascendantSign
    const sidAsc = chartData.sidereal.ascendantSign
    if (tropAsc !== sidAsc) {
      lines.push('CROSS-CHART NOTE:')
      lines.push(`Tropical ASC: ${tropAsc} | Sidereal Lagna: ${sidAsc} — sign differs between systems`)
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
      lines.push(`${a.planet1} ${a.aspectName} ${a.planet2} (orb ${a.orb}°, ${a.quality})`)
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

  // Ketu gets a simplified block (no aspects computed — all aspects are via Rahu's axis)
  if (planetSection === 'rahu_ketu') {
    const ketu = chart.planets.find(p => p.name === 'Ketu')
    if (ketu) {
      const ketuSData = SIGN_DATA[ketu.sign]
      lines.push(`── KETU (SOUTH NODE) ─────────────────────────────`)
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
        lines.push(`KETU IN ${ketu.sign.toUpperCase()}: the qualities of ${ketu.sign} (${ketuSData.keywords.join(', ')}) represent what the soul has mastered and now needs to release attachment to; the soul is moving away from over-dependence on these qualities toward Rahu's sign/house`)
      }
      lines.push('')
    }
  }

  // For Jupiter/Saturn: note if they aspect each other
  if (planetSection === 'jupiter_saturn') {
    const jup = chart.planets.find(p => p.name === 'Jupiter')
    const sat = chart.planets.find(p => p.name === 'Saturn')
    if (jup && sat) {
      const jupSatAspects = computeAspects([jup, sat])
      if (jupSatAspects.length > 0) {
        lines.push('JUPITER–SATURN DIRECT RELATIONSHIP:')
        jupSatAspects.forEach(a => {
          lines.push(`${a.aspectName} (orb ${a.orb}°): ${a.nature}`)
          lines.push(`Jupiter = expansion, faith, abundance | Saturn = contraction, discipline, limitation — these two forces operate in direct ${a.aspectName.toLowerCase()} with each other in this chart`)
        })
        lines.push('')
      }
    }
  }

  // Cross-chart accuracy note for tropical sections
  if (section === 'tropical' && targetPlanets.length > 0) {
    lines.push('─'.repeat(40))
    lines.push('CROSS-CHART ACCURACY NOTE:')
    targetPlanets.forEach(pName => {
      const tropP = chartData.tropical.planets.find(p => p.name === pName)
      const sidP = chartData.sidereal.planets.find(p => p.name === pName)
      if (tropP && sidP) {
        const signShift = tropP.sign !== sidP.sign
        const houseShift = tropP.house !== sidP.house
        if (signShift || houseShift) {
          lines.push(`${pName}: Tropical ${tropP.sign} H${tropP.house} vs. Sidereal ${sidP.sign} H${sidP.house}${signShift ? ` — sign shifts between systems (${tropP.sign} → ${sidP.sign})` : ''}`)
        } else {
          lines.push(`${pName}: same sign and house in both systems (${tropP.sign} H${tropP.house}) — this placement is certain across both frameworks`)
        }
      }
    })
    lines.push('')
  }

  return lines.join('\n')
}
