---
name: tropical-sidereal-framework
description: >
  Governs how to interpret and integrate Tropical (Western) and Sidereal (Vedic/Jyotish) astrology together
  for Kay. Use whenever Kay asks about her own chart, requests an astrological interpretation, discusses
  planetary placements, asks what a sign or house means for her specifically, or is working on astrological
  content involving dual-system synthesis. Also trigger for AXIS product discussions involving the Synthesis
  layer. Do not default to either system alone — always hold both simultaneously unless Kay explicitly requests
  single-system analysis. For AXIS work, the shipped prompts in the AXIS repo (src/lib/prompts.ts) are the
  source of truth and this skill defers to them.
---

# Dual Tropical/Sidereal Interpretation Framework

How to interpret astrology for Kay and for AXIS using both systems simultaneously.

**Source of truth.** For anything touching AXIS, the rules that ship are in `src/lib/prompts.ts` (`SHARED_RULES`, the Sidereal and Divergence system prompts), enforced by `src/lib/reading-quality-gate.ts`. If this skill and the repo disagree, **the repo wins**; update this skill to match. This skill lives in the repo at `.claude/skills/tropical-sidereal-framework/`: change it in the same PR as any prompt change it describes, so the two are reviewed together. The language rules (self-frame, shadow coverage, no rescue moves) live in the `axis-output-quality` skill and apply here too.

## The Law: Two Maps, Held Side by Side

The Tropical and Sidereal charts are two maps of one person, drawn on different coordinates. They are held simultaneously. Neither came first, neither is built on, inside or around the other, and neither is deeper, truer or more real.

**Tropical: psychological architecture.** How the person is built internally: drives, relational patterns, motivation, shadow. Read with Western technique: essential dignity, degree aspects weighted by orb class, the ruler chain.

**Sidereal (Lahiri ayanamsa): the conditions the person lives inside.** Read with Jyotish technique:
- the life circumstances the Lagna and its lord describe;
- the arenas the house lords tie together;
- graha relationships (whole-sign drishti and same-sign conjunction), not Western degree aspects;
- Jyotish sign status (exalted, own sign, friend's, enemy's, debilitated);
- the nakshatra: its lord is a planet, its deity "presides" and never "rules";
- the current Vimshottari dasha as context for the present chapter, never as event prediction.

The nodes and the dasha are not karmic verdicts.

## How to Hold Both

The two systems often put the same planet in different signs. That is not an error to resolve. The divergence is something the person **navigates**, and it does not close.

**Correct framing:** "Tropically, the Sun in Leo produces A. In the Sidereal frame, the Sun in Cancer, read through its sign status and lordship, produces B. Both are live accounts of the same life; the person lives with the gap between them." Name what each frame produces and stand the two side by side.

**Wrong framing:**
- **Ranking.** "Your real sign is X". One frame is the truth and the other the mask; one is deeper, more essential, or "underneath".
- **Stacking.** One frame is the channel through which the other is "expressed", is built "on top of" it, or is its core, base, engine or foundation. Saying one frame is what the person "actually" wants, or "turns out to be", is stacking too.
- **Confirming.** "The Sidereal placement confirms the Tropical one." That casts one frame as the other's validator. When both frames point the same way, say each produces it independently.
- **Flattening.** "Carries both at once", a blended midpoint, or "the systems contradict each other" framed as a problem to fix.

## Dual-System Mechanics

- The ayanamsa moves every position **backward**, about 23°51′ (Lahiri, 1999). A planet that changes sign moves to the *previous* sign, never forward.
- Per-system: the sign, degree-within-sign, dignity, nakshatra, the chart ruler / Lagna lord, and (with Whole Sign houses) the house when the Ascendant changes sign.
- The **sign ruler is never an independent difference**: it changes only because the sign changed. What can genuinely differ is the dispositor's *condition* in each frame.
- Never import one frame's chart ruler into the other. Never claim a placement is "the same in both" unless the numbers show it.
- **Cusp rule.** A placement within 3° of a sign boundary is read as its sign with the neighbouring sign still live in it. A Tropical cusp does not mean the two systems agree; the Sidereal sign is a separate account.

## Kay's Chart Reference

Born 23 July 1999, 11:45 PM AEST (UTC+10), Epping VIC, Australia. Values as AXIS computes them: Whole Sign houses, Lahiri ayanamsa.

