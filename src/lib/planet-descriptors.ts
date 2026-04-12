export interface PlanetDescriptor {
  name: string
  keywords: string
  description: string
}

export const TROPICAL_DESCRIPTORS: Record<string, PlanetDescriptor> = {
  Sun: {
    name: 'The Sun',
    keywords: 'identity · ego structure · vitality · outward self',
    description: `The Sun is the centre of gravity in a natal chart. It describes the core identity — not the personality you perform, but the self you are organising everything else around. It represents conscious will, the drive to exist as a specific person in the world, and the way a person seeks to make their mark. The Sun is not who you are in private. It is who you are becoming, actively, over the course of a life. It also describes vitality — not just physical energy but the quality of aliveness, the direction in which a person most naturally expands.`
  },
  Moon: {
    name: 'The Moon',
    keywords: 'emotional life · instinctive responses · inner world · what you need',
    description: `The Moon describes the emotional body — not the feelings you choose to have, but the ones that move through you before you've decided anything. It governs instinct, memory, and the patterns laid down in early life that continue running beneath conscious awareness. The Moon shows what a person needs in order to feel safe, what triggers them before they can think, and how they process experience at the level below language. It is the self at home, at ease, unguarded — and also the self when threatened.`
  },
  Mercury: {
    name: 'Mercury',
    keywords: 'thought patterns · communication · how the mind moves · perception',
    description: `Mercury describes the architecture of the mind — how a person receives information, processes it, and sends it back out into the world. It governs communication in all forms: speech, writing, listening, the internal monologue that never stops. Mercury is not about intelligence in the abstract. It is about cognitive style — the speed, texture, and character of a particular mind. It also describes where thinking and speaking diverge, and the gap between what a person understands and what they can clearly express.`
  },
  Venus: {
    name: 'Venus',
    keywords: 'relational style · what you value · how you love · attraction',
    description: `Venus describes the relational self — how a person approaches intimacy, what they find beautiful, and what they need from connection to feel genuinely satisfied. It governs not just romantic love but the entire domain of value: what a person considers worth having, worth protecting, worth giving. Venus shows how affection is expressed and what form it tends to take. It also reveals where a person's desire nature is vulnerable — what they reach for, and what reaching costs them.`
  },
  Mars: {
    name: 'Mars',
    keywords: 'drive · anger · how you act · will and desire in motion',
    description: `Mars describes how a person moves through the world when something is at stake. It governs physical energy, the impulse to act, competitive drive, and the instinct toward self-preservation. Mars also rules anger — not as an emotion to be managed, but as information about where a person's will has been blocked or violated. The sign and house placement of Mars reveals how a person fights, how they pursue what they want, and what happens in their body and behaviour when they are aroused, frustrated, or fully engaged.`
  },
  Jupiter: {
    name: 'Jupiter',
    keywords: 'expansion · belief · where you reach further · optimism and excess',
    description: `Jupiter describes the domain of expansion — where a person reaches beyond what is immediately in front of them, what they believe in, and where they tend to overextend. It governs philosophy, risk, faith, and the impulse toward more. Jupiter shows where a person's confidence tends to outrun their evidence, where generosity is genuine, and where the hunger for growth can tip into recklessness or inflation. It is not simply the planet of luck — it is the planet of the principle by which a person orients their largest bets on life.`
  },
  Saturn: {
    name: 'Saturn',
    keywords: 'contraction · discipline · where effort is required · fear and mastery',
    description: `Saturn describes where a person meets genuine resistance — not as punishment but as the specific domain where shortcuts fail and mastery takes time. It governs discipline, structure, and the kind of authority that can only be earned. Saturn shows where a person's deepest fears tend to live, and also where their most durable competence can develop if they stay with it long enough. The placement of Saturn often reveals the area of life where a person feels most scrutinised, most inadequate, and ultimately most capable of building something that lasts.`
  },
  Ascendant: {
    name: 'The Ascendant',
    keywords: 'first impression · outward manner · how you meet the world',
    description: `The Ascendant is the sign that was rising on the eastern horizon at the moment of birth. It describes the outward manner — the face a person leads with before others know them, the quality of their physical presence, and the instinctive approach they take to new situations. The Ascendant is not a mask in the sense of being false. It is a genuine layer of the self — the one that formed earliest as a way of navigating the external world. It colours everything, acting as the lens through which the rest of the chart expresses itself outwardly.`
  },
  Uranus: {
    name: 'Uranus',
    keywords: 'disruption · individuality · where you break from pattern',
    description: `Uranus describes the domain of rupture and originality — where a person resists convention, where the impulse toward freedom overrides the pull toward stability, and where unexpected change tends to arrive. Its house placement is personal and specific. Uranus shows where a person's need for autonomy is most acute, where they are most likely to shock others or themselves, and where the drive to do things differently is not a preference but a necessity.`
  },
  Neptune: {
    name: 'Neptune',
    keywords: 'dissolution · imagination · where boundaries blur',
    description: `Neptune describes where the ego's boundaries become permeable — where a person is most susceptible to idealism, confusion, and the dissolving of firm distinctions. Its house placement shows where a person tends to project their longing for something beyond the ordinary. Neptune governs the imagination in its most expansive and most dangerous forms. It shows where a person yearns, where they can be led, and where the truth has a tendency to blur.`
  },
  Pluto: {
    name: 'Pluto',
    keywords: 'transformation · power · what cannot stay buried',
    description: `Pluto describes the domain of depth and compulsion — where a person encounters the parts of themselves and others that resist surface-level treatment. It governs power dynamics, psychological intensity, and the experience of irreversible change. Pluto shows where a person is most likely to experience a complete dismantling and rebuilding of something they thought was permanent. It also shows where personal power — and the abuse of it — tends to concentrate.`
  }
}

