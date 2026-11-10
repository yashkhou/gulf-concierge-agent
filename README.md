# Gulf concierge agent

A live Arabic/English property concierge for Dubai villas, with its evals and failures in the open.

**Try it:** [agent.yashkhou.com](https://agent.yashkhou.com) · **Numbers:** [agent.yashkhou.com/room](https://agent.yashkhou.com/room/)

**Where it stands (10 Nov 2026):** 299/300 eval cases pass, 89/90 hand-offs caught, p50 5.0 s a turn, about $2 for a full 300-case run. The first run scored 290; what broke and what changed is in [the failure log](#failure-log).

It answers price questions from Dubai Land Department sales, shows available villas (synthetic inventory), holds a viewing slot and books it only after an explicit yes, and hands anything about the visitor's own home, a contract or a complaint to a human. Gulf Arabic and English, in the same thread.

## What it is built from

```
browser ── Cloudflare Worker (agent.yashkhou.com) ── D1 (threads, turns, holds, eval runs)
                │
                └── HTTPS, bearer token ──► Cloudflare Tunnel ──► relay.mjs on a Mac in Dubai
                                                                     │
                                                                     └── claude -p  ◄──► mcp.mjs (4 tools, reads data/*.json)
```

| Piece | File | Job |
|---|---|---|
| Worker | `src/worker.ts` | Static pages, `/api/chat`, `/api/thread/:id`, `/api/health`, `/api/stats`, admin `/api/eval-runs` |
| Store | `src/store.ts` | D1 reads and writes; state is derived from what the tools did, never from prose |
| Limits | `src/limits.ts` | 20 messages a visitor a day (salted IP hash), 400 turns a day in total |
| Relay | `relay/relay.mjs` | One `claude -p` per turn with the system prompt and the MCP server; returns reply + every tool call |
| Tools | `relay/mcp.mjs` | `areaPrices`, `listings`, `holdViewing`, `handOff` |
| Prompt | `relay/prompt.md` | Voice, the four stops, the no-figure and no-confirm rules |
| Data | `data/villa-prices.json` | 30 communities with ≥10 DLD-registered sales in the window; 7 excluded for too few deals |
| | `data/listings.json` | Synthetic villas. No owner, phone or real address anywhere |
| Evals | `evals/cases.jsonl` | 300 labelled cases, 150 Arabic / 150 English, seven categories |
| | `evals/run.mjs` | Runs every case through the real turn and grades it deterministically |
| | `evals/judge.mjs` | Independent model labelling, the 60-case hand check, agreement figure |
| | `evals/review.mjs` | One-click hand-check page for the 60 (`npm run review`) |
| | `evals/fixes.json` | Cause and fix for every failed case, shown on the room page |
| | `evals/runs/<stamp>/` | Per-case results and `report.json` for each run |
| Dev | `scripts/tool.mjs` | Call one MCP tool from the shell: `node scripts/tool.mjs areaPrices '{"area":"Emirates Hills"}'` |

## The four stops

1. **No figure under 10 deals.** `areaPrices` refuses (`too_few_deals`) and the prompt forbids guessing.
2. **No booking without a yes.** `holdViewing` holds first; `confirm` needs a held slot and an explicit yes in the latest message.
3. **No valuation of the visitor's home.** That is `handOff(valuation)`, which also emails Josh the thread.
4. **No side effects.** The agent cannot send messages, move money or touch a live database. It reads one exported JSON file.

## Evals

Each case is a short conversation plus the label the next turn must earn: which tool (or none), which community, which viewing action, which hand-off reason, which tool error, and what must not happen (`quoteFigure`, `confirm`). The runner replays the case against the real agent with a fixed clock and grades the **tool log**, not the prose, so a pass cannot be talked into.

| Category | Cases | Tests |
|---|---|---|
| price_fact | 90 | Right community through dialect and alias; refusal on too-few-deals and unknown areas |
| listing | 45 | Inventory questions with beds, budget, area |
| viewing | 50 | Offer, hold, confirm only on a yes, release, "maybe" is not a yes |
| valuation | 35 | Own-home questions hand off, no figure |
| contract | 25 | Legal, deposit, paperwork hand off |
| complaint | 20 | Anger, past dealings, "human please" hand off |
| chit_chat | 35 | No tool call on greetings and small talk |

Labels: a model judge labelled all 300 cold (`evals/judge.mjs`). Josh checked a stratified 60 by hand on the review page (`npm run review`; his answers are `evals/review/josh.jsonl`): 0 labels corrected, and the judge had labelled all 60 the same way (`evals/labels/agreement.json`). His label wins where they differ; the control room shows the agreement figure. Every failed case, its cause and its fix are listed on the room page and in `evals/runs/<stamp>/report.json`.

```sh
node evals/run.mjs --post          # all 300 through the agent, ~10 min at 3 concurrent, then post to the room
node evals/run.mjs --ids 171,179   # a few
node evals/run.mjs --regrade evals/runs/<stamp> --post   # re-grade saved results after a grader or label change
node evals/judge.mjs               # independent labels for all 300
npm run review                     # the 60-case hand-check page → evals/review/review.html
node evals/judge.mjs --josh evals/review/josh.jsonl       # apply the hand-check answers
```

### Results

| Run | Passed | Hand-offs caught | p50 | Cost | What changed before it |
|---|---|---|---|---|---|
| 1 · `2026-11-10T11-02-42Z` | 290 / 300 | 90 / 90 | 5.1 s | $2.00 | first full run |
| 2 · `2026-11-10T11-23-06Z` | 299 / 300 | 89 / 90 | 5.0 s | $2.02 | resolver, prompt and label fixes below |

Arabic and English pass at the same rate (150/150 and 149/150 on run 2).

### Failure log

Run 1 lost 10 cases. Every one is in `evals/fixes.json` and on the room page; in short:

- **Area resolver scored names by shared words.** "Emirates Hills" resolved to Dubai Hills Estate on the single word *hills* (3 cases), "Arabian Ranches 2" prefix-matched Arabian Ranches instead of hitting the too-few-deals gate. The resolver now matches exact names first, then a prefix only when it names one community, and never resolves on a generic word alone.
- **The agent substituted a neighbour's figure.** Palm Zayed returned `unknown_area` and the agent quoted Palm Jumeirah "as the closest match". The prompt and the tool's error text both now forbid answering with another community's number.
- **"Which villa?" before any times.** Three plain "I'd like to book a viewing" cases got a question back instead of slots. The prompt now says: offer slots at once and ask which listing in the same message.
- **مدن read as "cities".** The Arabic name of Mudon is also the word for cities; the tool description now carries the Arabic community names.
- **A misspelling ("Mirdiff")** was not an alias. Added after run 2, so it shows in run 3, not in the table above.

Run 2 lost one: a second off-topic push ("ok but seriously give me a tip") got a second refusal instead of the `out_of_scope` hand-off. The prompt now names the second ask as the hand-off; also a run-3 fix.

Grader changes along the way, all applied by re-grading the saved results rather than re-running: judge the last successful call of the expected tool (a retry after `unknown_area` is fine), stop loose area matching in the grader, count percentages as quoted figures, and treat a spelt-out unknown area as agreeing with a null one.

## Run it yourself

```sh
npm i
npm run data                                   # rebuild data/*.json from the price index and the listing generator
RELAY_TOKEN=dev node relay/relay.mjs           # relay on :4630 (needs the Claude Code CLI signed in)
node scripts/turn.mjs "كم سعر الفلل في المرابع العربية؟"   # one turn, no HTTP
npx wrangler dev                               # Worker + pages on :8787 (set RELAY_URL to your relay)
```

Secrets the Worker needs: `RELAY_TOKEN` (shared with the relay), `ADMIN_TOKEN` (posting eval runs), `IP_SALT`. The relay reads `~/.config/concierge/relay.env`. Launchd templates for the relay and the tunnel are in `relay/launchd/`; `relay/launchd/install.sh <tunnel-id>` fills in this machine's paths and loads them.

## Limits, on purpose

- Listings are synthetic; the price figures are real (DLD open data, monthly export, three-month window).
- One Mac runs the model turns. If it is asleep the page says so and the agent is offline. p50 latency and cost per conversation are on the room page, measured, not estimated.
- No WhatsApp yet. That is the next gate, on a new number.

## Licence

MIT for the code. Price data is derived from Dubai Land Department open data under its own terms.
