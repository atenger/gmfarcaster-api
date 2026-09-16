# GM Farcaster Network APIs

> Account-less, pay-per-call APIs for the GM Farcaster Network. **The on-chain
> payment is the authorization** — no API keys, no accounts. Every endpoint
> advertises two open machine-payment rails in a single `402`: **x402** (USDC on
> Base) and **MPP** (USDC on Tempo) — your client pays with whichever it speaks.

This repo is the public **docs + machine-readable specs + client on-ramps** for the
network's APIs. Each API lives in its own folder with its own OpenAPI spec, MCP
server, Claude skill, and runnable examples.

## APIs

| API | What it does | Base URL | Endpoint | Price | Docs |
|-----|--------------|----------|----------|-------|------|
| **Warpee Knowledge API** | Grounded, citation-backed answers over the GM Farcaster archive (hundreds of episodes + transcripts). | `api.gmfarcaster.com` | `POST /v1/query` | $0.005 / call | [`warpee/`](warpee/) |
| **On-Air Shoutout API** _(experimental)_ | Pay to have a short sponsor message **read live on air** on the GM Farcaster show. | `gateway.gmfarcaster.com` | `POST /v1/shoutout` | $5 / read | [`shoutout/`](shoutout/) |

> The **live service** (each API's own `GET /openapi.json`) is the authoritative
> source for current endpoint, pricing, and payment details — `<api>/openapi.json`
> here is a synced copy (see "Keeping the specs in sync" below), not the primary
> source. The On-Air Shoutout API is an early **media experiment** — priced low
> while we learn, and its base URL may evolve (always check the live spec).

## How payment works (both APIs)

An unpaid request returns **`402`** advertising both rails:

- **x402 — USDC on Base.** Gasless for the caller via EIP-3009 `transferWithAuthorization`.
  An x402 client signs a USDC transfer authorization and retries; a facilitator
  settles on-chain. Wallet needs USDC on Base, no ETH.
- **MPP — USDC on Tempo.** [Machine Payments Protocol](https://mpp.dev), client-settles:
  your wallet broadcasts the transfer and pays the fee in stablecoin (Tempo has no
  native gas token). Wallet needs USDC on Tempo.

You only need **one** rail. There are no accounts or API keys — paying *is* the auth.

## Two kinds of API in here

- **Warpee** is **synchronous**: pay → get a grounded, cited answer back in the same
  request.
- **On-Air Shoutout** is **asynchronous + human-in-the-loop**: pay → get a **receipt**
  (a `request_id`, status `pending_review`). GM Farcaster retains **editorial
  control** and reads approved messages live on the show; **declined requests are
  refunded** to the paying wallet. It's a spot on a real show, not an instant response.

## On-ramps (per API)

Each folder ships independent, redundant ways to reach the same endpoint — use
whichever fits your workflow:

- **OpenAPI spec** — `<api>/openapi.yaml` (hand-written) and `<api>/openapi.json`
  (generated from the live service — see below)
- **MCP server** — connect once from Claude Desktop / Claude Code / Cursor
  (`gmfarcaster-mcp` for Warpee; `gmfarcaster-shoutout-mcp` for On-Air Shoutout)
- **Claude skill** — a runnable script Claude invokes
- **Examples** — minimal x402 (Base) and MPP (Tempo) buyer scripts

## Keeping the specs in sync

`<api>/openapi.json` is generated from each API's live `GET /openapi.json` — not
hand-written, and not the primary source (see the note at the top of this file).
Regenerate it after a service-side change:

```bash
npm install
npm run sync:openapi        # fetch + validate + write both <api>/openapi.json files
npm run sync:openapi:check  # fetch + validate + report drift, exit nonzero — no writes
```

Both commands validate each live document against
[mppx](https://github.com/wevm/mppx)'s own MPP-discovery validator before touching
anything on disk, so a broken live document is reported, not silently copied.
`<api>/openapi.yaml` is still hand-written and not covered by this script — see the
open question in `ROADMAP.local.md` about whether to retire it now that the
generated `.json` exists.

## What's behind it

Powered by [**GM Farcaster**](https://gmfarcaster.com) — Farcaster's #1 news show
and the first media network born in the Farcaster ecosystem.

## License

[MIT](LICENSE) © GM Farcaster Network
