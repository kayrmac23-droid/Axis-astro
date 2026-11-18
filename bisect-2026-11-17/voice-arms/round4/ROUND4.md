# Round 4 (v10.56-exp, Opus 5.5): the worked example rewritten, Sidereal ordered by the life

Scratch experiment on top of round 3 (v10.55-exp). Nothing here is on `main`. Chicago samples use the same fixed priors as every earlier round (two samples per section, unedited). Kay's full reading and a full Mumbai reading were added to check that the changes hold beyond Chicago.

## Why round 3 still read like homework

Three things in the prompt and the context block were still teaching it.

1. **The worked example (`SCENE_EXEMPLAR`) had not been touched.**
   - It still staged the three-beat scene Kay dislikes ("Hours later the position is still unfinished").
   - It still invented specifics ("at two in the morning", "on Thursday", "the fourth draft").
   - It opened on a dignity recital.
   - Round 3's Sun sections copied its wording verbatim ("holding no dignity of its own").
   - The repo's own record says example outranks rule on this model, so the rules changed in round 3 and the example kept teaching the old habits.
2. **The model was repeating the instructions' own wording.**

   | Phrase in the output | Where it came from |
   |---|---|
   | "A Moon check sharpens this" | the Sun section's "MOON SCOPE: this is an EVIDENCE CHECK" |
   | "the cooperation isn't automatic; it switches on when…" (both samples) | the context block's sextile line "available but not automatic — name the specific situation in this chart that switches it on", and the aspect-type definitions |
   | "That makes the conjunction a merger" | the aspect-type definitions |
   | "This comes live when…" and "a settled, long-running dynamic" | the context block's trigger lines |
   | "Its distortion is mild but real" (both samples) | SHADOW_RULES ("if … genuinely mild, say so plainly") |
   | "unwalked" | the Divergence instruction ("without walking each") |
   | the closing sentence "This person is likely to read X as indecision" (both Divergence samples) | PART 8 ("the thing the person is most likely to misread") |

3. **The structure forced a technique walk.**
   - Tropical primaries had one heading per aspect.
   - Sidereal sections had no heading plan at all, so the model invented technique headings ("Lordship and What It Carries"). On top of that it was told to "work house lordship for every planet", and to name every nakshatra's lord and deity.
   - The Divergence was told to give the Tropical placement, then the Sidereal one, then the collision, and to "name degrees from both systems throughout". That produced degree recitals before every point.

## What changed (all in the scratch branch)

**The worked example**, same chart and placements:
- It opens on the reader's life and uses contractions.
- Claims and their reasons sit in the same sentence, with one image.
- The two close aspects share one sub-header.
- Every situation is a *kind* of situation, with no time jump and no invented clock, weekday or count.
- It passes `scanSectionRules` with zero findings and scores 5 on length (537 words; band 480–700).

**THE VOICE** (in the cached shared rules, and itself written with contractions):
- Contractions where speech uses them, except "you'll".
- A claim carries its reason in the same sentence; a run of short one-step statements "reads like working shown for a marker".
- Never open a paragraph by reciting a placement, degree or orb.
- The checklist vocabulary now also bans *check, shadow, distortion* and the label "the cost". It names the compliance lines to avoid: no remedy, nothing offsets it, a shadow is mild, a tension stays open.

**PART 1:**
- Situations are folded in as habits.
- No little stories with a cast and a time jump.
- An example names a *kind* of situation. The chart doesn't know the reader's job, workplace, family or time of day.

**PART 2, the Tropical instructions and key aspects:** an aspecting planet's house and rulership are the reason inside the sentence, never a preamble before it.

**The appendix:** the aspect-type definitions are deleted, because they were being pasted into the prose.

**PART 8:**
- Headings: the plan is the whole list. Aspects share one sub-header and are grouped by what they do.
- The close opens on the reader's life, in a shape no earlier close used.
- The "most likely to misread" line is dropped from the shared rule (the Moon keeps it as its own closing mode).

**Tropical Sun and Moon:** `### The Sun in [Sign], House [N]` → `### Aspects` (2 sub-headers, from 3–4). Tropical Rahu/Ketu got a heading plan.

