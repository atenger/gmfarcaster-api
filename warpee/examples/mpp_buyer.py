"""Minimal MPP (Tempo) buyer for the Warpee Knowledge API.

Pays the 402 on POST /v1/query via Tempo's Machine Payments Protocol and prints
the answer + citations. MPP is "client-settles": your wallet broadcasts the
on-chain stablecoin transfer and pays the fee in stablecoin, so the wallet needs
USDC on Tempo but no separate native gas token.

    pip install "pympp[tempo]"
    export MPP_PRIVATE_KEY=0x...      # a wallet holding USDC on the target Tempo network
    python mpp_buyer.py "What is the Clanker Ecosystem Fund?"

Networks: Tempo mainnet = chain 4217 (real USDC) | Tempo Moderato testnet = 42431.
"""
import asyncio
import os
import sys

from mpp.client import Client
from mpp.methods.tempo import ChargeIntent, TempoAccount, tempo

# Tempo mainnet by default; override via env for the Moderato testnet.
RPC = os.environ.get("MPP_RPC_URL", "https://rpc.tempo.xyz")
CHAIN_ID = int(os.environ.get("MPP_CHAIN_ID", "4217"))
URL = os.environ.get("MPP_URL", "https://api.gmfarcaster.com/v1/query")


async def main() -> None:
    key = os.environ.get("MPP_PRIVATE_KEY")
    if not key:
        sys.exit("Set MPP_PRIVATE_KEY to a wallet holding USDC on the target Tempo network.")

    account = TempoAccount.from_key(key)
    method = tempo(
        account=account,
        intents={"charge": ChargeIntent(chain_id=CHAIN_ID, rpc_url=RPC)},
        chain_id=CHAIN_ID,
        rpc_url=RPC,
    )

    query = sys.argv[1] if len(sys.argv) > 1 else "What is GM Farcaster?"
    async with Client(methods=[method]) as client:  # auto-handles 402 -> pay -> retry
        resp = await client.post(URL, json={"query": query}, timeout=300)
    resp.raise_for_status()
    data = resp.json()

    print(data["answer"], "\n")
    for c in data.get("citations", []):
        print(f"- {c['display_name']}: {c['url']}")


if __name__ == "__main__":
    asyncio.run(main())
