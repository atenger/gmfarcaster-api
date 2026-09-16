#!/usr/bin/env node
/**
 * gmfarcaster-mcp — an MCP server for the Warpee Knowledge API.
 *
 * Exposes the GM Farcaster knowledge base (hundreds of podcast episodes,
 * transcripts, and metadata) to any MCP-compatible AI client — Claude Desktop,
 * Claude Code, Cursor, etc. — as a single tool: `ask_gmfarcaster`.
 *
 * Each query is a paid, account-less request: the server pays the API's 402
 * challenge automatically, signing with the operator's own funded wallet. The
 * on-chain payment IS the authorization — there are no API keys or accounts.
 * The API advertises TWO independent rails on the same 402 (see
 * https://api.gmfarcaster.com/v1/openapi.json); this server picks ONE based on
 * which key(s) are configured, so an operator only needs a wallet for the
 * rail they actually want to use:
 *   - x402 (USDC on Base): gasless for the signer (EIP-3009) — wallet needs
 *     USDC but no ETH.
 *   - MPP (USDC on Tempo): client-settles — wallet needs USDC and pays its
 *     own (stablecoin-denominated) network fee.
 *
 * Config (environment variables):
 *   GMFARCASTER_PRIVATE_KEY      0x-hex key of a wallet holding USDC on Base (x402 rail).
 *   GMFARCASTER_MPP_PRIVATE_KEY  0x-hex key of a wallet holding USDC on Tempo (MPP rail).
 *   At least one of the two above is required. If both are set,
 *   GMFARCASTER_PAYMENT_RAIL picks which one to use ("x402" | "mpp",
 *   default "x402" — unchanged default behavior for existing configs).
 *   GMFARCASTER_API_URL   (optional)  Override the endpoint. Default: https://api.gmfarcaster.com/v1/query
 *   GMFARCASTER_NETWORK   (optional)  CAIP-2 network for the x402 rail. Default: eip155:8453 (Base mainnet).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { Mppx, tempo } from "mppx/client";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const API_URL =
  process.env.GMFARCASTER_API_URL ?? "https://api.gmfarcaster.com/v1/query";
// CAIP-2 network id; the x402 scheme config types this as `${string}:${string}`.
const NETWORK = (process.env.GMFARCASTER_NETWORK ??
  "eip155:8453") as `${string}:${string}`; // Base mainnet
const X402_PRIVATE_KEY = process.env.GMFARCASTER_PRIVATE_KEY;
const MPP_PRIVATE_KEY = process.env.GMFARCASTER_MPP_PRIVATE_KEY;
const RAIL = process.env.GMFARCASTER_PAYMENT_RAIL;

// An MCP stdio server speaks JSON-RPC over stdout — ALL diagnostics must go to
// stderr, never stdout, or the protocol stream is corrupted.
function logErr(msg: string): void {
  process.stderr.write(`[gmfarcaster-mcp] ${msg}\n`);
}

if (!X402_PRIVATE_KEY && !MPP_PRIVATE_KEY) {
  logErr(
    "Missing a payment key. Set GMFARCASTER_PRIVATE_KEY (USDC on Base, x402) " +
      "or GMFARCASTER_MPP_PRIVATE_KEY (USDC on Tempo, MPP) — no ETH/gas token " +
      "needed for either. Each query costs ~$0.005 USDC.",
  );
  process.exit(1);
}
if (RAIL && RAIL !== "x402" && RAIL !== "mpp") {
  logErr(`Invalid GMFARCASTER_PAYMENT_RAIL "${RAIL}" — must be "x402" or "mpp".`);
  process.exit(1);
}
// Default to x402 when both keys are set, preserving existing single-rail
// configs' behavior unchanged; RAIL lets an operator with both keys pick.
const useMpp = RAIL === "mpp" || (!RAIL && !X402_PRIVATE_KEY && !!MPP_PRIVATE_KEY);
if (useMpp && !MPP_PRIVATE_KEY) {
  logErr('GMFARCASTER_PAYMENT_RAIL=mpp requires GMFARCASTER_MPP_PRIVATE_KEY.');
  process.exit(1);
}
if (!useMpp && !X402_PRIVATE_KEY) {
  logErr('GMFARCASTER_PAYMENT_RAIL=x402 (or its default) requires GMFARCASTER_PRIVATE_KEY.');
  process.exit(1);
}

// A drop-in `fetch` that transparently answers the API's 402 challenge on
// whichever rail this server is configured for.
const fetchWithPayment = useMpp
  ? Mppx.create({
      methods: [tempo({ account: privateKeyToAccount(MPP_PRIVATE_KEY as `0x${string}`) })],
      polyfill: false,
    }).fetch
  : wrapFetchWithPaymentFromConfig(fetch, {
      schemes: [
        {
          network: NETWORK,
          client: new ExactEvmScheme(privateKeyToAccount(X402_PRIVATE_KEY as `0x${string}`)),
        },
      ],
    });

type Citation = {
  episode?: string;
  title?: string;
  display_name?: string;
  url?: string;
  timestamp_seconds?: number | null;
};

type QueryResponse = {
  answer?: string;
  citations?: Citation[];
  usage?: { tool_calls?: number };
};

const server = new McpServer({ name: "gmfarcaster", version: "0.1.0" });

server.registerTool(
  "ask_gmfarcaster",
  {
    title: "Ask GM Farcaster",
    description:
      "Query the GM Farcaster knowledge base — hundreds of podcast episodes, " +
      "transcripts, and metadata covering Farcaster, Base, and the wider " +
      "ecosystem. Returns a grounded, source-cited answer with timestamped " +
      "links back to the exact moment in an episode. Use it for questions " +
      "about what the hosts or guests have said on any topic, episode " +
      "summaries, casts featured on the show, mentions of people/projects, and " +
      "episode metadata (dates, hosts, guests). NOTE: each call is a paid " +
      `request (~$0.005 USDC on ${useMpp ? "Tempo, via MPP" : "Base, via x402"}), ` +
      "settled automatically from the configured wallet.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .max(2000)
        .describe(
          "A natural-language question about the GM Farcaster archive.",
        ),
    },
  },
  async ({ query }) => {
    try {
      const res = await fetchWithPayment(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        // Answers are live-generated and can take up to ~3 min; allow a generous
        // ceiling instead of relying on the runtime's default fetch timeout. We do
        // not retry on abort — each attempt is a separate on-chain payment.
        signal: AbortSignal.timeout(300_000),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        logErr(`API returned HTTP ${res.status}: ${detail.slice(0, 300)}`);
        const hint =
          res.status === 402
            ? `Payment could not be completed — check that the wallet holds USDC on ${useMpp ? "Tempo" : "Base"}.`
            : res.status === 400
              ? "The query was rejected (empty or over 2000 characters)."
              : "Please try again shortly.";
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `GM Farcaster API request failed (HTTP ${res.status}). ${hint}`,
            },
          ],
        };
      }

      const data = (await res.json()) as QueryResponse;

      const lines: string[] = [data.answer?.trim() || "(no answer returned)"];
      const citations = data.citations ?? [];
      if (citations.length > 0) {
        lines.push("", "Sources:");
        for (const c of citations) {
          const label = c.title || c.episode || "source";
          const when = c.display_name ? ` (${c.display_name})` : "";
          lines.push(`- ${label}${when}: ${c.url ?? ""}`.trimEnd());
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      logErr(
        `Query failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              "GM Farcaster query failed — could not reach the API or complete " +
              `payment. Check network connectivity and that the wallet holds ` +
              `USDC on ${useMpp ? "Tempo" : "Base"}. See the server's stderr log for details.`,
          },
        ],
      };
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logErr(`ready — querying ${API_URL} via ${useMpp ? "MPP (Tempo)" : `x402 (${NETWORK})`}`);
}

main().catch((err) => {
  logErr(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
