"""Minimal MPP (Tempo) buyer for the On-Air Shoutout API.

Pays the 402 on POST /v1/shoutout via Tempo's Machine Payments Protocol and prints
the receipt (request_id + status). MPP is "client-settles": your wallet broadcasts
the on-chain stablecoin transfer and pays the fee in stablecoin, so the wallet needs
USDC on Tempo but no separate native gas token. Async + human-in-the-loop: the
receipt means "pending review", NOT a confirmed read — may be declined and refunded.

    pip install "pympp[tempo]"
    export MPP_PRIVATE_KEY=0x...      # a wallet holding USDC on the target Tempo network
    python mpp_buyer.py "Acme Frames" "Today's GM is brought to you by Acme Frames — acme.xyz"

Networks: Tempo mainnet = chain 4217 (real USDC) | Tempo Moderato testnet = 42431.
"""
import asyncio
import os
import sys

from mpp.client import Client
from mpp.methods.tempo import ChargeIntent, TempoAccount, tempo

RPC = os.environ.get("MPP_RPC_URL", "https://rpc.tempo.xyz")  # Tempo mainnet
CHAIN_ID = int(os.environ.get("MPP_CHAIN_ID", "4217"))
URL = os.environ.get("MPP_URL", "https://gateway.gmfarcaster.com/v1/shoutout")


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

    sponsor = sys.argv[1] if len(sys.argv) > 1 else "Acme Frames"
    read_text = sys.argv[2] if len(sys.argv) > 2 else "Today's GM is brought to you by Acme Frames."

    async with Client(methods=[method]) as client:  # auto-handles 402 -> pay -> retry
        resp = await client.post(
            URL, json={"sponsor_name": sponsor, "read_text": read_text}, timeout=60
        )
    resp.raise_for_status()
    data = resp.json()

    print("Submitted — pending editorial review (may be declined + refunded).")
    print(f"  request_id: {data.get('request_id')}")
    print(f"  status:     {data.get('status')}")
    print(f"  status_url: {data.get('status_url')}")


if __name__ == "__main__":
    asyncio.run(main())
