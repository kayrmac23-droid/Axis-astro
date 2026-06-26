export interface PlanetDescriptor {
  name: string
  keywords: string
  description: string
}

export const TROPICAL_DESCRIPTORS: Record<string, PlanetDescriptor> = {
  Sun: {
    name: 'The Sun',
    keywords: 'organizing principle · conscious identity · vitality · the self in formation',
    description: `The Sun is the organizing principle of conscious identity — the coherent self that everything else in the psyche orbits. Sign describes the mode of that self-organization; house shows the primary arena of expression. A person moves toward their Sun over a lifetime rather than simply being it from birth.`
  },
  Moon: {
    name: 'The Moon',
    keywords: 'instinctive response · emotional need · early patterning · pre-reflective self',
    description: `The Moon maps the emotional body below the threshold of deliberate choice — the instinctive responses, the needs that precede reflection, and the patterns formed in early life that continue operating beneath conscious awareness. Sign characterizes the emotional register; house shows which domain of life carries the most instinctive charge. What the Moon requires to feel intact is not negotiable in the way that other psychological needs are.`
  },
  Mercury: {
    name: 'Mercury',
    keywords: 'cognitive style · communication · perception and expression · how the mind moves',
    description: `Mercury describes cognitive style rather than intelligence in the abstract — the characteristic speed, direction, and texture of a particular mind, and how perception becomes language. Sign determines the mode of thought and communication; house concentrates both into a specific domain. The gap between what Mercury perceives and what it can clearly articulate is often where the most revealing interpretation lives.`
  },
  Venus: {
    name: 'Venus',
    keywords: 'value structure · relational mode · aesthetic sensibility · what you reach for',
    description: `Venus governs the value structure — what a person finds worth having, worth pursuing, and worth giving — and how that structure expresses itself in relationship and aesthetic life. Sign characterizes how affection and attraction move; house shows the domain where that value-orientation is most visible. Venus describes the specific form intimacy must take to register as real rather than approximate.`
  },
  Mars: {
    name: 'Mars',
    keywords: 'drive · assertion · will in motion · anger as information',
    description: `Mars describes the will in action — the quality of drive, the form assertion takes, and the physiological and behavioural response when something is at stake. Sign characterizes the quality of that impulse; house reveals the primary arena. Anger, in Mars's framework, is not a problem to be managed but information about where the will has been blocked or violated.`
  },
  Jupiter: {
    name: 'Jupiter',
    keywords: 'expansion · belief · overreach · the framework that makes life legible',
    description: `Jupiter marks the domain of expansion — where a person reaches beyond the immediately demonstrable toward belief, risk, and the larger framework that makes a life feel coherent. Sign colours the quality of that reach; house shows the arena. The tension between genuine faith and inflation is structurally built into every Jupiter placement, and the reading must hold both possibilities.`
  },
  Saturn: {
    name: 'Saturn',
    keywords: 'earned authority · limitation · where shortcuts fail · fear and mastery',
    description: `Saturn identifies the domain where shortcuts reliably fail and competence requires sustained effort. Its placement shows where authority must be earned through direct contact with limitation — not imposed, not inherited, but built. Fear and mastery tend to concentrate in the same placement, and a complete reading holds both as part of the same developmental process rather than treating one as the destination.`
  },
  Ascendant: {
    name: 'The Ascendant',
    keywords: 'instinctive presentation · outward register · the first exterior of the self',
    description: `The Ascendant describes the first exterior of the self — the sign on the eastern horizon at birth, governing instinctive approach, physical presence, and the register in which a person meets the world before relationship deepens. It is not a persona in the sense of being false: it is the earliest-formed layer of a genuine interior, and the lens through which all other planets express themselves outwardly.`
  },
  Uranus: {
    name: 'Uranus',
    keywords: 'autonomy · rupture · originality · where continuity creates friction',
    description: `Uranus marks where the need for autonomy overrides the pull toward consistency — where the drive to operate outside established patterns is not preference but structural necessity. Its house placement shows the life domain where disruption and originality concentrate, where the unexpected tends to arrive, and where attachment to continuity creates the most resistance.`
  },
  Neptune: {
    name: 'Neptune',
    keywords: 'permeability · dissolution · idealism · where the real and imagined merge',
    description: `Neptune describes where the ego's boundary becomes permeable — where the distinctions between self and world, real and imagined, present and longed-for, are structurally unstable. Its house placement shows the domain most susceptible to idealism, confusion, and the pull toward something beyond the ordinary. The reading must name both the creative and the delusional potential, which are not opposites but the same permeability pointed in different directions.`
  },
  Pluto: {
    name: 'Pluto',
    keywords: 'concentrated power · irreversible change · compulsion · what cannot stay surface-level',
    description: `Pluto governs the domain of concentrated power and irreversible change — where surface-level treatment fails and the underlying psychological structure must be directly encountered. Its house placement shows where compulsion, intensity, and transformation tend to concentrate over a lifetime. A Pluto placement is not inherently destructive; it is inherently unable to remain at surface level indefinitely.`
  },
  Nodes: {
    name: 'The Lunar Nodes',
    keywords: 'developmental axis · what the self reaches into · what it learns to set down',
    description: `The lunar nodes describe the psychological direction of growth in this lifetime — not a karmic verdict, but a structural pull along which the constructed identity stretches and matures. Rahu (North Node) names the unfamiliar territory the self is drawn toward, often awkwardly and with risk of overreach; Ketu (South Node) names the over-developed competence the self leans on by default. The nodal axis is the one psychological coordinate that names a direction inside the chart rather than a static placement.`
  }
}

