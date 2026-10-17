# Media, political communication, perception and advanced government AI — 0.32

**Status:** 0.32 is planned in the approved roadmap 0.26–0.34 and is under the
standing multi-milestone implementation authorization. This is **implementation
authorization, not acceptance**. **0.32.2 is the current sub-milestone.**

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

## Deferred (not implemented)

0.32.3–0.32.10 are deferred until their micro-blocks. 0.32 is accepted only
after its complete independent audit and green CI.
