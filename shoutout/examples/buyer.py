"""Minimal x402 buyer for the On-Air Shoutout API.

Pays the 402 on POST /v1/shoutout and prints the receipt (request_id + status).
The x402 "exact" EVM scheme is gasless for the buyer (EIP-3009), so the wallet
needs USDC but no ETH. This is async + human-in-the-loop: the receipt means
"pending review", NOT a confirmed read — GM Farcaster may decline and refund.

    pip install "x402>=2.13" "eth-account>=0.13.5" requests
    export X402_PRIVATE_KEY=0x...        # a wallet holding USDC on the target network
    python buyer.py "Acme Frames" "Today's GM is brought to you by Acme Frames — acme.xyz"

Networks: Base mainnet = eip155:8453 (real USDC) | Base Sepolia = eip155:84532 (test USDC).
"""
import os
import sys

from eth_account import Account
from x402 import x402ClientSync
from x402.mechanisms.evm.exact.client import ExactEvmScheme
from x402.mechanisms.evm.signers import EthAccountSigner
from x402.http.clients.requests import x402_requests

NETWORK = os.environ.get("X402_NETWORK", "eip155:8453")  # default: Base mainnet (live API)
URL = os.environ.get("X402_URL", "https://gateway.gmfarcaster.com/v1/shoutout")

key = os.environ.get("X402_PRIVATE_KEY")
if not key:
    sys.exit("Set X402_PRIVATE_KEY to a wallet holding USDC on the target network.")

account = Account.from_key(key)
client = x402ClientSync()
client.register(NETWORK, ExactEvmScheme(EthAccountSigner(account)))
session = x402_requests(client)  # requests.Session that auto-handles 402 -> pay -> retry

sponsor = sys.argv[1] if len(sys.argv) > 1 else "Acme Frames"
read_text = sys.argv[2] if len(sys.argv) > 2 else "Today's GM is brought to you by Acme Frames."

resp = session.post(URL, json={"sponsor_name": sponsor, "read_text": read_text}, timeout=60)
resp.raise_for_status()
data = resp.json()

print("Submitted — pending editorial review (may be declined + refunded).")
print(f"  request_id: {data.get('request_id')}")
print(f"  status:     {data.get('status')}")
print(f"  status_url: {data.get('status_url')}")
