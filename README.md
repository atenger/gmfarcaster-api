# Warpee Knowledge API

A pay-per-call HTTP API over the **GM Farcaster** content library — hundreds of
episodes of transcripts and metadata, returned as a citation-backed answer.

Built on **[x402](https://x402.org)**: there are no accounts, API keys, or
sign-ups. You pay a few tenths of a cent in USDC per call, and any agent that can
sign a stablecoin transfer can call it on first contact.

- **Base URL:** `https://api.gmfarcaster.com`
- **Endpoint:** `POST /v1/query`
- **Price:** $0.005 USDC per call
- **Network:** Base (USDC) · **Settlement:** x402 `exact` scheme (gasless for the caller)

> Status: **live on Base mainnet** (real USDC).

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
| `402` | Payment required — the challenge is in the `PAYMENT-REQUIRED` header (base64 JSON). |
| `400` | Missing/empty `query`, or query too long. |
| `500` | Internal error (generic; no internal detail is ever returned). |

## Health check (free)

`GET /v1/healthz` → `{ "ok": true, "payments_enabled": true }` — no payment required.

## Notes

- The 402 challenge advertises the live price, asset, network, and pay-to
  address, so clients always settle against current terms.
- Pricing may change; tiered pricing may be introduced. The challenge is always
  authoritative.

See [`examples/buyer.py`](examples/buyer.py) for a runnable client and
[`openapi.yaml`](openapi.yaml) for the machine-readable spec.

## License

[MIT](LICENSE) © GM Farcaster Network
