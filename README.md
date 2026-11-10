# Gulf concierge agent

A live Arabic/English property concierge for Dubai villas, with its evals and failures in the open.

**Try it:** [agent.yashkhou.com](https://agent.yashkhou.com) · **Numbers:** [agent.yashkhou.com/room](https://agent.yashkhou.com/room/)

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
| | `evals/runs/<stamp>/` | Per-case results and `report.json` for each run |

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

Labels: a model judge labelled all 300 cold (`evals/judge.mjs`). Josh checks a stratified 60 by hand; his label wins, and the control room shows how often the judge agreed with him. Every failed case, its cause and its fix are listed on the room page and in `evals/runs/<stamp>/report.json`.

```sh
node evals/run.mjs                 # all 300 through the agent, ~10 min at 3 concurrent
node evals/run.mjs --ids 171,179   # a few
node evals/judge.mjs               # independent labels for all 300
node evals/judge.mjs --sample 60   # the hand-check pack → evals/review/sample.md
```

## Run it yourself

```sh
npm i
npm run data                                   # rebuild data/*.json from the price index and the listing generator
RELAY_TOKEN=dev node relay/relay.mjs           # relay on :4630 (needs the Claude Code CLI signed in)
node scripts/turn.mjs "كم سعر الفلل في المرابع العربية؟"   # one turn, no HTTP
npx wrangler dev                               # Worker + pages on :8787 (set RELAY_URL to your relay)
```

Secrets the Worker needs: `RELAY_TOKEN` (shared with the relay), `ADMIN_TOKEN` (posting eval runs), `IP_SALT`. The relay reads `~/.config/concierge/relay.env`. Launchd plists for the relay and the tunnel are in `relay/launchd/`.

## Limits, on purpose

- Listings are synthetic; the price figures are real (DLD open data, monthly export, three-month window).
- One Mac runs the model turns. If it is asleep the page says so and the agent is offline. p50 latency and cost per conversation are on the room page, measured, not estimated.
- No WhatsApp yet. That is the next gate, on a new number.

## Licence

MIT for the code. Price data is derived from Dubai Land Department open data under its own terms.
