# gmfarcaster-mcp

An [MCP](https://modelcontextprotocol.io) server for the **Warpee Knowledge API**.
Connect it once and your AI client — Claude Desktop, Claude Code, Cursor, or any
other MCP host — can query the **GM Farcaster** archive on its own: hundreds of
podcast episodes, transcripts, and metadata, answered with timestamped citations.

It exposes a single tool, **`ask_gmfarcaster`**, that takes a natural-language
question and returns a grounded, source-cited answer.

> Each call is a paid, account-less request (~**$0.005 USDC on Base** via
> [x402](https://x402.org)). There are no API keys — the on-chain payment is the
> authorization. The server signs with **your own** funded wallet. Settlement is
> **gasless** for the signer (EIP-3009), so the wallet needs USDC on Base but no ETH.

---

## Prerequisites

- **Node.js ≥ 18**
- A wallet (private key) holding a small amount of **USDC on Base**. Use a
  dedicated, low-balance wallet — see [Security](#security).

## Connect it to your client

The server reads your wallet key from the `GMFARCASTER_PRIVATE_KEY` environment
variable. Each client configures MCP servers a little differently.

### Claude Desktop

Edit your `claude_desktop_config.json`
(Settings → Developer → Edit Config), then restart Claude:

```json
{
  "mcpServers": {
    "gmfarcaster": {
      "command": "npx",
      "args": ["-y", "gmfarcaster-mcp"],
      "env": {
        "GMFARCASTER_PRIVATE_KEY": "0xYOUR_FUNDED_BASE_WALLET_KEY"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add gmfarcaster \
  --env GMFARCASTER_PRIVATE_KEY=0xYOUR_FUNDED_BASE_WALLET_KEY \
  -- npx -y gmfarcaster-mcp
```

### Cursor

Add to `~/.cursor/mcp.json` (or a project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "gmfarcaster": {
      "command": "npx",
      "args": ["-y", "gmfarcaster-mcp"],
      "env": {
        "GMFARCASTER_PRIVATE_KEY": "0xYOUR_FUNDED_BASE_WALLET_KEY"
      }
    }
  }
}
```

Once connected, just ask naturally — the client decides when to call the tool:

> *"Use the gmfarcaster tool and tell me what the GM Farcaster hosts have said about prediction markets?"*
> *"Summarize the latest gmfarcaster episode."*
> *"Use the gmfarcaster tool and tell me what from @dwr been featured on the show?"*

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GMFARCASTER_PRIVATE_KEY` | **Yes** | — | 0x-hex private key of a wallet holding USDC on Base. |
| `GMFARCASTER_API_URL` | No | `https://api.gmfarcaster.com/v1/query` | Override the endpoint. |
| `GMFARCASTER_NETWORK` | No | `eip155:8453` | CAIP-2 network id (Base mainnet). |

## Security

- The private key signs **real USDC payments**. Treat it like a hot wallet:
  use a **dedicated wallet funded with only a few dollars** of USDC, not your
  main account.
- The key never leaves your machine — it lives in your local MCP client config
  and is used only to sign the x402 payment for each query.
- Each query spends ~$0.005 USDC. Top the wallet up as needed.

## Local development (before publishing to npm)

```bash
npm install
npm run build
```

Then point your client's `command`/`args` at the built file instead of `npx`:

```json
{
  "mcpServers": {
    "gmfarcaster": {
      "command": "node",
      "args": ["/absolute/path/to/gmfarcaster-api/mcp-server/build/index.js"],
      "env": { "GMFARCASTER_PRIVATE_KEY": "0x..." }
    }
  }
}
```

## How it works

```text
MCP client (Claude / Cursor)
     │  calls tool ask_gmfarcaster({ query })
     ▼
gmfarcaster-mcp ──POST /v1/query──► api.gmfarcaster.com
     │                                   │ 402 Payment Required
     │  signs x402 payment (USDC/Base)   ▼
     └──────────── retry w/ payment ──► 200 OK { answer, citations[], usage }
```

The server is a thin wrapper over the public HTTP API. The same endpoint also
accepts **MPP (USDC on Tempo)** for non-MCP callers; see the
[main README](../README.md). MPP support inside this MCP server is on the roadmap.

Answers are **live-generated**, so a tool call can take **~30 seconds, and up to ~3
minutes** for complex questions — that's expected, not a hang. The server waits long
enough and pays only once per call, so let the tool finish rather than cancelling and
re-asking (each call is a separate on-chain payment).

## License

[MIT](../LICENSE) © GM Farcaster Network