**Sidereal:**
- Each section has one sub-header, the placement (two for Jupiter/Saturn and for the nodes).
- New ORDER BY THE LIFE rule: no technique gets a heading or paragraph to itself.
- Lordship is used "wherever it explains" (it used to be "for every planet"). The nakshatra's lord and deity appear only where they explain the instinct.
- The frame shift goes in the first paragraph, as a clause (it no longer has to be the opening words).

**The Divergence:**
- The "case study" voice is dropped; it's the same astrologer, now in third person.
- Degrees only where the point depends on one.
- Each divergence opens on the life, with the two placements as its two reasons. Each gets a plain `### [Body]` heading.
- The STILL UNRESOLVED sentence keeps THE LAW wording, without the example sentence the model copied.
- The boundary note is kept, rewritten so there's nothing to narrate. That rewrite came after a round-4 draft without it wrote that a 29° Pisces Jupiter "holds with less certainty", which DOCTRINE forbids.

**Context copy (`interpretation-engine.ts`):**
- The trigger lines, the sextile line and the sextile/trine definitions no longer carry "comes live", "settled-in", "not automatic", "switches it on" or "requires activation".
- The neecha bhanga line no longer says "leave the debilitation standing", which the model narrated back ("the debilitation stays").

**A tense reminder** is appended last to every section instruction ("you'll" never appears). See *Still wrong* for why.

**Scanner:** `whether` added to the prediction introducers ("testing whether you'll give way" is not a forecast), with a false-positive control and a true-positive pinned in `reading-rule-scan.test.ts`.

## Numbers (free; they don't judge voice)

| | sentence length (words) | contractions per 1k words | sub-headers per section | degree-minute recitals |
|---|---|---|---|---|
| Round 3, Chicago (6 sections) | 19.0 | 0.2 | 3.7 | 17 |
| **Round 4, Chicago (6 sections)** | **22.8** | **16.8** | **2.3** | **3** |
| Sonnet A, Chicago (6 sections) | 32.5 | 2.8 | 1.5 | 0 |
| Round 4, Kay (21 sections) | 22.8 | 17.7 | 1.5 | 1 |
| Round 4, Mumbai (21 sections) | 23.4 | 15.4 | 1.5 | 1 |

Prompt-vocabulary leaks counted across the six Chicago samples, round 3 → round 4:
- "the cost" as a label: 6 → 2
- "switch on": 3 → 0
- "comes live" / "goes quiet": 4 → 1
- "distortion" / "mild": 3 → 0
- "unwalked": 2 → 0
- "misread" / "indecision" closes: 2 → 0

Accuracy guardrails, all 56 round-4 sections:
- 0 hard fact findings.
- 0 `detectBannedPhrasings` hits except one contextual "underneath" ("a self that is fixed underneath and negotiates on the surface"). That one is inside the Tropical frame, so it is not THE LAW, but it's the same false positive production has logged on `tropical/sun` before.
- No Sidereal section has a technique heading.
- Neither Chicago Divergence casts doubt on the 29° Jupiter.

## Still wrong, or new

1. **A cusp reading in Kay's Tropical Sun (DOCTRINE).**
   - The sentence: "The Sun sits at barely a degree into Leo, at the very threshold of the sign… the confidence is newly lit rather than settled." That reads the boundary into the placement.
   - The natal prompts carry no boundary rule on purpose (CLAUDE.md rule 9), so the model fell back on its own cusp lore. I can't tell from one sample whether round 4 made it likelier.
   - **Kay's ruling needed:** allow one FACT DISCIPLINE line ("a placement early or late in its sign is an ordinary placement in that sign"), or leave the prompts silent and accept the risk.
