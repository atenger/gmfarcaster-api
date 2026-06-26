# Warpee Knowledge API

A pay-per-call HTTP API over the **GM Farcaster** content library — hundreds of
episodes of transcripts and metadata, returned as a citation-backed answer.

Account-less and pay-per-call: no API keys or sign-ups — the on-chain payment IS
the authorization. The endpoint speaks **two payment protocols**, advertised
together in a single `402`, so an agent pays with whichever it supports:

- **[x402](https://x402.org)** — USDC on **Base**
- **[MPP](https://mpp.dev)** (Machine Payments Protocol) — USDC on **Tempo**

Details:

- **Base URL:** `https://api.gmfarcaster.com`
- **Endpoint:** `POST /v1/query`
- **Price:** $0.005 USDC per call (either rail)
- **Settlement:** x402 `exact` scheme (Base) or MPP `charge` (Tempo) — gasless/no
  native-gas-token for the caller in both cases

> Status: **live on mainnet** — x402 on Base and MPP on Tempo (real USDC).

---

## How it works (x402 in three steps)

1. `POST /v1/query` with your question. With no payment you get **HTTP 402** and a
   `PAYMENT-REQUIRED` challenge (price, asset, network, pay-to address).
2. Your x402 client signs a USDC transfer authorization and retries with a
   payment header. **No gas needed** — settlement uses EIP-3009.
3. A facilitator verifies and settles on-chain; you get **HTTP 200** with the
   answer and citations.

An x402-aware HTTP client does steps 1–3 for you automatically (see below).

## Quickstart (Python)

> Requires `eth-account >= 0.13.5` (for `sign_typed_data`).

```bash
pip install "x402>=2.13" "eth-account>=0.13.5" requests
```

```python
from eth_account import Account
from x402 import x402ClientSync
from x402.mechanisms.evm.exact.client import ExactEvmScheme
from x402.mechanisms.evm.signers import EthAccountSigner
from x402.http.clients.requests import x402_requests

NETWORK = "eip155:8453"  # Base mainnet (use eip155:84532 for Base Sepolia testnet)

account = Account.from_key("0xYOUR_FUNDED_PRIVATE_KEY")  # holds USDC; keep it secret
client = x402ClientSync()
client.register(NETWORK, ExactEvmScheme(EthAccountSigner(account)))
session = x402_requests(client)  # a requests.Session that auto-pays 402s

resp = session.post(
    "https://api.gmfarcaster.com/v1/query",
    json={"query": "What have GM Farcaster hosts said about prediction markets?"},
    timeout=300,
)
print(resp.status_code)
print(resp.json()["answer"])
for c in resp.json()["citations"]:
    print(f"- {c['display_name']}: {c['url']}")
```

The wallet needs **USDC on Base, but no ETH** — the `exact` scheme is gasless for
the caller (EIP-3009 `transferWithAuthorization`).

## Paying via MPP (Tempo)

The same endpoint also accepts **[MPP](https://mpp.dev)** — Tempo's Machine
Payments Protocol — settled in USDC on **Tempo**. An unpaid request advertises it
in the `402` via a `WWW-Authenticate: Payment` header (alongside the x402
challenge); pay with an MPP client and you get `200` plus a `Payment-Receipt`.

MPP is **client-settles**: your wallet broadcasts the on-chain stablecoin transfer
and pays the fee in stablecoin — Tempo has no native gas token, so you need USDC
on Tempo but no separate gas asset.

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

See [`examples/mpp_buyer.py`](examples/mpp_buyer.py) for a runnable version. The
response body (`answer` / `citations` / `usage`) is identical on both rails.

## Request

`POST /v1/query` — `Content-Type: application/json`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `query` | string | yes | Your question. Max 2000 characters. |

## Response `200`

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

## Other responses

| Status | Meaning |
|--------|---------|
| `402` | Payment required — x402 challenge in the `PAYMENT-REQUIRED` header (base64 JSON) and an MPP challenge in `WWW-Authenticate: Payment`. Pay with whichever you support. |
| `400` | Missing/empty `query`, or query too long. |
| `500` | Internal error (generic; no internal detail is ever returned). |

## Health check (free)

`GET /v1/healthz` → `{ "ok": true, "payments_enabled": true }` — no payment required.

## Notes

- The 402 challenge advertises the live price, asset, network, and pay-to
  address, so clients always settle against current terms.
- Pricing may change; tiered pricing may be introduced. The challenge is always
  authoritative.

See [`examples/buyer.py`](examples/buyer.py) (x402) and
[`examples/mpp_buyer.py`](examples/mpp_buyer.py) (MPP/Tempo) for runnable clients,
and [`openapi.yaml`](openapi.yaml) for the machine-readable spec.

## License

[MIT](LICENSE) © GM Farcaster Network
