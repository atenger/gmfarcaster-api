# On-Air Shoutout API

> Pay to have a sponsor message read **live on air** on the GM Farcaster
> livestream — a single paid HTTP request, **no API key or account required.**

**A pay-per-call sponsor read on Farcaster's #1 news show.**

| | |
|---|---|
| **Base URL** | `https://gateway.gmfarcaster.com` |
| **Endpoint** | `POST /v1/shoutout` |
| **Price** | $5 USDC per call |
| **Payment** | x402 (USDC on Base) or MPP (USDC on Tempo) — pay per request, no accounts |

> **Experimental API.** This is a media experiment, and the base URL may evolve.
> The [`openapi.yaml`](openapi.yaml) `servers` block is the **authoritative source
> of truth** for the current endpoint, and pricing is always authoritative in the
> live `402` challenge. Treat the values in this README as illustrative.

---

## How this is different from a normal API

Read this first. The On-Air Shoutout API is **asynchronous and human-in-the-loop**
— it does not behave like a typical request/response API:

- **You pay and get a receipt, not an answer.** A successful call returns `202
  Accepted` with a `request_id` and `status: "pending_review"`. The thing you paid
  for — the read — happens **later, live on the show.**
- **GM Farcaster retains full editorial control.** The team reviews every
  submission and **may decline it.** A declined request is **refunded** to the
  verified on-chain payer (or to the optional `refund_to_wallet` you provide).
- **Fulfillment is the read, on air.** When a read airs, the status moves to
  `aired` with the episode it ran on.
- **Poll for status.** Check progress at any time with a free
  `GET /v1/shoutout/{id}`.

State machine:

```text
pending_review ──► approved ──► aired        (your read ran on the show)
pending_review ──► declined ──► refunded     (editorial decline, money back)
```

(`expired` covers requests that were accepted but never aired and timed out.)

## What you submit

`POST /v1/shoutout` — `Content-Type: application/json`. Required: `sponsor_name`
(max 120 chars) and `read_text` (the script read live on air, max 280 chars). Optional: `url`,
`contact` (`{farcaster, email, x}`), `refund_to_wallet`, and `notes` (internal
only, **never read on air**).

```json
{
  "sponsor_name": "Acme Frames",
  "read_text": "Today's GM is brought to you by Acme Frames — the fastest way to ship a Farcaster mini app. acmeframes.xyz",
  "url": "https://acmeframes.xyz",
  "contact": { "farcaster": "@acme" }
}
```

## What you get back

A receipt — `202 Accepted`:

```json
{
  "request_id": "sho_8f3c2a1b9d4e",
  "status": "pending_review",
  "status_url": "https://gateway.gmfarcaster.com/v1/shoutout/sho_8f3c2a1b9d4e",
  "payer": "0xabc...",
  "amount": "$5",
  "submitted_at": "2026-06-30T15:04:05Z"
}
```

- `request_id` — keep this; it's how you check status and is your proof of submission.
- `status` — always `pending_review` on acceptance. The read is queued for editorial review.
- `status_url` — poll this for the current state.
- `payer` — the verified on-chain payer (the default refund destination).

| Status | Meaning |
|--------|---------|
| `202` | Accepted for review — receipt returned. The read is **not** guaranteed to air; it's pending editorial review. |
| `402` | Payment required — x402 challenge in `PAYMENT-REQUIRED`, MPP challenge in `WWW-Authenticate: Payment`. Pay with whichever you support. |
| `400` | Missing/invalid fields (e.g. empty `sponsor_name`/`read_text`, `sponsor_name` over 120 chars, or `read_text` over 280 chars). |
| `500` | Internal error (generic; no internal detail is ever returned). |

`GET /v1/shoutout/{id}` → `ShoutoutStatus` — free, no payment. `GET /v1/healthz` →
`{ "status": "ok", "timestamp": "...", "version": "..." }` — free.

## What to expect — the call is fast, the read is not

Unlike a live-generated answer, this call **returns quickly with a receipt**. The
fulfillment (the on-air read) happens later on the show.

- **Do not auto-retry a successful `202`.** Each call is a **separate on-chain
  payment**, so retrying a submission that already succeeded will pay — and submit —
  again.
- **Check progress by polling** `GET /v1/shoutout/{id}`, not by re-submitting.
- **Refunds are automatic** if a request is declined — to the verified on-chain
  payer, or to `refund_to_wallet` if you set it.

