# Warpee Knowledge API

> Query the complete GM Farcaster knowledge base with a single paid HTTP request.
> Get grounded, citation-backed answers from hundreds of podcast episodes,
> transcripts, and ecosystem discussions — **no API key or account required.**

**The first pay-per-query knowledge API for the Farcaster ecosystem.**

| | |
|---|---|
| **Base URL** | `https://api.gmfarcaster.com` |
| **Endpoint** | `POST /v1/query` |
| **Price** | $0.005 USDC per call |
| **Payment** | x402 (USDC on Base) or MPP (USDC on Tempo) — pay per request, no accounts |

---

## Why Warpee?

[Warpee](https://farcaster.xyz/warpee.eth) is the canonical knowledge API for the
**GM Farcaster Network**. Instead of searching hundreds of podcast episodes by
hand, agents ask natural-language questions and get grounded answers with
**timestamped citations** back to the source.

Ideal for:

- AI agents answering Farcaster questions
- Research assistants
- Content discovery
- Farcaster research
- Qualitative analytics

## Ask it anything about the Farcaster ecosystem

**Topics, takes & sentiment** — answered from the transcripts:

```text
What have GM Farcaster hosts said about prediction markets?
What were the biggest takeaways from FarCon?
When was the Clanker Ecosystem Fund (CEF) first announced?
What is the background on the infamous mole meme?
```

**People, mentions & featured casts:**

```text
Have the hosts mentioned @dwr?
Has anything from @yourhandle been featured by GM Farcaster?
Which episodes had Jesse Pollak as a guest?
```

**Navigate the archive** — summaries, episodes, hosts:

```text
Summarize the latest episode.
Which episodes discussed Clanker?
Who are the hosts of GM Farcaster?
List the episodes from February 2026.
```

Every answer comes back grounded in the source, with timestamped links that jump
straight to the moment in the show.

## One endpoint, many skills

A single `POST /v1/query` runs an agent over the whole GM Farcaster knowledge base.
Under the hood it can:

- **Search transcripts semantically** — find what was said on any topic, by meaning
- **Summarize any episode** from its full transcript
- **Surface featured casts** curated by GM Farcaster
- **Find mentions** of people, projects, or protocols across the archive
- **Look up episode metadata** — dates, hosts, series, guests
- Return **timestamped citations** to the exact source

You don't pick a tool — you ask a question, and the agent chooses the right skills
(often several) to answer it.

## What's behind it

Powered by [**GM Farcaster**](https://gmfarcaster.com) — Farcaster's #1 news show,
and the first and only media network born in the Farcaster ecosystem. News,
interviews, and conversations from across the Farcaster ecosystem.

The API is built on the full GM Farcaster media archive:

- **Hundreds of episodes** of Farcaster news, interviews, and analysis
- **Thousands of minutes** of searchable transcripts
- **Rich episode metadata** — dates, hosts, series
- **Timestamped citations** back to the exact source

## How it works

```text
   Agent
     │   POST /v1/query   { "query": "..." }
     ▼
   402 Payment Required   ──►  pay with x402 (Base) or MPP (Tempo)
     │   retry with payment
     ▼
   Warpee   ──►  retrieval over the GM Farcaster corpus
     │
     ▼
   200 OK   ──►  { answer, citations[], usage }
```

One HTTP request in, a cited answer out. The payment handshake is automatic — an
x402- or MPP-aware client does it for you (see Quick start).

## Quick start (Python)

```bash
pip install "x402>=2.13" "eth-account>=0.13.5" requests
```

```python
from eth_account import Account
from x402 import x402ClientSync
from x402.mechanisms.evm.exact.client import ExactEvmScheme
from x402.mechanisms.evm.signers import EthAccountSigner
from x402.http.clients.requests import x402_requests

account = Account.from_key("0xYOUR_FUNDED_PRIVATE_KEY")  # holds USDC on Base; keep it secret
client = x402ClientSync()
client.register("eip155:8453", ExactEvmScheme(EthAccountSigner(account)))  # Base mainnet
session = x402_requests(client)  # a requests.Session that auto-pays 402s

resp = session.post(
    "https://api.gmfarcaster.com/v1/query",
    json={"query": "What have GM Farcaster hosts said about prediction markets?"},
    timeout=300,
)
print(resp.json()["answer"])
for c in resp.json()["citations"]:
    print(f"- {c['display_name']}: {c['url']}")
```

The wallet needs **USDC on Base, but no ETH** — settlement is gasless for the
caller. Prefer to pay on **Tempo** instead? See [Payment protocols](#payment-protocols-the-handshake) below.

## Use it from Claude or Cursor (MCP or skill)

Prefer to wire Warpee into an AI client rather than call the HTTP API yourself?
The [`mcp-server/`](mcp-server/) directory ships an
[MCP](https://modelcontextprotocol.io) server — connect it **once** and Claude
Desktop, Claude Code, or Cursor can query the archive on their own via an
`ask_gmfarcaster` tool. It wraps this same paid endpoint; you bring a Base wallet
holding a little USDC. Setup and client config in
[`mcp-server/README.md`](mcp-server/README.md).

There's also a **Claude skill** in [`skills/gmfarcaster/`](skills/gmfarcaster/) — a
self-contained `SKILL.md` plus a small Python script that pays the x402 toll and
returns a cited answer. The MCP server is a live tool connection; the skill is a
runnable script. They're independent on-ramps to the same API — use whichever fits
your workflow.

## Why no API keys?

Warpee is account-less — **the payment is the authorization.** It speaks two open
machine-payment protocols, [x402](https://x402.org) and [MPP](https://mpp.dev), so:

- AI agents can pay **per request**
- No user accounts
- No API key management
- Access is authorized by the on-chain payment

The endpoint advertises **both rails in a single `402`**; your client pays with
whichever it speaks.

## Response

`POST /v1/query` — `Content-Type: application/json`, body `{ "query": "<your question>" }`
(max 2000 chars). Returns `200`:

```json
{
  "answer": "GM Farcaster is a media network whose flagship show ...",
  "citations": [
    {
      "episode": "ep343",
      "title": "Social Signals and Prediction Markets: GM Farcaster ep343 with Quotient",
      "display_name": "Friday, February 27, 2026",
      "url": "https://www.youtube.com/watch?v=xa3oUqZ_4sw&t=3141",
      "timestamp_seconds": 3141
    }
  ],
  "usage": { "tool_calls": 3 }
}
```

- `answer` — a self-contained, source-grounded answer. If the library doesn't
  cover your question, it says so rather than guessing.
- `citations` — episodes the answer draws on, with timestamped links. May be
  empty for questions answered from static facts rather than transcript search.
- `usage.tool_calls` — how many retrieval/info tools the agent used.

| Status | Meaning |
|--------|---------|
| `402` | Payment required — x402 challenge in `PAYMENT-REQUIRED`, MPP challenge in `WWW-Authenticate: Payment`. Pay with whichever you support. |
| `400` | Missing/empty `query`, or query too long. |
| `500` | Internal error (generic; no internal detail is ever returned). |

`GET /v1/healthz` → `{ "ok": true, "payments_enabled": true }` — free, no payment.

---

## Payment protocols (the handshake)

Two open, account-less rails are advertised together in one `402`. You only need
one. Pricing is always authoritative in the live challenge.

<details>
<summary><b>x402 — USDC on Base</b> (gasless via EIP-3009)</summary>

An unpaid request returns `402` with a base64 `PAYMENT-REQUIRED` challenge (price,
asset, network, pay-to). Your x402 client signs a USDC transfer authorization and
retries; a facilitator verifies and settles on-chain; you get `200`. **No gas
needed** — settlement uses EIP-3009 `transferWithAuthorization`.

The [Quick start](#quick-start-python) above uses this rail. Runnable client:
[`examples/buyer.py`](examples/buyer.py). Requires `eth-account >= 0.13.5`.

</details>

<details>
<summary><b>Paying with MPP (Tempo)</b> — USDC on Tempo</summary>

The same endpoint also accepts [MPP](https://mpp.dev) (Tempo's Machine Payments
Protocol), settled in USDC on **Tempo**. An unpaid request advertises it in the
`402` via `WWW-Authenticate: Payment`; pay with an MPP client and you get `200`
plus a `Payment-Receipt`. MPP is **client-settles** — your wallet broadcasts the
transfer and pays the fee in stablecoin (Tempo has no native gas token), so you
need USDC on Tempo but no separate gas asset.

```bash
pip install "pympp[tempo]"
```

```python
import asyncio
from mpp.client import Client
from mpp.methods.tempo import tempo, TempoAccount, ChargeIntent

RPC = "https://rpc.tempo.xyz"   # Tempo mainnet (testnet: https://rpc.moderato.tempo.xyz)
CHAIN_ID = 4217                 # Tempo mainnet (testnet: 42431)

async def main():
    account = TempoAccount.from_key("0xYOUR_FUNDED_PRIVATE_KEY")  # holds USDC on Tempo
    method = tempo(
        account=account,
        intents={"charge": ChargeIntent(chain_id=CHAIN_ID, rpc_url=RPC)},
        chain_id=CHAIN_ID, rpc_url=RPC,
    )
    async with Client(methods=[method]) as client:  # auto-handles 402 -> pay -> retry
        resp = await client.post(
            "https://api.gmfarcaster.com/v1/query",
            json={"query": "What have GM Farcaster hosts said about prediction markets?"},
            timeout=300,
        )
    data = resp.json()
    print(data["answer"])
    for c in data.get("citations", []):
        print(f"- {c['display_name']}: {c['url']}")

asyncio.run(main())
```

Runnable client: [`examples/mpp_buyer.py`](examples/mpp_buyer.py). The response
body is identical on both rails.

</details>

Machine-readable spec: [`openapi.yaml`](openapi.yaml).

## License

[MIT](LICENSE) © GM Farcaster Network
