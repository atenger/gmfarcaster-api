---
name: gmfarcaster
description: Answer questions about the GM Farcaster podcast archive (Farcaster, Base, and the wider crypto-social ecosystem) using the paid Warpee Knowledge API. Use this when the user asks what the GM Farcaster hosts or guests have said on a topic, wants an episode summary, asks about casts featured on the show, mentions of a person/project, or episode metadata (dates, hosts, guests). Each query is a paid x402 request (~$0.005 USDC on Base).
---

# GM Farcaster Knowledge Skill

This skill queries the **Warpee Knowledge API** — a citation-backed search over the
entire GM Farcaster podcast library (hundreds of episodes, transcripts, and
metadata). It returns a grounded answer plus timestamped links to the exact moment
in an episode.

Each query is a **paid, account-less request** (~$0.005 USDC on Base via
[x402](https://x402.org)). The on-chain payment *is* the authorization — there are
no API keys. Payment is signed locally with the operator's own funded wallet and is
**gasless** for the signer (EIP-3009), so the wallet needs USDC on Base but no ETH.

## When to use this skill

Use it for questions about the GM Farcaster show, for example:

- "What have the GM Farcaster hosts said about prediction markets?"
- "Summarize the latest episode."
- "Has anything from @dwr been featured on the show?"
- "Which episodes covered the Clanker Ecosystem Fund, and who hosted them?"

Do **not** use it for general questions unrelated to the GM Farcaster archive.

## One-time setup

The script needs two Python packages and a funded wallet key.

1. Install dependencies (once):

   ```bash
   pip install -r "$CLAUDE_SKILL_DIR/requirements.txt"
   ```

   (If `$CLAUDE_SKILL_DIR` is not set, use the path to this skill's folder.)

2. Provide a wallet private key via the `GMFARCASTER_PRIVATE_KEY` environment
   variable. Use a **dedicated, low-balance wallet** funded with a few dollars of
   **USDC on Base** — treat it like a hot wallet. The key is used only to sign the
   x402 payment for each query and never leaves the machine.

## How to run a query

Run the bundled script with the user's question as a single argument:

```bash
python "$CLAUDE_SKILL_DIR/query.py" "What have the hosts said about prediction markets?"
```

The script prints the answer followed by a `Sources:` list. Relay the answer to the
user and cite the sources. If it prints an error about a missing key or insufficient
funds, tell the user to set `GMFARCASTER_PRIVATE_KEY` to a wallet holding USDC on Base.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GMFARCASTER_PRIVATE_KEY` | **Yes** | — | 0x-hex private key of a wallet holding USDC on Base. |
| `GMFARCASTER_API_URL` | No | `https://api.gmfarcaster.com/v1/query` | Override the endpoint. |
| `GMFARCASTER_NETWORK` | No | `eip155:8453` | CAIP-2 network id (Base mainnet). Use `eip155:84532` for Base Sepolia testnet. |

## Notes

- This skill and the [`gmfarcaster-mcp`](https://www.npmjs.com/package/gmfarcaster-mcp)
  MCP server are two independent ways to reach the same API — use whichever fits your
  client. The MCP server is a live tool connection; this skill is a runnable script.
- Each call spends real USDC. Keep the wallet balance small and top it up as needed.
