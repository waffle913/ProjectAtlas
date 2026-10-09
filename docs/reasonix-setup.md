# ProjectAtlas Roadmap Autopilot — Reasonix setup

This file documents the user-side setup that must stay **out of the repository**
(models, providers, budgets, and any secrets). The in-repo contract is
[the Autopilot protocol](autopilot-protocol.md); the roadmap it executes is
[the sub-milestone roadmap](roadmap-submilestones.md).

This guide was validated against the Reasonix build
`v0.0.0-20261004002159-5bfdfb0bd6e2` (2.x). Verify your installed build with
`/version` or `reasonix --version`; do not assume a capability exists just
because another Reasonix version has it.

## Configuration locations

Resolution order (highest first): command-line flags > project
`./reasonix.toml` > global config (`~/.reasonix/config.toml`, or
`%APPDATA%\reasonix\config.toml` on Windows) > built-in defaults.

Provider/model secrets are referenced by `api_key_env` names whose values live in
the global `<Reasonix home>/.env`, never in the repository. The project-level
`reasonix.toml` is **gitignored** because it may carry per-user provider or
plugin entries (for example an MCP URL containing a token). Do not force-commit
it. Keep provider/model configuration global, or in the local `reasonix.toml`,
and never in Git.

## Recommended role/model split

Reasonix maps the three Autopilot roles to config as follows:

- **Executor** — `default_model`;
- **Planner** — `[agent].planner_model` (optional low-frequency planner), or an
  isolated read-only subagent;
- **Reviewer** — `[agent].subagent_models = { review = "<alias>" }` (used by the
  `review` subagent), or a `runAs: subagent` profile invoked by `/atlas-review`.

The example below uses illustrative names. **Replace every alias with one that
actually exists in your install** (check `/model`, `/goal`, your
`config.toml`, or `reasonix doctor capabilities`). Never invent an alias, and
never commit provider credentials.

```toml
# Project-safe snippet — merge into your global config.toml or local
# ./reasonix.toml. Contains NO secrets; secrets stay in <Reasonix home>/.env.
default_model = "<executor-alias>"        # e.g. a competent economical coding model

[agent]
planner_model = "<planner-alias>"         # e.g. a more capable model
subagent_models = { review = "<reviewer-alias>" }   # e.g. a critical model
goal_token_budget = 20000000              # optional ceiling for unattended loops; 0 = off
# max_output_tokens = 65536               # raise only if the model repeatedly hits length limits
```

`goal_token_budget` is the optional ceiling on an unattended Goal. `0` (default)
means no budget. A positive value produces one summary and a resumable
`budget_spend` pause when reached; `/goal resume` grants a fresh slice while
cumulative Goal statistics remain intact. Choose a value that lets a full
milestone finish without silently draining funds.

Do **not** weaken the destructive-Git protections. Keep `[permissions]` deny
entries such as `Bash(git push*)` and `Bash(rm -rf*)` unless you deliberately
configure an explicit, narrow allow-list for the Autopilot's push step.

## Starting the Roadmap Autopilot

1. Make sure `main` is clean and pushed.
2. Start a **Goal** (Goal mode in the composer, or `/goal`).
3. Run the `/atlas-roadmap` command (it supplies the objective text), or paste
   the equivalent objective directly.

The `/atlas-roadmap` command **does not itself activate Goal** — a custom command
is a prompt template that is sent as a turn. Long autonomous runs must be started
in Goal mode so the runtime keeps working through micro-blocks, CI waits, and
repair cycles, and reports its disposition each turn via `update_goal`.

The objective to authorize is:

```text
Execute all currently authorized ProjectAtlas roadmap milestones in canonical
order according to docs/roadmap-submilestones.md and docs/autopilot-protocol.md.
```

The authorization boundary is the end of the currently authorized numbered
roadmap. The unnumbered post-0.25 backlog is not automatically authorized; the
Autopilot must never invent 0.26+.

## Where to look

| Thing | Location |
| --- | --- |
| Execution contract | `docs/autopilot-protocol.md` |
| Roadmap (what to build) | `docs/roadmap-submilestones.md` |
| Autopilot persistent state | `.reasonix/projectatlas-autopilot-state.json` |
| Safe Zone | `last_safe_milestone` / `last_safe_sha` in that state file |
| Goal statistics | `/goal status` (turns, requests, tokens, work time) |
| Billing / wallets | `reasonix doctor billing` (or Settings → billing) |

## Observing budget/quota

Reasonix exposes real usage through Goal statistics and `/goal status`, and
wallet/pricing facts through `reasonix doctor billing`. The Autopilot must act on
observable signals only: it may pause before a new unit when remaining budget is
insufficient, and it enters `CRYO_MODE` (`BLOCKED_BUDGET`) the moment the provider
refuses a request for insufficient credits / exhausted quota / spending limit /
depleted balance. If exact financial telemetry is unavailable, the Autopilot
documents that limit rather than inventing a credit measure.

## Exiting Cryo and resuming

After a human decides and corrects, resume without restarting from scratch
(see protocol §18):

1. read `.reasonix/projectatlas-autopilot-state.json`;
2. re-read the Safe Zone (`last_safe_sha` in `main`);
3. read the blocked branch and its `blocked_head_sha`;
4. apply the decision/correction, push, wait for CI;
5. if green, update the Safe Zone when justified;
6. set `mode` back to `running`, clear `stop_reason`, and resume at the first
   unfinished micro-block.

## Stopping manually

Use `/goal pause` to pause a running Goal, `/goal resume` to continue, or `/goal`
to clear/restart. A paused Goal keeps its todos, checkpoint, and runtime history.