export const SIDEREAL_DESCRIPTORS: Record<string, PlanetDescriptor> = {
  Lagna: {
    name: 'The Lagna',
    keywords: 'primary axis · essential orientation · the life\'s foundational lens',
    description: `In Jyotish, the Lagna is the chart's primary axis — not outward manner, as the Tropical Ascendant describes, but the essential orientation of the life itself, the lens through which every planet is experienced and expressed. The Lagna lord's placement and dignity determine the overall quality and direction of vitality. Every other planet is interpreted partly through its relationship to the Lagna and its lord.`
  },
  Sun: {
    name: 'The Sun',
    keywords: 'atma · soul-level identity · consciousness before conditioning',
    description: `In Jyotish, the Sun represents the atma — the seat of consciousness beneath the constructed identity. Where the Tropical Sun maps how identity is organized through experience, the Sidereal Sun maps what was structurally present before conditioning began. The Sun's Nakshatra placement adds psychological precision the sign alone cannot provide, specifying the quality and character of the inner light rather than simply its direction.`
  },
  Moon: {
    name: 'The Moon',
    keywords: 'manas · instinctive mind · felt sense of existence · Nakshatra precision',
    description: `In Jyotish, the Moon is the primary indicator of mind and inner life, second only to the Lagna. It governs manas — the instinctive processing layer, the felt sense of existence that precedes deliberate thought. The Moon's Nakshatra is among the most psychologically specific pieces of data in the chart, describing the precise character of a person's emotional nature and the running pattern of their inner experience. Vimshottari dasha periods are keyed to the natal Moon Nakshatra.`
  },
  Mercury: {
    name: 'Mercury',
    keywords: 'discriminating intellect · analysis · how perception becomes expression',
    description: `In Jyotish, Mercury governs the discriminating intellect — the capacity to analyse, distinguish, and articulate. It shows the essential mode of cognition and communication: how perception becomes language, how analysis becomes expression. Dignity and Nakshatra placement together indicate whether this function operates with clarity and precision, or where it characteristically comes under strain.`
  },
  Venus: {
    name: 'Venus',
    keywords: 'pleasure · beauty · the soul\'s orientation toward satisfaction · relational depth',
    description: `In Jyotish, Venus governs pleasure, beauty, and the soul's orientation toward what it finds genuinely satisfying. It describes the relational nature at a level beneath strategy — what is instinctively sought in connection, what registers as beautiful, and where longing concentrates. Dignity and Nakshatra reveal whether this orientation operates with ease and fullness, or under chronic tension.`
  },
  Mars: {
    name: 'Mars',
    keywords: 'courage · instinctive will · directed energy · action before reflection',
    description: `In Jyotish, Mars governs courage, vitality, and the instinctive will before it passes through reflection. A well-dignified Mars produces decisive, directed energy; a strained Mars produces either impulsiveness or chronically blocked drive that seeks expression elsewhere. The Nakshatra placement specifies the precise quality and direction of this assertive force — the character of how it characteristically moves.`
  },
  Jupiter: {
    name: 'Jupiter',
    keywords: 'wisdom · dharma · the teacher-principle · genuine expansion',
    description: `In Jyotish, Jupiter is the teacher-planet — governing wisdom, dharma, and the principle of genuine expansion. A strong Jupiter amplifies insight, generosity, and right orientation; a weakened or ill-placed Jupiter indicates where understanding must be consciously cultivated rather than assumed. Jupiter's relationship to the Lagna lord is among the most significant considerations for reading the overall quality of a life's trajectory.`
  },
  Saturn: {
    name: 'Saturn',
    keywords: 'karma · time · unavoidable effort · where durability is built',
    description: `In Jyotish, Saturn governs karma and time — the domain where effort is unavoidable and outcomes take longer than expected. Its placement shows where sustained difficulty concentrates, and where the eventual reward, when it arrives, is durable rather than easily won. The quality of Saturn's dignity indicates whether the difficulty produces genuine mastery or chronic depletion, and what the path between them characteristically looks like.`
  }
}

