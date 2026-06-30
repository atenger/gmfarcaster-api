#!/usr/bin/env node
/**
 * gmfarcaster-shoutout-mcp — an MCP server for the On-Air Shoutout API.
 *
 * Lets any MCP-compatible AI client — Claude Desktop, Claude Code, Cursor, etc. —
 * pay to have a sponsor message read live on the GM Farcaster show. It exposes
 * two tools:
 *   - request_shoutout       (paid)  submit a sponsor read; returns a receipt.
 *   - check_shoutout_status  (free)  look up the status of a submission.
 *
 * Submitting a shoutout is a paid, account-less request: the server pays the
 * API's x402 402 challenge ($5 USDC on Base) automatically, signing with the
 * operator's own funded wallet. The on-chain payment IS the authorization —
 * there are no API keys or accounts. Settlement is gasless for the signer
 * (EIP-3009), so the wallet needs USDC on Base but no ETH.
 *
 * IMPORTANT: this is asynchronous and human-in-the-loop. request_shoutout
 * returns a receipt (request_id + status "pending_review"), NOT a confirmed
 * read. GM Farcaster reviews each submission and may decline and refund it. The
 * read happens later, live on the show. Use check_shoutout_status to track it —
 * do NOT re-call request_shoutout to check progress; each call pays again.
 *
 * Config (environment variables):
 *   GMFARCASTER_PRIVATE_KEY        (required)  0x-hex key of a wallet holding USDC on Base.
 *   GMFARCASTER_SHOUTOUT_API_URL   (optional)  Override the endpoint. Default: https://gateway.gmfarcaster.com/v1/shoutout
 *   GMFARCASTER_NETWORK            (optional)  CAIP-2 network. Default: eip155:8453 (Base mainnet).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { wrapFetchWithPaymentFromConfig } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import { z } from "zod";

const API_URL =
  process.env.GMFARCASTER_SHOUTOUT_API_URL ??
  "https://gateway.gmfarcaster.com/v1/shoutout";
// CAIP-2 network id; the x402 scheme config types this as `${string}:${string}`.
const NETWORK = (process.env.GMFARCASTER_NETWORK ??
  "eip155:8453") as `${string}:${string}`; // Base mainnet
const PRIVATE_KEY = process.env.GMFARCASTER_PRIVATE_KEY;

// An MCP stdio server speaks JSON-RPC over stdout — ALL diagnostics must go to
// stderr, never stdout, or the protocol stream is corrupted.
function logErr(msg: string): void {
  process.stderr.write(`[gmfarcaster-shoutout-mcp] ${msg}\n`);
}

if (!PRIVATE_KEY) {
  logErr(
    "Missing GMFARCASTER_PRIVATE_KEY. Set it to the private key of a wallet " +
      "holding USDC on Base (no ETH needed — x402 settlement is gasless). " +
      "Each shoutout costs $5 USDC.",
  );
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);

// A drop-in `fetch` that transparently answers x402 402 challenges by signing
// a USDC payment with the configured wallet and retrying.
const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
  schemes: [{ network: NETWORK, client: new ExactEvmScheme(account) }],
});

// Derive the API origin (e.g. https://gateway.gmfarcaster.com) so the free
// status check can build {origin}/v1/shoutout/{id} regardless of the POST URL.
function apiOrigin(): string {
  try {
    return new URL(API_URL).origin;
  } catch {
    return "https://gateway.gmfarcaster.com";
  }
}

type ShoutoutAccepted = {
  request_id?: string;
  status?: string;
  status_url?: string;
  payer?: string | null;
  amount?: string;
  submitted_at?: string;
};

type ShoutoutStatus = {
  request_id?: string;
  status?: string;
  submitted_at?: string;
  reviewed_at?: string | null;
  aired_episode?: string | null;
  aired_at?: string | null;
  refunded_at?: string | null;
};

const server = new McpServer({
  name: "gmfarcaster-shoutout",
  version: "0.1.0",
});

server.registerTool(
  "request_shoutout",
  {
    title: "Request an On-Air Shoutout",
    description:
      "Submit a sponsor message to be read LIVE on air on the GM Farcaster " +
      "show. This is asynchronous and human-in-the-loop: it returns a RECEIPT " +
      "(request_id + status 'pending_review'), NOT a confirmed read. GM " +
      "Farcaster reviews every submission and may DECLINE and REFUND it; the " +
      "read happens later on the show. NOTE: each call is a paid request ($5 " +
      "USDC on Base), settled automatically from the configured wallet — do not " +
      "call this again to check progress (use check_shoutout_status).",
    inputSchema: {
      sponsor_name: z
        .string()
        .min(1)
        .max(120)
        .describe("Name of the sponsor or project to credit on air."),
      read_text: z
        .string()
        .min(1)
        .max(280)
        .describe(
          "The script to read live on air (max 280 chars). Keep it tight.",
        ),
      url: z
        .string()
        .url()
        .optional()
        .describe("Optional link to include or reference for the sponsor."),
      contact: z
        .object({
          farcaster: z.string().optional(),
          email: z.string().optional(),
          x: z.string().optional(),
        })
        .optional()
        .describe("Optional contact details for follow-up about the read."),
      refund_to_wallet: z
        .string()
        .optional()
        .describe(
          "Optional wallet to receive a refund if declined. Defaults to the " +
            "verified on-chain payer.",
        ),
      notes: z
        .string()
        .optional()
        .describe("Optional internal notes for the team. Never read on air."),
    },
  },
  async ({ sponsor_name, read_text, url, contact, refund_to_wallet, notes }) => {
    const body: Record<string, unknown> = { sponsor_name, read_text };
    if (url !== undefined) body.url = url;
    if (contact !== undefined) body.contact = contact;
    if (refund_to_wallet !== undefined) body.refund_to_wallet = refund_to_wallet;
    if (notes !== undefined) body.notes = notes;

    try {
      const res = await fetchWithPayment(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        logErr(`API returned HTTP ${res.status}: ${detail.slice(0, 300)}`);
        const hint =
          res.status === 402
            ? "Payment could not be completed — check that the wallet holds USDC on Base."
            : res.status === 400
              ? "The submission was rejected (missing fields, or read_text over 280 characters)."
              : "Please try again shortly.";
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `On-Air Shoutout request failed (HTTP ${res.status}). ${hint}`,
            },
          ],
        };
      }

      const data = (await res.json()) as ShoutoutAccepted;
      const lines: string[] = [
        "Shoutout submitted — this is a RECEIPT, not a confirmed read.",
        "",
        `Request ID: ${data.request_id ?? "(unknown)"}`,
        `Status: ${data.status ?? "pending_review"}`,
      ];
      if (data.status_url) lines.push(`Track status: ${data.status_url}`);
      if (data.amount) lines.push(`Paid: ${data.amount}`);
      if (data.payer) lines.push(`Payer: ${data.payer}`);
      lines.push(
        "",
        "It is now pending editorial review. GM Farcaster may approve and air it, " +
          "or decline and refund it (to the verified on-chain payer, or your " +
          "refund_to_wallet). Use check_shoutout_status with the request_id to " +
          "track it — do not re-submit, each submission is a separate payment.",
      );

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      logErr(
        `Request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              "On-Air Shoutout request failed — could not reach the API or " +
              "complete payment. Check network connectivity and that the wallet " +
              "holds USDC on Base. See the server's stderr log for details.",
          },
        ],
      };
    }
  },
);

server.registerTool(
  "check_shoutout_status",
  {
    title: "Check On-Air Shoutout Status",
    description:
      "Look up the current status of a previously submitted shoutout by its " +
      "request_id. This is a FREE call (no payment). Status moves through " +
      "pending_review -> approved -> aired, or pending_review -> declined -> " +
      "refunded.",
    inputSchema: {
      request_id: z
        .string()
        .min(1)
        .describe("The request_id returned by request_shoutout (e.g. 'sho_...')."),
    },
  },
  async ({ request_id }) => {
    const statusUrl = `${apiOrigin()}/v1/shoutout/${encodeURIComponent(request_id)}`;
    try {
      const res = await fetch(statusUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        logErr(`Status check returned HTTP ${res.status} for ${request_id}`);
        const hint =
          res.status === 404
            ? "No shoutout found for that request_id — double-check it."
            : "Please try again shortly.";
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Could not fetch shoutout status (HTTP ${res.status}). ${hint}`,
            },
          ],
        };
      }

      const data = (await res.json()) as ShoutoutStatus;
      const lines: string[] = [
        `Request ID: ${data.request_id ?? request_id}`,
        `Status: ${data.status ?? "(unknown)"}`,
      ];
      if (data.submitted_at) lines.push(`Submitted: ${data.submitted_at}`);
      if (data.reviewed_at) lines.push(`Reviewed: ${data.reviewed_at}`);
      if (data.aired_episode) lines.push(`Aired episode: ${data.aired_episode}`);
      if (data.aired_at) lines.push(`Aired at: ${data.aired_at}`);
      if (data.refunded_at) lines.push(`Refunded at: ${data.refunded_at}`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    } catch (err) {
      logErr(
        `Status check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              "Could not reach the On-Air Shoutout API to check status. See the " +
              "server's stderr log for details.",
          },
        ],
      };
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logErr(`ready — submitting to ${API_URL} on ${NETWORK}`);
}

main().catch((err) => {
  logErr(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