export const SIDEREAL_DESCRIPTORS: Record<string, PlanetDescriptor> = {
  Lagna: {
    name: 'The Lagna (Ascendant)',
    keywords: 'foundational lens · essential orientation · the self before conditioning',
    description: `In Jyotish, the Lagna is the most important point in the chart. Unlike the Tropical Ascendant, which describes the outward manner, the Sidereal Lagna describes the essential orientation of the entire life — the lens through which all other planetary energies are filtered. The ruling planet of the Lagna and its placement show the overall direction of a person's vitality, motivation, and experience. The Lagna is the self before the world has shaped it into a persona.`
  },
  Sun: {
    name: 'The Sun',
    keywords: 'soul-level identity · essential self · atma',
    description: `In Vedic astrology, the Sun describes the atma — the essential self beneath the constructed identity. Where the Tropical Sun maps the ego and its formations, the Sidereal Sun maps what was present before the world began shaping responses. It governs the father principle, authority, and the quality of consciousness at its most fundamental level. The Sun's Nakshatra placement adds precise psychological texture that the sign alone cannot provide.`
  },
  Moon: {
    name: 'The Moon',
    keywords: 'manas · deep emotional patterning · instinctive mind · Nakshatra',
    description: `In Jyotish, the Moon is considered the most important planet after the Lagna. It describes manas — the instinctive mind, the emotional processing system that operates before conscious thought. The Moon's Nakshatra placement is one of the most specific and psychologically revealing pieces of data in the entire chart. It shows the precise quality of a person's emotional nature, their instinctive responses, and the deep-running patterns that shape every relationship and internal experience.`
  },
  Mercury: {
    name: 'Mercury',
    keywords: 'intellect · discrimination · instinctive communication',
    description: `In Vedic astrology, Mercury governs the discriminating intellect — the capacity to analyse, distinguish, and articulate. It shows how a person's mind works at its most essential level: how they learn, how they communicate, and how they process the gap between what they perceive and what they can express. Mercury's dignity and Nakshatra placement reveal whether this function operates with clarity and precision, or whether it is under strain.`
  },
  Venus: {
    name: 'Venus',
    keywords: 'pleasure · beauty · relational depth · what the soul desires',
    description: `In Jyotish, Venus governs pleasure, beauty, and the soul's orientation toward what it finds desirable. It shows how a person connects with others at the level beneath strategy — what they instinctively reach for in relationship, what brings genuine satisfaction, and where longing lives. Venus's dignity and Nakshatra describe whether the relational nature is operating with ease or under tension.`
  },
  Mars: {
    name: 'Mars',
    keywords: 'courage · instinctive drive · action before thought',
    description: `In Vedic astrology, Mars governs courage, vitality, and the instinctive will to act. It shows how a person moves before they think — the quality of their raw energy, their capacity for effort, and how they respond when challenged. A well-placed Mars produces decisive, directed action. A strained Mars produces impulsiveness or blocked energy that expresses sideways. The Nakshatra placement adds further precision to how this drive manifests.`
  },
  Jupiter: {
    name: 'Jupiter',
    keywords: 'wisdom · dharma · where grace and expansion operate',
    description: `In Jyotish, Jupiter is the great benefic — the planet of wisdom, dharma, and genuine expansion. It shows where a person's understanding runs deep, where they naturally give and teach, and where grace tends to operate. Jupiter's dignity matters significantly: a strong Jupiter amplifies wisdom and generosity, while a weakened Jupiter suggests the need to consciously cultivate understanding in that domain.`
  },
  Saturn: {
    name: 'Saturn',
    keywords: 'karma · discipline · where effort is unavoidable',
    description: `In Vedic astrology, Saturn is the planet of karma, time, and the discipline that cannot be shortcut. It shows where a person must work harder and longer than they expect, where early difficulty eventually yields mastery, and where the impulse to take shortcuts reliably fails. Saturn's placement reveals the domain of life where a person is most tested, and where the rewards — when they come — tend to be durable and genuine.`
  }
}

export const SYNTHESIS_DESCRIPTORS = {
  agree: {
    title: 'Where the Systems Agree',
    keywords: 'confirmed structural truths · bedrock psychology'
  },
  diverge: {
    title: 'Where the Systems Diverge',
    keywords: 'unresolved tensions · layered contradictions'
  },
  tension: {
    title: 'The Central Tension',
    keywords: 'the defining dynamic'
  },
  closing: {
    title: 'The Closing Observation',
    keywords: 'final precision'
  }
}
