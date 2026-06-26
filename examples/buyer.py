"""Minimal x402 buyer for the Warpee Knowledge API.

Pays the 402 on POST /v1/query and prints the answer + citations. The x402
"exact" EVM scheme is gasless for the buyer (EIP-3009), so the wallet needs
USDC but no ETH.

    pip install "x402>=2.13" "eth-account>=0.13.5" requests
    export X402_PRIVATE_KEY=0x...        # a wallet holding USDC on the target network
    python buyer.py "What is the Clanker Ecosystem Fund?"

Networks: Base mainnet = eip155:8453 (real USDC) | Base Sepolia = eip155:84532 (test USDC).
"""
import os
import sys

import requests
from eth_account import Account
from x402 import x402ClientSync
from x402.mechanisms.evm.exact.client import ExactEvmScheme
from x402.mechanisms.evm.signers import EthAccountSigner
from x402.http.clients.requests import x402_requests

NETWORK = os.environ.get("X402_NETWORK", "eip155:84532")  # default: Base Sepolia testnet
URL = os.environ.get("X402_URL", "https://api.gmfarcaster.com/v1/query")

key = os.environ.get("X402_PRIVATE_KEY")
if not key:
    sys.exit("Set X402_PRIVATE_KEY to a wallet holding USDC on the target network.")

account = Account.from_key(key)
client = x402ClientSync()
client.register(NETWORK, ExactEvmScheme(EthAccountSigner(account)))
session = x402_requests(client)  # requests.Session that auto-handles 402 -> pay -> retry

query = sys.argv[1] if len(sys.argv) > 1 else "What is GM Farcaster?"
resp = session.post(URL, json={"query": query}, timeout=300)
resp.raise_for_status()
data = resp.json()

print(data["answer"], "\n")
for c in data.get("citations", []):
    print(f"- {c['display_name']}: {c['url']}")