2. **"You'll".** With contractions on, the model writes the habitual "will" of spoken British English ("You'll go to the wall for someone").
   - It appeared in 7 of 42 sections of the two full readings, and the scan reports each as a hard prediction. In production each one costs a paid regeneration.
   - With the tense reminder, the seven re-runs dropped to 1 of 7 (Kay's Mars, still twice).
   - The alternative is to drop contractions, which are a large part of what makes it sound spoken.
3. **Length.**
   - Kay: 4 of 21 sections over the ceiling. Mumbai: 3 of 21. Production v10.52 had 6 of 21.
   - On Chicago both Sun sections ran 5–15% over (Sidereal 605 vs 560; Tropical 1,077–1,101 vs 1,055).
   - Explaining Jyotish terms in plain words costs words.
4. **Paragraphs are longer:** 5–8 sentences, with more soft `long-paragraph` findings. Round 3 had already removed the 3–4 sentence cap. If it reads as walls of text on a phone, a cap of "rarely more than five sentences" is the dial.
5. **Contraction density:** 15–18 per 1,000 words. That is heavier than any Sonnet sample except the one Kay liked best (A s2 Tropical Sun: 14 in one section). It's a dial if it feels too casual.
6. **Compliance lines are fewer but not gone.** Examples: "Nothing elsewhere in the Sun's picture hands that back to you" (from PART 3's "leave one difficulty uncompensated"), and "softens the debilitation without cancelling it".
7. **Scanner false positives that will rise with this register:**
   - descriptive "you have to" ("idleness you have to justify");
   - "a conviction that you'll beat it";
   - "the whole picture" used about information (a doctrine candidate, not a breach).

## Tests

15 fail by design, against 14 on round 3:
- **New:** the exemplar no longer contains "Hours later the position is still unfinished".
- **New:** `SHARED_RULES_LEAN` is no longer under 70% of `SHARED_RULES`, because the appendix shrank. It's an experiment flag that's off in production.
- **Passing again:** the Divergence instruction carries "never weaker, unstable" again.

Every guard that keeps the prompt from demonstrating antithesis, meta-phrasing and banned openers still passes. The exemplar still passes zero findings and length 5.

## Spend this round: $6.36

| item | cost |
|---|---|
| Chicago, intermediate (6 sections) | $1.173 |
| Chicago, final (6 sections) | $1.175 |
| Kay, full reading | $1.725 |
| Mumbai, full reading | $1.643 |
| Tense re-runs (8 sections) | $0.641 |

Running total for the voice work: $13.81.

## Files

- `outputs/R4-*`: the six final Chicago samples (below, unedited).
- `outputs/R4a-*`: the same six from the intermediate prompt, before the sextile, distortion, neecha bhanga and boundary fixes.
- `MUMBAI-FULL.md`: the full Mumbai reading, with re-runs substituted. The first versions are in `mumbai/`.
- Kay's own reading is not in git, following the round-3 precedent; it was sent to her directly.

---


## Tropical Sun, sample 1

#### The Sun

#### The Sun in Scorpio, House 1

When you want something, you rarely go at it head on. You weigh how the other person is likely to take it, smooth the edges, and keep the full force of the wanting out of sight until you're sure of the ground, so your will tends to arrive already negotiated. The reason is the Sun's ruler. Your Sun is peregrine in Scorpio, with no dignity of its own to lean on, so it takes its manner from Mars. Mars is in detriment in Libra and sits in your twelfth house, the part of the chart where things happen out of view. Mars is also your chart ruler, which means this isn't a side detail: the same planet that should hand your identity its edge is pushed into a sign that wants agreement, and into a house that keeps its motion private.

Put that against where the Sun actually sits, in the first house on your Ascendant, and you get the central friction of the chart. Scorpio in the first gives your sense of self a concentrated, searching intensity that lives in your body and your bearing. You don't have a public face that differs much from the private one, and you tend to meet a room by reading it closely, registering who holds the power and what's not being said. Being yourself takes no effort; the intensity is simply how you're built, and you'd find it harder to switch off than to show. What the twelfth-house Mars withholds is the outward follow-through. You can feel exactly what you want and still find yourself agreeing to a version that's slightly less than it, and the anger about that tends to surface later, privately, after the moment to object has passed. Nothing elsewhere in the Sun's picture hands that back to you. Over time it can leave you carrying a list of things you meant and never said.

Because the Sun is in the first house, being looked at registers in your body before it registers as a thought. You tend to feel seen through, and you brace for it, which is part of why you control how much you give away. People often respond to the intensity you can't quite hide, and that can surprise you, since from your side you've been holding most of it back. One belief worth questioning sits right there: you may think of yourself as someone who keeps the peace and doesn't push, when the push is real and simply runs through a ruler that disguises it as consideration.

Your feelings complicate the Sun's drive to commit wholly. The Moon tends to hold on to what you bond with and can also pull back without warning, so a Sun that wants total investment finds itself paired with an emotional life that both refuses to let go and occasionally goes cold, and you can't always tell in advance which one will meet a given moment.

#### Aspects

Pluto sits almost exactly on your Sun, within half a degree, and it also rules Scorpio, your rising sign and the Sun's own sign. That makes your identity and your relationship to power more or less the same thing. Situations where control is at stake, where someone is trying to change you, or where something has to end, don't touch you lightly; they reach the centre of how you know yourself. You tend to meet them by going completely still, watching, and refusing to be moved until you've understood what's happening, which is what makes you hard to manipulate and easy to underestimate. The strain shows when the same refusal hardens into holding a position because surrendering it would feel like a loss of self, even where the position no longer serves you. Because Mars, the other ruler of your Sun's sign, is compromised and hidden, Pluto's weight tends to carry what Mars can't: you assert yourself through endurance and depth of attention more readily than through open demand. The aspect is separating, and the transformations it brings tend to feel like something you've already been through and are still absorbing, with the person who comes out the other side recognisably changed.

The sextile from Neptune in Capricorn in your third house works on a different channel, through the way you talk and the ordinary exchanges of a day. Neptune rules Pisces, which falls in your fifth house of what you make and enjoy, and in the third it softens how your intensity comes across in speech. You can say very serious things in a way people can take in, because you instinctively blur the hardest edge into something closer to suggestion, and in conversations that turn towards meaning, loss or what lies under the surface, you find words that let others follow you down without feeling dragged. That's a working capacity, not ornament: it's how a Scorpio first-house Sun manages to be close to people without frightening them. Under strain it leans the same way Mars does, letting your real point dissolve into atmosphere so that you've been understood in mood and missed in substance.

The two aspects pull in recognisable directions. Pluto makes your identity something you defend to the last; Neptune, through your speech, lets you hand it over gently enough that it doesn't sound like defence. In a conversation about something that matters to you, you can feel both at once: the immovable conviction underneath and the softened phrasing on top.

That combination shapes what tends to happen when someone close to you tries to take a decision out of your hands. You go still, you see the move for what it is, and you're not going to yield on the thing that matters; then the words that come out are measured and reasonable, filtered through a twelfth-house Mars that wants to keep things pleasant and a Neptune that softens the blow. The other person often leaves believing the matter's settled in their favour, and you leave knowing it isn't, so the real outcome gets decided later, through your persistence, rather than in the room. That route often gets you what you need, and it's the reason your will tends to prevail in situations you seem to lose. It also means people around you can misjudge where you stand for a long time, and the moment they discover it, they experience your firmness as sudden when you've held it from the first exchange.

---

## Tropical Sun, sample 2

#### The Sun

You tend to know with complete certainty what you want, and you almost never ask for it outright: the wanting stays fixed, and the route to it bends around whoever else is in the room. Your Sun is peregrine in Scorpio, so it has no standing of its own to push from and draws its force from its ruler. Mars is also your chart ruler, and it sits in Libra in your twelfth house, in detriment. Mars in Libra asserts itself by weighing the other person first, and in the twelfth it does most of that weighing out of sight. The result is a self that is fixed underneath and negotiates on the surface. You can agree, smooth a moment over, even appear to concede, while the position you actually hold doesn't move at all. Under strain the gap between those two layers widens, and you leave a disagreement having said yes while privately keeping your no, which tends to surface later as a cooling the other person can't trace back to anything.

#### The Sun in Scorpio, House 1

Your sense of who you are lives in the first house, so it is also your body and the way you walk into a room, and Scorpio gives it a particular quality there: you lead with attention rather than display. When you meet someone you're reading them, how much they mean what they say and where the weight in the conversation actually sits, and you tend to give out very little until you've decided. This isn't shyness. Scorpio in the first house makes the self a thing you guard, because it's the whole of you, and letting someone see it is a decision you make once and mean.

That same all-or-nothing quality shapes what you commit to. You don't half-want things. A person, a piece of work or a loyalty either has you completely or barely registers, and once it has you, you give it steady, concentrated energy that doesn't run out when the novelty does. The strain shows when the thing you've committed to falters: the investment is total, so withdrawing from it feels like losing a piece of yourself, and you tend to hold on well past the point where the evidence says let go.

You often believe your intensity is invisible, that because you keep your face still and your words measured, nobody knows how much is going on. The first house makes that unlikely. What you feel tends to show in the body and the eyes even when the words are controlled, and you're sometimes caught off guard when someone responds to the force you thought you'd kept back.

Your feelings complicate this further. The Moon doesn't settle cleanly on either holding or releasing, so the Sun's fixed commitment isn't always matched by what you feel from one week to the next, and you can find yourself loyal in will while emotionally somewhere else entirely.

#### Aspects

Pluto sits less than half a degree from your Sun in your first house, and Pluto is the modern ruler of Scorpio, your rising sign, so the planet that governs your whole chart's way of meeting the world is fused with your sense of self. This is the aspect that does the most here. It means you don't experience yourself as fixed; you experience yourself as something that gets broken down and rebuilt. Situations involving power, a person trying to define you, a loss that strips away a role you'd relied on, an attempt at control, tend to reach straight to the centre of your identity, and you meet them by going further in. You'd rather be remade than diminished, so when someone tries to take control of a situation that matters to you, you quietly become the person who can't be controlled: more intense, more watchful, harder to read. The capacity this gives you is real, because you can come through upheaval and rebuild a coherent self from what's left, where a shallower Sun would simply be shaken. What it takes from you is ease. You rarely feel that a conflict is minor, because Pluto makes every challenge to your standing register as a challenge to your existence, and you spend energy defending ground nobody was actually trying to take.

Pluto and Mars together create a particular knot. Pluto pushes for total control of your own life, and Mars in Libra in the twelfth makes the open fight for it feel wrong, almost graceless. So the struggle goes underground: you hold power by staying unreadable and by letting the other person show their hand first, which works well, and costs you the relief of ever simply saying what you want and having it settled.

The sextile from Neptune softens the edges of all this, and it's a real cooperation rather than a footnote. Neptune sits in Capricorn in your third house, the house of everyday conversation and the mind you use to talk to people, and it rules Pisces, your fifth house of creativity and pleasure. Through this link, your intensity can turn into imagination and into words. When a conversation moves from what's practical into what something means, a feeling, an idea, something hard to say plainly, you're often the one who can find the language for it, and the Plutonic depth comes out as perception rather than force. It's also where you put down the guard for a while, in making something or in talk that loses track of time, because Neptune loosens the hold the Sun keeps on itself. The catch is that it loosens precision too: in exactly those moments you can let a vague, flattering version of what someone said stand in for what they meant.

The weight of all this lands in moments when someone pushes you about something that matters. You know at once, fully, what you won't give up, and Pluto makes that certainty total; Mars in the twelfth then routes it into silence, accommodation, a pleasant surface. The other person leaves thinking it went well, while you leave having lost nothing and won nothing either, because the position you held so completely was never actually put on the table where it could be met. The cost is the conversations that would have gone better if you'd said the thing, and the closeness that can't form with someone who never finds out where you really stand. What it makes possible is that you rarely betray yourself under pressure: in a room trying to reshape you, you leave intact, and that's worth more than you tend to credit it.

---

## Sidereal Sun, sample 1

#### The Sun

You keep a door open in every arrangement you enter, and you tend to bend to a situation's demands so that nobody notices you never fully settled into it. That instinct comes from Swati, the lunar mansion your Sun occupies, ruled by Rahu and presided over by Vayu, the wind. It treats movement as the condition of staying well, and it gives your Sun a quiet insistence on room to shift that Libra on its own wouldn't show. In this frame your Sun moves back one sign, from Tropical Scorpio to Sidereal Libra, and it stays in your first house in both.

#### The Sun in Libra, House 1

The Sun is debilitated in Libra, at its weakest. Here that means the steady centre a Sun is meant to supply comes to you only through other people's responses, so you find it hard to know what you want until you've seen how it lands. The first house puts this weakness into your body and your daily bearing. You read the balance of a room before you've placed yourself in it, and you tend to adjust your position to keep the arrangement level. That costs you the plain experience of standing somewhere because you chose to, and it's a cost you carry into each new situation. Swati's flexibility makes the adjusting easy to do, and it leaves you mostly unsure where the adjusting stops and you begin.

One classical condition tempers the debilitation. Mars rules Aries, the sign where the Sun is strongest, and Mars sits in a kendra, an angular position, from your Moon. What this adds is a route for will to come back in. When a feeling has gone on long enough, Mars in Virgo in your twelfth house tends to turn it into private, practical effort, and that effort gives the Sun some of the backbone its sign withholds. It works quietly and slowly, out of sight.

The Sun rules your eleventh house, the house of gains, networks and the circles you belong to, and it carries those matters into your own person. Your standing within a group therefore registers as a fact about your body and your identity, and you feel a circle's warmth or coolness as your own condition. Mercury and Pluto share the sign with your Sun. Mercury is retrograde, so you tend to go back over a self-presentation after the event, and Pluto keeps whatever you are revising heavy and hard to put down. The Sun's own gaze falls on your seventh house, Aries, which holds no planets. The partner you look across at carries no planet of their own there, so you often fill that space with what you expect a partner to want.

This pattern is most active whenever you're among people and you have a position to hold. It tends to settle when you're alone and in motion, with no arrangement to keep level. At those times Swati's need for movement is met and the Sun has nothing to balance.

You've been in Ketu's major period for some years, a chapter that loosens your grip on whatever you have built, and the Mercury sub-period has just begun inside it. Mercury sits beside your Sun, so this new stretch brings your habit of revising yourself into the foreground. You're going back over how you've been presenting yourself, and in particular how you've placed yourself within groups and friendships. Ketu meanwhile makes some of those memberships feel less necessary to keep. What is coming forward now is a review of where you have bent to belong, and the fall means the review is uncomfortable.

---

## Sidereal Sun, sample 2

#### The Sun

You need room to move before you can feel like yourself, and when a situation pins you to one position for too long, your sense of who you are starts to thin out until you've found a way to shift your footing again. That need comes from Swati, the lunar mansion your Sun sits in, which is ruled by Rahu and presided over by Vayu, the wind: its instinct is to bend with pressure and keep moving, so that being unable to adjust feels like a threat to identity itself. In this frame the Sun moves back one sign, from Scorpio to Libra, and stays in your first house, so the same body and the same instinctive approach carry it in both readings.

#### The Sun in Libra, House 1

Libra is the sign where the Sun is debilitated, at its lowest point in the Jyotish scheme, and what this takes from you is a plain sense of authority. Your will tends to wait for a counterpart before it moves: you size up who you're with, find the version of yourself that fits the exchange, and only then act, so asserting something on your own terms, with no one to weigh it against, costs you more effort than it should and often leaves you unsure the position was really yours. Because the first house is the body and the persona, this shows up as the stance you take on arrival, an adjustable self, with Swati's flexibility making the adjustment quick and the debilitation making the original harder to locate afterwards.

The Sun also rules your eleventh house, the house of gains, friendships and the networks you belong to, and it carries that house into the first. Your identity gets built through the people around you and through what you hope to gain alongside them, which is where the steady centre this Sun can give you does its real work: committed to a group or a shared aim, you give your energy to it freely and without needing to be seen doing so. When that circle is weak or absent, the same Sun has less to organise itself around.

One classical condition softens the debilitation. Mars, lord of Aries where the Sun is exalted, sits in Virgo, an angle from your Moon, and that link means an emotional situation that truly matters to you can call up a directness the sign alone withholds. It arrives when feeling forces the issue, and doesn't arrive on demand.

Mercury and Pluto share the sign with your Sun, so your sense of self rarely runs unaccompanied: Mercury, retrograde, keeps reconsidering what you've just said about yourself, and Pluto lends any position you do take a weight that makes retreating from it feel costly. The Sun's own gaze falls on your seventh house, which is empty, so the partner you keep orienting toward is a direction you face without anyone stationed there. This Sun rests when you're alone with nothing to calibrate against, and comes alive in the presence of another person.

The Ketu period you're in loosens your grip on fixed positions generally, and the Mercury sub-period has only just begun inside it. Because Mercury sits beside your Sun, this change puts your own habit of second-guessing directly onto how you define yourself now, so statements about who you are and what you want are open to revision in a way they weren't a couple of months ago. Through to late 2027, this sub-period keeps turning identity into a question you talk through, and the eleventh house the Sun rules is where that talk tends to happen.

---

## The Divergence (diverge), sample 1

#### Where They Part

#### Mars

When something needs pushing back against, this person goes quiet and works on it alone. The two charts disagree about what that private work is for. In the Tropical chart, Mars sits in Libra in the twelfth house, in detriment, and it rules the Scorpio Ascendant. The will that steers the whole chart therefore spends itself on weighing. The complaint is held back until it feels fair, and it's routed through a Venus in Scorpio that is in detriment too, so even the fairness has to pass a test of depth before it's allowed out.

In the Sidereal chart, Mars sits in Virgo in the same twelfth house, peregrine, and its ruler is a retrograde Mercury in Libra in the first. Here the private work is correction. The complaint is drafted, checked and tidied until it can't be faulted. This Mars doesn't rule the Lagna. It rules the second and seventh houses, so what gets settled alone is money and the terms of open partnership.

The close sextile to Saturn sets both versions off whenever a commitment already exists to carry the grievance. Tropically, the commitment lets them finally say a balanced version aloud. Sidereally, it gives them a standard to keep refining against, and the version that finally goes out is the flawless one. A wide opposition from Jupiter leans on both. Both charts agree that the confrontation happens late and alone. Where they part is on what the delay is for: one account says it buys fairness, the other says it buys precision, and the person pays in time either way.

#### Ascendant

Before this person has said a word in a room, their attention has already settled on one of two questions. The Tropical Ascendant at 6° Scorpio, a fixed water sign, asks what is being hidden here, and it scans for the motive under the polite surface. The Sidereal Lagna at 13° Libra, a cardinal air sign, asks whether the room has reached a fair arrangement yet, and it registers anything lopsided as unfinished.

These don't merge into a single instinct. In a tense meeting, the Scorpio account gives them the pull to name the concealed thing. The Libra account, ruled by a Venus in detriment in the second house, gives them the pull to propose terms everyone could accept. Each comes with its own price. The Scorpio threshold makes the meeting heavier, and the Libra threshold leaves them carrying a settlement they're not sure they believe in.

#### Sun

The question of who they are gets answered in two registers. The Tropical Sun in Scorpio in the first house is peregrine and runs at its own pressure, and the conjunction to Pluto, at 0.4°, presses on the self directly. In that frame, a slight from someone close registers as a matter of identity, and they meet it head-on with full intensity.

The Sidereal Sun in Libra in the first house is debilitated, which in Jyotish means placed in the sign where it's weakest. In that frame the same slight lands as a question of standing. Before they claim the hurt as theirs to feel, they check whether it's fair to feel it. Swati, the nakshatra the Sun sits in, means wind, and wind doesn't hold one position. Classically the debilitation is cancelled, because Mars sits in an angle from the Moon, but its effort still shows in daily life.

The close sextile to Neptune opens a softer channel in both frames, and what comes through it differs. In the Scorpio account it's a compassion that eases the urge to control. In the Libra account it's an imaginative grasp of the other person's side, which quickly turns into one more weight on the scale. One account pays for its intensity with heaviness. The other pays for its fairness with delay before the self is allowed to stand upright.

#### Jupiter

Daily work and the body are where growth happens for this person, and the two charts describe the growth differently. The Tropical Jupiter in Aries in the sixth house is peregrine, retrograde, and ruled by the Mars in detriment. In that frame, improving things means starting over: a new regimen, a rebuilt process, launched before the old one has quite failed. The tight trine to Uranus makes the break come easily, so they can tear up a routine on impulse and only later ask whether it needed tearing up.

The Sidereal Jupiter sits at 29° Pisces, the sign's final degree, in its own sign in the sixth house. Here it forms Harsha Yoga, a combination in which a planet ruling a difficult house sits in that same house and trouble there tends to turn to advantage. In this frame, improving things means taking in the whole condition of the body and the workload, then letting competence grow from immersion. The same trine to Uranus brings the shock as information about how things really stand.

The close trine to Saturn, which is applying, ties both versions to the question of worth. Tropically, each new start gets measured against a conviction. Sidereally, each long immersion has to clear a Scorpio test of proof. One account loses momentum to restarting, and the other loses it to staying immersed too long.

Ketu, the Midheaven, Rahu, the Moon, Neptune, Mercury, Pluto, Saturn, Venus and Uranus also read differently in the two charts, and each of those differences remains unresolved.

In practice, the two descriptions run side by side through the same day. This person reads a room for what's hidden and for whether it's balanced. Then they take the resulting complaint somewhere private, and there it becomes either a fair proposal or a faultless draft. Meanwhile their work is either being torn down and rebuilt or quietly absorbed, depending on which account is describing it. When a moment arrives, they can't step outside both charts to see which one is in charge, because both are describing the same act. What this costs them is a kind of certainty about their own motive. They know what they did. Whether they did it out of fairness or out of precision, as a restart or as immersion, stays an open question for them, and both answers keep fitting the facts.

---

## The Divergence (diverge), sample 2

#### Where They Part

#### Mars

When something needs confronting, this person takes it away to be worked on first, and the two charts disagree about what that work is. The Tropical Mars sits in Libra in the twelfth, in detriment, ruled by a Venus also in detriment, and because this Mars rules the Tropical Ascendant, the whole chart's will runs through it. Here the complaint gets weighed: is it fair, what is the other side's case, would saying it tip the balance too far. The Sidereal Mars sits in Virgo in the same twelfth house, peregrine, ruled by a retrograde Mercury in the first, and it rules the second and seventh houses. Here the complaint gets edited until every word can be defended.

The applying sextile to Saturn shows where the two accounts lead to different acts. When the grievance touches a commitment they have already made about what they're worth, Saturn in the second house in both frames, the Tropical account keeps turning it over until it's even-handed enough to offer as a proposal. The Sidereal account keeps correcting it until it's accurate enough to stand as a finding. Both delay, but one produces a compromise and the other produces a case, and which one they hand over decides what the other person has to answer. The wide opposition to Jupiter sharpens neither version much.

#### Ascendant

A new situation opens differently in each chart. The Tropical Ascendant is Scorpio at 6°57', fixed water ruled by that weighing Mars, so the first thing this person does at a threshold is probe: who holds power here, what is being kept back. The Sidereal Lagna is Libra at 13°16', cardinal air, and its lord is Venus in Scorpio in the second house in detriment, joined by Saturn in a Raja Yoga, a combination classical astrology reads as a source of standing. In that frame the first move is to set terms: what is being exchanged, and whether it is level.

From the inside, the same first meeting carries two questions at once, and they're answered by different organs. The Scorpio threshold wants to know what the other person is hiding. The Libra threshold wants to know whether the arrangement is fair. They can leave a room having settled one and not the other. The terms may feel even while the person stays opaque, and nothing in either chart lets one answer stand in for the second.

#### Sun

A careless remark lands on this person's Sun, and it lands twice. The tight conjunction with Pluto holds in both frames. Tropically it fuses in Scorpio in the first house, peregrine, and the remark registers as a breach of trust that reaches all the way down. Sidereally it fuses in Libra in the first, where the Sun is debilitated, and under Swati, the nakshatra of wind bending without breaking, the remark registers as a tilt in the scales, something that has made their own standing uncertain.

So they respond in two registers that don't translate into each other. In the Tropical account they go quiet and hold the injury. In the Sidereal account they start re-measuring where they stand against everyone involved, which is a different labour and costs something different: Scorpio's version takes trust, while the debilitated Libra Sun's version takes the right to call any position simply theirs. The separating sextile to Neptune offers each a way through, in a different shape. In Scorpio it moves toward understanding the other person's motive, and in Libra toward imagining the other person's fairness.

#### Jupiter

When their routine breaks, the trine to Uranus, tight and separating, gives the moment two different shapes. The Tropical Jupiter is in Aries in the sixth, peregrine and retrograde, ruled by the detriment Mars: the break becomes a starting gun, and this person begins the overhaul of habit, body or working method that same week. The Sidereal Jupiter is in Pisces at 29°02', in its own sign, ruling the third and sixth and placed in the sixth, which classical astrology calls Harsha Yoga, where difficulty in that area tends to turn to advantage. There the break gets absorbed. They take in the whole condition of the body and the work before choosing anything to start.

The applying trine to Saturn shows what each version leaves behind. The Aries version can launch a new regime before the old one has been understood. The Pisces version can understand everything and launch late, because nothing in a domicile Jupiter feels the need to begin. Both versions turn up in the same lapsed routine. They don't take turns, and neither one tidies up after the other.

Ketu, the Midheaven, Rahu, the Moon, Neptune, Mercury, Pluto, Saturn, Venus and Uranus also read differently in each frame, and those differences stay where they are.

Most days this person works out a disagreement alone before saying anything, and the two charts hand them two different finished products. One is the balanced proposal of the Libra Mars, the other the corrected case of the Virgo Mars, and neither cancels the other's claim to be what they meant. The Mercury antardasha now running inside the Ketu mahadasha puts that retrograde Mercury, ruler of the Virgo Mars, at the centre of the current chapter. The editing is louder at present, and the weighing hasn't gone quiet. What this takes from them is speed. They keep arriving at a conversation carrying a fair version and an accurate one, and by the time they've chosen which to say, the other person has often moved on.

---