export const SYNASTRY_DESCRIPTORS = {
  luminaries: {
    title: 'The Luminaries',
    keywords: 'core relational drivers · identity meets emotional need · recognition and attunement',
    description: `Sun and Moon contacts between two charts are the structural foundation of a relationship — where one person's conscious identity meets the other's emotional nature, and vice versa. These aspects determine whether the two charts orient toward each other naturally, whether genuine recognition is built in, or whether ego and emotional need create friction by design.`
  },
  venus_mars: {
    title: 'Venus and Mars',
    keywords: 'attraction · desire · relational style meets drive',
    description: `Venus and Mars contacts govern the mechanics of attraction, desire, and how each person's relational orientation meets the other's drive. Venus describes what is sought in connection and how affection moves; Mars describes how each person asserts, pursues, and acts when something is at stake. The quality of these contacts determines whether the two energies draw each other in or work at cross-purposes.`
  },
  outer_planets: {
    title: 'Mind, Structure, and the Outer Planets',
    keywords: 'intellectual exchange · expansion and limit · transformative contacts',
    description: `Mercury contacts describe how two people think together — the ease or friction of shared intellectual exchange. Jupiter and Saturn aspects show where one person expands or structures the other's experience. Uranus, Neptune, and Pluto contacts to personal planets describe where outer-planet forces transform, disrupt, or dissolve something fundamental in the receiving chart — often felt more intensely by the planet person than the outer-planet person.`
  },
  composite_chart: {
    title: 'The Composite Chart',
    keywords: 'the relationship as its own entity · what you create together',
    description: `The composite chart is not the sum of two people — it is a third entity with its own character, drives, and challenges. Its Sun, Moon, and Ascendant describe the identity, emotional life, and outward presentation of the relationship itself. The composite reveals what this pairing naturally moves toward, what it tends to produce in the world, and where its central psychological tension lives.`
  },
  integration: {
    title: 'The Central Dynamic',
    keywords: 'the defining feature · what makes this pairing itself',
    description: `The integration names the single most defining feature of this combination — the observation that makes everything else cohere. It may be a dominant inter-aspect, a pattern repeated across multiple contacts, or a tension between the composite chart and the individual charts. The final observation names what this relationship structurally requires each person to carry or confront.`
  },
  navigation: {
    title: 'What Each Chart Requires',
    keywords: 'structural needs · friction made legible · what each chart is actually doing',
    description: `Each chart is built to need specific things from a partner — not preferences, but structural requirements that produce friction when unmet. This section names what each person's chart requires, then works through the specific friction points: what each person's placement is actually producing, and how the other chart receives it. The goal is to make behaviour legible — not to resolve tension, but to name the mechanism precisely enough that it can be recognised rather than misread.`
  }
}

export const SYNTHESIS_DESCRIPTORS = {
  agree: {
    title: 'Where the Systems Agree',
    keywords: 'structural convergence · load-bearing truths',
    description: `Concordance — where both charts point to the same psychological theme — is the most certain, least negotiable part of a person's character. These placements hold regardless of which astrological framework is used. They are the bedrock of the synthesis: the things that cannot be explained away by system differences.`
  },
  diverge: {
    title: 'Where the Systems Diverge',
    keywords: 'layered contradictions · what the gap means',
    description: `Divergence is not error: it is the specific terrain this person must navigate. Where the Tropical layer names one orientation and the Sidereal layer names another, the gap between them describes what it actually feels like to live from inside this chart — the friction between constructed identity and essential nature.`
  },
  tension: {
    title: 'The Central Tension',
    keywords: 'the defining dynamic · what cannot be resolved away',
    description: `The central tension is the single friction that makes this person specifically this person rather than a type. It is not a list of challenges — it is the one thing that runs through everything, visible only when both charts are held together. Neither system shows it fully alone.`
  },
  closing: {
    title: 'Integration',
    keywords: 'final precision · what holds across both systems',
    description: `The integration names the precise causal chain: how the Tropical psychological architecture functions as the specific mechanism through which the Sidereal karmic trajectory is actually lived. The final observation is the sharpest in the reading — something true that has probably been felt but never articulated.`
  }
}