## How it works

```text
   Agent
     │   POST /v1/shoutout   { "sponsor_name": "...", "read_text": "..." }
     ▼
   402 Payment Required   ──►  pay with x402 (Base) or MPP (Tempo)
     │   retry with payment
     ▼
   202 Accepted   ──►  { request_id, status: "pending_review", status_url }
     │
     │   ... editorial review ...
     ▼
   aired  (read runs live on the show)   OR   declined ──► refunded
```

One HTTP request in, a receipt out. The payment handshake is automatic — an x402-
or MPP-aware client does it for you (see Quick start).

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
    "https://gateway.gmfarcaster.com/v1/shoutout",
    json={
        "sponsor_name": "Acme Frames",
        "read_text": "Today's GM is brought to you by Acme Frames — ship a Farcaster mini app fast. acmeframes.xyz",
        "url": "https://acmeframes.xyz",
    },
)
receipt = resp.json()
print(receipt["request_id"], receipt["status"])  # e.g. sho_... pending_review
print("Track it:", receipt["status_url"])
# Don't re-POST to check status — that pays again. Poll status_url instead.
```

The wallet needs **USDC on Base, but no ETH** — settlement is gasless for the
caller. Prefer to pay on **Tempo** instead? See [Payment protocols](#payment-protocols-the-handshake) below.

## Use it from Claude or Cursor (MCP or skill)

Prefer to wire this into an AI client rather than call the HTTP API yourself? The
[`mcp-server/`](mcp-server/) directory ships an
[MCP](https://modelcontextprotocol.io) server — connect it **once** and Claude
Desktop, Claude Code, or Cursor can submit shoutouts and check their status via
`request_shoutout` and `check_shoutout_status` tools. It wraps this same paid
endpoint; you bring a Base wallet holding a little USDC. Setup and client config in
[`mcp-server/README.md`](mcp-server/README.md).

There's also a **Claude skill** in [`skills/onair-shoutout/`](skills/onair-shoutout/) —
a self-contained `SKILL.md` plus a small Python script that pays the x402 toll,
submits the read, and prints the receipt. The MCP server is a live tool connection;
the skill is a runnable script. They're independent on-ramps to the same API — use
whichever fits your workflow.

## Why no API keys?

The On-Air Shoutout API is account-less — **the payment is the authorization.** It
speaks two open machine-payment protocols, [x402](https://x402.org) and
[MPP](https://mpp.dev), so:

- AI agents (and humans) can pay **per request**
- No user accounts
- No API key management
- Access is authorized by the on-chain payment

The endpoint advertises **both rails in a single `402`**; your client pays with
whichever it speaks.

---

## Payment protocols (the handshake)

Two open, account-less rails are advertised together in one `402`. You only need
one. Pricing is always authoritative in the live challenge.

<details>
<summary><b>x402 — USDC on Base</b> (gasless via EIP-3009)</summary>

An unpaid request returns `402` with a base64 `PAYMENT-REQUIRED` challenge (price,
asset, network, pay-to). Your x402 client signs a USDC transfer authorization and
retries; a facilitator verifies and settles on-chain; you get `202` with your
receipt. **No gas needed** — settlement uses EIP-3009 `transferWithAuthorization`.

The [Quick start](#quick-start-python) above uses this rail. Runnable client:
[`examples/buyer.py`](examples/buyer.py). Requires `eth-account >= 0.13.5`.

</details>

<details>
<summary><b>Paying with MPP (Tempo)</b> — USDC on Tempo</summary>

The same endpoint also accepts [MPP](https://mpp.dev) (Tempo's Machine Payments
Protocol), settled in USDC on **Tempo**. An unpaid request advertises it in the
`402` via `WWW-Authenticate: Payment`; pay with an MPP client and you get `202`
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
            "https://gateway.gmfarcaster.com/v1/shoutout",
            json={
                "sponsor_name": "Acme Frames",
                "read_text": "Today's GM is brought to you by Acme Frames. acmeframes.xyz",
            },
        )
    receipt = resp.json()
    print(receipt["request_id"], receipt["status"])

asyncio.run(main())
```

Runnable client: [`examples/mpp_buyer.py`](examples/mpp_buyer.py). The response
body is identical on both rails.

</details>

Machine-readable spec: [`openapi.yaml`](openapi.yaml).

## License

[MIT](../LICENSE) © GM Farcaster Network