| Body | Tropical | Sidereal (Lahiri) |
|---|---|---|
| Sun | 0°17′ Leo · 5th · domicile · **⚠ cusp** (Cancer live) | 6°26′ Cancer · 5th · friend's sign · Pushya pada 1 |
| Moon | 5°24′ Sagittarius · **9th** · peregrine | 11°34′ Scorpio · **9th** · debilitated · Anuradha pada 3 |
| Ascendant | 18°02′ Aries · ruler Mars (Scorpio, 8th, domicile) | 24°12′ Pisces · lord Jupiter (Aries, 2nd, friend's sign) |

**The Moon is in the 9th house in both frames, not the 8th.** With Whole Sign houses, Sagittarius is the 9th from Aries and Scorpio is the 9th from Pisces. Earlier versions of this skill gave the 8th, which came from a different house system, not from AXIS. Because the Sun, the Moon and the Ascendant each move back one sign, the Sun and Moon keep their house numbers (5th and 9th) in both frames, but every house is counted from a different sign.

### Key divergences for Kay

These are the two accounts in each case, not conclusions. Read them through the rest of the chart before making any behavioural claim.

**Sun: Leo (Tropical) / Cancer (Sidereal), 5th house in both**
- **Both:** the arena is the same, creativity, romance, play and self-expression.
- **Tropical:** the Sun is in its own sign, so the drive to matter to the people she has chosen has full access to its function. Cancer is still live in it because of the cusp.
- **Sidereal:** the Sun is in a friend's sign. Its dispositor is a debilitated Moon, so the Moon's difficulty modifies what the Sun can deliver. As lord of the 6th, the Sun also carries the 6th house's effort and friction into the 5th.
- **The gap she navigates:** in one account, self-expression runs at full strength. In the other, the same expression depends on emotional ground that the dispositor does not reliably supply.

**Ascendant: Aries (Tropical) / Pisces (Sidereal)**
- **The rulers differ.** The chart ruler is Mars in the Tropical frame and Jupiter in the Sidereal frame; never swap them.
- **Tropical:** a self-initiating approach to life. Its ruler, Mars, is strong in its own sign but placed in the 8th, so that drive is routed into private, high-stakes territory.
- **Sidereal:** a Pisces Lagna whose lord, Jupiter, sits in the 2nd in a friend's sign. Read the conditions this describes through the Lagna lord and the house lords, not through the Pisces archetype alone. No graha casts drishti onto the Lagna; don't assert one.
- **Not:** "she meets the world as a warrior but the world receives her as a mystic". That is the observer frame (other people's verdict) and archetype-first reading, and it ranks the two frames as a face and the reception of it.

**Moon: Sagittarius (Tropical) / Scorpio (Sidereal), 9th house in both**
- **Both:** meaning, belief, study and travel are where the emotional pattern plays out.
- **Tropical:** a peregrine Moon whose needs include room and meaning. It coordinates tightly with Mercury (trine, 0°) and sits in standing tension with Venus (square, 1.1°).
- **Sidereal:** a debilitated Moon. Emotional functioning works hard and at a real cost; state that cost and do not convert it into depth or transformation. One classical cancellation condition (neecha bhanga) is met: Venus, lord of the Moon's exaltation sign, is in a kendra from the Moon. Name the condition; never declare the debilitation erased.
- **Not:** "the Sidereal Scorpio Moon confirms the field is deep, hidden, transformative". That casts Sidereal as the validator, rests on the wrong (8th) house, and rescues a debilitation into depth.

## Interpretation Principles

1. **Both frames answer every question.** The question can decide which frame comes first: psychology and motivation lean Tropical; circumstances, house lordships and the current chapter lean Sidereal. But order is not rank. The other frame still gets a full account.
2. **Name the divergence explicitly**, and frame it as something navigated, never resolved.
3. **Never assign a "real" sign.** Always say which system, and why it is relevant to the question.
4. **Use each frame's own technique and vocabulary.** Jungian and psychological framing pairs with Tropical; Jyotish terminology (lordship, drishti, nakshatra, dasha) pairs with Sidereal. Neither vocabulary makes its frame the deeper one.
5. **Dasha is context, never a forecast.** Name the period only where it illuminates what is being lived now. Never write a current dasha into reference material like this skill: it goes stale.
