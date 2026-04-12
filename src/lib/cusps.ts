// lib/cusps.ts
// Named astrological cusps with psychological interpretations
// These are the 12 cusp periods where adjacent signs overlap (approx 19th-23rd of each month)

export interface CuspData {
  name: string
  signs: [string, string]
  dates: string
  keywords: string
  description: string
}

export const CUSPS: CuspData[] = [
  {
    name: 'Cusp of Rebirth',
    signs: ['Pisces', 'Aries'],
    dates: 'March 19–24',
    keywords: 'endings and beginnings · sensitivity meets drive · dreamer and doer',
    description: `The Cusp of Rebirth sits at the seam between the last sign of the zodiac and the first — the dissolution of Pisces meeting the raw initiation of Aries. People born here carry both the accumulated emotional wisdom of a completed cycle and the urgent forward momentum of something brand new. The result is someone who can feel the weight of everything that came before while simultaneously pushing toward what comes next. There is often a quality of perpetual beginning — a person who understands endings deeply but keeps starting anyway. The tension between Piscean sensitivity and Arian directness means this person can feel things profoundly and then act on them with startling speed, which can seem impulsive from the outside but feels like clarity from the inside.`
  },
  {
    name: 'Cusp of Power',
    signs: ['Aries', 'Taurus'],
    dates: 'April 19–24',
    keywords: 'drive meets endurance · impulsive and stubborn · action and consolidation',
    description: `The Cusp of Power combines Aries drive with Taurus endurance. Where Aries initiates and Taurus consolidates, this cusp produces someone who can both start things and see them through — a rare combination. The Aries impulse gives urgency and courage; the Taurus influence gives patience and the capacity to build something durable. The difficulty is that these two energies can also conflict: the urge to move quickly runs up against the instinct to be certain before committing. This can produce someone who oscillates between charging forward and digging in, between restless action and immovable stubbornness. At their best, Cusp of Power people combine initiative with follow-through. At their most conflicted, they start many things with great force and then hold on to them past the point of usefulness.`
  },
  {
    name: 'Cusp of Energy',
    signs: ['Taurus', 'Gemini'],
    dates: 'May 19–24',
    keywords: 'stability meets curiosity · grounded and restless · sensual and intellectual',
    description: `The Cusp of Energy brings together Taurus's sensory groundedness and Gemini's intellectual restlessness. This is someone who wants to understand everything and also wants to be comfortable — who can think at speed but also appreciates slowing down enough to actually experience what is in front of them. There is often a productive tension between wanting to settle into something and needing to keep moving toward the next interesting thing. The Taurus influence means there is more follow-through here than a pure Gemini, and more depth. The Gemini influence means there is more mental agility and adaptability than a pure Taurus. The combination produces someone who is both curious and capable — able to engage with complexity without losing sight of practical reality.`
  },
  {
    name: 'Cusp of Magic',
    signs: ['Gemini', 'Cancer'],
    dates: 'June 19–24',
    keywords: 'intellect meets emotion · communication and feeling · articulate and intuitive',
    description: `The Cusp of Magic combines Gemini's gift for communication with Cancer's emotional depth. People born here often have an unusual ability to name what others feel but cannot articulate — they operate at the intersection of thought and feeling, translating between the two. The Gemini side brings wit, speed, and the ability to hold multiple perspectives simultaneously. The Cancer side brings emotional intelligence, deep loyalty, and a quality of knowing that bypasses rational explanation. The difficulty is that these two modes of processing can conflict: Gemini wants to think through feelings, and Cancer wants to feel through thoughts. At their best, this cusp produces someone whose communication is both intelligent and emotionally resonant. At their most conflicted, they can feel pulled between analysis and emotional response, never quite settling into either.`
  },
  {
    name: 'Cusp of Oscillation',
    signs: ['Cancer', 'Leo'],
    dates: 'July 19–25',
    keywords: 'private and public · protection and performance · emotional depth and outward confidence',
    description: `The Cusp of Oscillation is named for the constant movement between Cancer's need for privacy and Leo's need for recognition. This is one of the most internally conflicted cusp positions in the zodiac. Cancer orients toward the interior — emotional safety, intimate connection, the private world behind closed doors. Leo orients toward the exterior — visibility, creative expression, the desire to be seen and acknowledged. People on this cusp carry both orientations simultaneously, which means they can command a room and then need to disappear for days. They want to be known but resent the exposure that being known requires. They are capable of genuine warmth and charisma, and also of retreating entirely without warning. The oscillation is not instability — it is the natural rhythm of a person who needs both states to function. The challenge is that others often experience the swings as inconsistency, and the person themselves can feel like they are never entirely at home in either mode.`
  },
  {
    name: 'Cusp of Exposure',
    signs: ['Leo', 'Virgo'],
    dates: 'August 19–25',
    keywords: 'confidence meets criticism · performance and precision · bold and analytical',
    description: `The Cusp of Exposure brings together Leo's self-expression and Virgo's critical intelligence. This is someone who wants to be seen and also wants to be correct — who performs with confidence but internally runs a continuous quality-check on everything they put into the world. The Leo side drives toward visibility, recognition, and creative output. The Virgo side drives toward precision, improvement, and the uncomfortable awareness of where things fall short. The result is often someone who appears confident while carrying a significant inner critic. They set high standards for themselves and can be genuinely gifted at what they do, but they may hold back or overprepare because the Virgo influence sees the gap between what they've produced and what they know is possible.`
  },
  {
    name: 'Cusp of Beauty',
    signs: ['Virgo', 'Libra'],
    dates: 'September 19–25',
    keywords: 'precision meets harmony · analytical and aesthetic · detail and balance',
    description: `The Cusp of Beauty combines Virgo's eye for detail with Libra's sense of proportion and harmony. People born here often have a refined aesthetic sensibility — they see both the individual elements and how they fit together. Virgo brings the capacity for precise analysis, the ability to identify what is wrong and improve it. Libra brings the drive toward balance, beauty, and relational harmony. The difficulty is that Virgo's critical precision can undercut Libra's instinct for peace — this person sees the flaw in everything, including relationships they want to preserve. At their best, they create things of genuine beauty and intelligence. At their most conflicted, they can spend so much time assessing and adjusting that they never fully commit to anything.`
  },
  {
    name: 'Cusp of Drama and Criticism',
    signs: ['Libra', 'Scorpio'],
    dates: 'October 19–25',
    keywords: 'harmony meets intensity · social and deep · charming and penetrating',
    description: `The Cusp of Drama and Criticism sits between Libra's social grace and Scorpio's psychological intensity. This is someone who can charm a room and also read it with uncomfortable precision. The Libra surface is pleasant, relational, and attuned to social dynamics. Underneath it, the Scorpio influence sees power structures, hidden motives, and what people are not saying. This combination produces someone who is often more perceptive than they appear — who uses social ease as a form of intelligence-gathering. The drama part of this cusp's name comes from the collision between Libra's desire for harmony and Scorpio's need to name what is real, even when it disrupts the peace. At their best, they bring psychological insight into social situations. At their most conflicted, they can create crises in the service of honesty that they then struggle to resolve.`
  },
  {
    name: 'Cusp of Revolution',
    signs: ['Scorpio', 'Sagittarius'],
    dates: 'November 19–25',
    keywords: 'depth meets expansion · intense and philosophical · transformative and free',
    description: `The Cusp of Revolution combines Scorpio's drive for transformation with Sagittarius's drive for expansion. This is one of the most restless cusp positions — someone who cannot leave things as they are and who is always moving toward a larger framework for understanding what they have experienced. Scorpio wants to go deep, to understand the hidden mechanics of things, to transform what is broken. Sagittarius wants to move, to understand, to find the meaning that makes the intensity worthwhile. Together they produce someone who thinks in systems and lives through cycles — who enters situations fully, transforms them (or is transformed by them), and then moves on, taking the understanding with them. The difficulty is that this combination can produce someone who burns through situations, relationships, and phases of life with great speed, leaving others feeling discarded when what has actually happened is that this person has simply completed a cycle and moved to the next.`
  },
  {
    name: 'Cusp of Prophecy',
    signs: ['Sagittarius', 'Capricorn'],
    dates: 'December 19–25',
    keywords: 'vision meets structure · philosophical and pragmatic · expansion and discipline',
    description: `The Cusp of Prophecy brings together Sagittarius's long-range vision and Capricorn's capacity to build toward it. This is someone who can see where things are going and also understands what it actually takes to get there. The Sagittarius influence generates the vision — the sense of a larger direction, a philosophical framework, a destination worth moving toward. The Capricorn influence generates the discipline and structural intelligence to make that vision concrete. The name comes from the combination of foresight and the capacity to make that foresight manifest in reality. The difficulty is that Sagittarius's expansive optimism and Capricorn's cautious realism can clash — this person can oscillate between believing anything is possible and knowing exactly how difficult it will be.`
  },
  {
    name: 'Cusp of Mystery',
    signs: ['Capricorn', 'Aquarius'],
    dates: 'January 19–25',
    keywords: 'tradition meets innovation · structured and unconventional · authority and rebellion',
    description: `The Cusp of Mystery sits between Capricorn's respect for structure and Aquarius's drive to break it. This produces one of the most internally contradictory cusp positions — someone who understands how systems work deeply enough to know exactly how to dismantle them. Capricorn builds, conserves, and respects what has been proven over time. Aquarius questions, innovates, and is drawn to what has not yet been tried. The mystery in this cusp's name refers to the difficulty others have in reading this person — they can appear traditional and then do something entirely unexpected. At their best, they use their understanding of existing structures to create genuinely new ones. At their most conflicted, they feel caught between the pull toward legitimacy and the pull toward originality.`
  },
  {
    name: 'Cusp of Sensitivity',
    signs: ['Aquarius', 'Pisces'],
    dates: 'February 19–25',
    keywords: 'intellect meets intuition · detached and absorptive · systematic and feeling',
    description: `The Cusp of Sensitivity brings together Aquarius's intellectual detachment and Pisces's emotional permeability. This produces someone who can think in systems and also feel everything — who has both the analytical framework to understand human experience and the emotional receptivity to feel it directly. Aquarius provides the capacity to step back, observe, and find the pattern. Pisces provides the empathy, the intuition, and the ability to sense what others are experiencing without it being stated. The difficulty is that these are almost opposite modes of knowing, and this person may struggle to trust both simultaneously — feeling that their emotions undercut their analysis, or that their analysis prevents them from accessing what they actually feel.`
  }
]

export function getCuspForPlanet(sign: string, degree: number): CuspData | null {
  // Check if within 3 degrees of beginning of sign (cusp with previous sign)
  // or within 3 degrees of end of sign (cusp with next sign)
  const SIGNS = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
  ]

  const signIndex = SIGNS.indexOf(sign)
  if (signIndex === -1) return null

  // Within 3 degrees of start = cusp with previous sign
  if (degree <= 3) {
    const prevSign = SIGNS[(signIndex - 1 + 12) % 12]
    return CUSPS.find(c =>
      (c.signs[0] === prevSign && c.signs[1] === sign) ||
      (c.signs[0] === sign && c.signs[1] === prevSign)
    ) || null
  }

  // Within 3 degrees of end = cusp with next sign
  if (degree >= 27) {
    const nextSign = SIGNS[(signIndex + 1) % 12]
    return CUSPS.find(c =>
      (c.signs[0] === sign && c.signs[1] === nextSign) ||
      (c.signs[0] === nextSign && c.signs[1] === sign)
    ) || null
  }

  return null
}
