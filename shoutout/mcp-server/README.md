# gmfarcaster-shoutout-mcp

An [MCP](https://modelcontextprotocol.io) server for the **On-Air Shoutout API**.
Connect it once and your AI client — Claude Desktop, Claude Code, Cursor, or any
other MCP host — can pay to have a sponsor message read **live on the GM Farcaster
show**, and check on it afterward.

It exposes two tools:

- **`request_shoutout`** — submit a sponsor read (paid). Returns a **receipt**
  (`request_id` + `status: "pending_review"`), not a confirmed read.
- **`check_shoutout_status`** — look up the status of a submission by `request_id`
  (free, no payment).

> **This is asynchronous and human-in-the-loop.** `request_shoutout` returns a
> receipt — GM Farcaster reviews every submission and may **decline and refund**
> it. The read happens later, live on the show. Track it with
> `check_shoutout_status`; don't re-call `request_shoutout` to check progress —
> each call is a separate on-chain payment.

> Submitting a shoutout is a paid, account-less request (**$5 USDC**). There are
> no API keys — the on-chain payment is the authorization. The server signs with
> **your own** funded wallet, on **whichever rail you configure a key for**:
> [x402](https://x402.org) (USDC on Base, gasless for the signer via EIP-3009 —
> wallet needs USDC but no ETH) or [MPP](https://mpp.dev) (USDC on Tempo,
> client-settles — wallet needs USDC and pays its own small stablecoin-denominated
> network fee).

---

## Prerequisites

- **Node.js ≥ 18**
- A wallet (private key) holding **USDC** on **Base** or **Tempo** (whichever
  rail you want to use). Use a dedicated, low-balance wallet — see
  [Security](#security).

## Connect it to your client

The server reads your wallet key from `GMFARCASTER_PRIVATE_KEY` (Base, x402) or
`GMFARCASTER_MPP_PRIVATE_KEY` (Tempo, MPP) — set whichever matches the wallet you
funded. The examples below use the x402/Base variable; swap in
`GMFARCASTER_MPP_PRIVATE_KEY` with a Tempo wallet key to use MPP instead — see
[Configuration](#configuration). Each client configures MCP servers a little
differently.

### Claude Desktop

Edit your `claude_desktop_config.json`
(Settings → Developer → Edit Config), then restart Claude:

```json
{
  "mcpServers": {
    "gmfarcaster-shoutout": {
      "command": "npx",
      "args": ["-y", "gmfarcaster-shoutout-mcp"],
      "env": {
        "GMFARCASTER_PRIVATE_KEY": "0xYOUR_FUNDED_BASE_WALLET_KEY"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add gmfarcaster-shoutout \
  --env GMFARCASTER_PRIVATE_KEY=0xYOUR_FUNDED_BASE_WALLET_KEY \
  -- npx -y gmfarcaster-shoutout-mcp
```

### Cursor

Add to `~/.cursor/mcp.json` (or a project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "gmfarcaster-shoutout": {
      "command": "npx",
      "args": ["-y", "gmfarcaster-shoutout-mcp"],
      "env": {
        "GMFARCASTER_PRIVATE_KEY": "0xYOUR_FUNDED_BASE_WALLET_KEY"
      }
    }
  }
}
```

Once connected, just ask naturally — the client decides when to call the tools:

> *"Use the gmfarcaster-shoutout tool to submit a read for Acme Frames: 'Today's GM is brought to you by Acme Frames — ship a Farcaster mini app fast. acmeframes.xyz'"*
> *"Check the status of shoutout sho_8f3c2a1b9d4e."*

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GMFARCASTER_PRIVATE_KEY` | One of these two | — | 0x-hex private key of a wallet holding USDC on Base (x402 rail). |
| `GMFARCASTER_MPP_PRIVATE_KEY` | One of these two | — | 0x-hex private key of a wallet holding USDC on Tempo (MPP rail). |
| `GMFARCASTER_PAYMENT_RAIL` | No | `x402` if both keys above are set | `"x402"` or `"mpp"` — which rail to use when you've configured both keys. Ignored (and unnecessary) if only one key is set. |
| `GMFARCASTER_SHOUTOUT_API_URL` | No | `https://gateway.gmfarcaster.com/v1/shoutout` | Override the endpoint. The free status check derives its origin from this URL. |
| `GMFARCASTER_NETWORK` | No | `eip155:8453` | CAIP-2 network id for the x402 rail (Base mainnet). |

## Security

- The private key signs **real USDC payments**. Treat it like a hot wallet:
  use a **dedicated wallet funded with only a few dollars** of USDC, not your
  main account. Note the Shoutout price ($5) is much higher than Warpee's —
  fund accordingly.
- The key never leaves your machine — it lives in your local MCP client config
  and is used only to sign the payment for each submission, on whichever rail
  you've configured.
- Each shoutout spends $5 USDC. Top the wallet up as needed. (Declined requests
  are refunded to the verified on-chain payer.)

## Local development (before publishing to npm)

```bash
npm install
npm run build
```

Then point your client's `command`/`args` at the built file instead of `npx`:

```json
{
  "mcpServers": {
    "gmfarcaster-shoutout": {
      "command": "node",
      "args": ["/absolute/path/to/gmfarcaster-api/shoutout/mcp-server/build/index.js"],
      "env": { "GMFARCASTER_PRIVATE_KEY": "0x..." }
    }
  }
}
```

## How it works

```text
MCP client (Claude / Cursor)
     │  calls tool request_shoutout({ sponsor_name, read_text, ... })
     ▼
gmfarcaster-shoutout-mcp ──POST /v1/shoutout──► gateway.gmfarcaster.com
     │                                   │ 402 Payment Required
     │  signs payment (x402/Base or       ▼
     │  MPP/Tempo — whichever key's set)
     └──────────── retry w/ payment ──► 202 Accepted { request_id, status: pending_review }

     │  calls tool check_shoutout_status({ request_id })
     ▼
gmfarcaster-shoutout-mcp ──GET /v1/shoutout/{id}──► 200 OK { status, ... }   (free)
```

The server is a thin wrapper over the public HTTP API, picking whichever rail
you've configured a key for. See the [main README](../README.md) for the full
dual-rail contract.

Submitting a shoutout returns **quickly with a receipt** — the read itself airs
later on the show, after editorial review, and may be declined and refunded. Use
`check_shoutout_status` to follow along rather than re-submitting (each submission
is a separate on-chain payment).

## License

[MIT](../../LICENSE) © GM Farcaster Network
