# Media, political communication, perception and advanced government AI — 0.32

**Status:** 0.32 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization. This is **implementation
authorization, not acceptance**. **0.32.7 is the current sub-milestone.**

## 0.32.1 scope — information contract

The information contract (`src/simulation/media/contract.ts`): reality,
government information and public perception are three distinct layers; an item
propagates between them only through an explicit access grant, never
automatically (reality never auto-exposes to public perception). Every item
carries dated provenance, coverage, confidence and uncertainty; an unknown source
or confidence is `unavailable`, never zero. Validated by
`src/simulation/__tests__/mediaContract.test.ts`.

## Non-duplication invariants

1. **Three layers only** — reality / government-information / public-perception
   (no automatic access to hidden state).
2. **`unavailable != 0`** everywhere.

## 0.32.2 scope — media and information channels

The media-channel contract (`src/simulation/media/channels.ts`): a channel relays
existing information to an audience — it never creates information from an
interface. Diffusion is gated by the layer-access grant (0.32.1) and bounded by
the channel's reach; an unknown reach is `unavailable`, never zero. Validated by
`src/simulation/__tests__/mediaChannels.test.ts`.

## 0.32.3 scope — statements and political communication

The statement contract (`src/simulation/media/statements.ts`): a statement is a
dated public communication by a person, party, union or association. A statement
is never a law — it has no policy effect and never mutates canonical state. Its
reach is bounded by credibility and audience interest, availability-typed.
Validated by `src/simulation/__tests__/mediaStatements.test.ts`.

## 0.32.4 scope — disinformation/censorship (BLOCKED_DESIGN)

0.32.4 is **not implemented** in this milestone. It is conditional on a decided
legal framework (roadmap open design gate — authorities, means, guarantees and
reactions without a free social-control bonus); that framework is not yet
decided, so no disinformation/censorship primitives are added.

## 0.32.5 scope — opinion and mobilization

The opinion/mobilization contract (`src/simulation/media/opinion.ts`): opinion
shifts are dated, bounded and causal (they carry the material event/statement
that caused them, never a magic modifier); mobilization capacity is bounded by
real support and networks, availability-typed. Validated by
`src/simulation/__tests__/mediaOpinion.test.ts`.

## 0.32.6 scope — government-objective model

The objective contract (`src/simulation/media/governmentObjective.ts`): an AI
government's objective is modelled from a political issue with a priority and an
ideological basis, never a duplicate of the player's power or of the canonical
government. An unknown priority is `unavailable`, never zero. Validated by
`src/simulation/__tests__/mediaGovernmentAI.test.ts`.

## 0.32.7 scope — political action selection

The action-selection contract (`src/simulation/media/actionSelection.ts`): an AI
government selects an action by deterministic comparison of expected net value
and confidence, ties by id; unavailable choices are excluded, and if nothing is
positive the government chooses not to act (null). No reaction is fixed by "what
the player does". Validated by `src/simulation/__tests__/mediaGovernmentAI.test.ts`.

## Deferred (not implemented)

0.32.8–0.32.10 are deferred until their micro-blocks. 0.32 is accepted only
after its complete independent audit and green CI.
