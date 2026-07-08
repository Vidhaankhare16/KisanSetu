"""LiveKit SIP wiring for Kisan Alert (idempotent — safe to re-run).

Ensures: an inbound trunk for the Vobiz DID, a dispatch rule that routes inbound
calls to the kisan-voice agent, and an outbound trunk (credential auth) for
app-triggered calls. Existing trunks/rules for the same number are reused;
dispatch rules pointing at a different agent are replaced. Prints the
SIP_OUTBOUND_TRUNK_ID to paste into .env.
"""
from __future__ import annotations

import asyncio
import os

from dotenv import load_dotenv
from livekit import api

load_dotenv()

AGENT_NAME = os.environ.get("AGENT_NAME", "kisan-voice")
HOST = os.environ["VOBIZ_SIP_HOST"]
NUM = os.environ["VOBIZ_PHONE_NUMBER"]
USER = os.environ.get("VOBIZ_USERNAME", "")
PWD = os.environ.get("VOBIZ_PASSWORD", "")


# Carriers present the dialed DID in varying formats; LiveKit refuses the INVITE
# if the To-number isn't in the trunk's `numbers` list, so accept every variant.
def num_variants() -> list[str]:
    bare = NUM.lstrip("+").removeprefix("91")          # 7971442493
    return [f"+91{bare}", f"91{bare}", f"0{bare}", bare]


async def ensure_inbound(lk: api.LiveKitAPI) -> str:
    wanted = num_variants()
    existing = await lk.sip.list_sip_inbound_trunk(api.ListSIPInboundTrunkRequest())
    for t in existing.items:
        if any(n in t.numbers for n in wanted):
            if set(wanted) <= set(t.numbers):
                print("INBOUND trunk (reused):", t.sip_trunk_id)
                return t.sip_trunk_id
            # Missing some formats → replace the trunk (numbers aren't updatable in-place).
            await lk.sip.delete_sip_trunk(api.DeleteSIPTrunkRequest(sip_trunk_id=t.sip_trunk_id))
            print(f"INBOUND trunk {t.sip_trunk_id} deleted — numbers={list(t.numbers)} lacked variants")
    inbound = await lk.sip.create_sip_inbound_trunk(api.CreateSIPInboundTrunkRequest(
        trunk=api.SIPInboundTrunkInfo(name="Vobiz inbound (Kisan Alert)", numbers=wanted),
    ))
    print("INBOUND trunk (created):", inbound.sip_trunk_id, "numbers:", wanted)
    return inbound.sip_trunk_id


async def ensure_dispatch(lk: api.LiveKitAPI, inbound_id: str) -> None:
    rules = await lk.sip.list_sip_dispatch_rule(api.ListSIPDispatchRuleRequest())
    for r in rules.items:
        agents = [a.agent_name for a in r.room_config.agents] if r.HasField("room_config") else []
        if (inbound_id in r.trunk_ids or not r.trunk_ids) and agents == [AGENT_NAME]:
            print("DISPATCH rule (reused):", r.sip_dispatch_rule_id)
            return
        # Anything else — wrong agent, or pointing at a stale/deleted trunk — is replaced.
        await lk.sip.delete_sip_dispatch_rule(api.DeleteSIPDispatchRuleRequest(
            sip_dispatch_rule_id=r.sip_dispatch_rule_id))
        print(f"DISPATCH rule {r.sip_dispatch_rule_id} (agents={agents}, trunks={list(r.trunk_ids)}) deleted")
    rule = await lk.sip.create_sip_dispatch_rule(api.CreateSIPDispatchRuleRequest(
        trunk_ids=[inbound_id],
        rule=api.SIPDispatchRule(
            dispatch_rule_individual=api.SIPDispatchRuleIndividual(room_prefix="call-"),
        ),
        room_config=api.RoomConfiguration(
            agents=[api.RoomAgentDispatch(agent_name=AGENT_NAME)],
        ),
    ))
    print("DISPATCH rule (created):", rule.sip_dispatch_rule_id)


async def ensure_outbound(lk: api.LiveKitAPI) -> str:
    existing = await lk.sip.list_sip_outbound_trunk(api.ListSIPOutboundTrunkRequest())
    for t in existing.items:
        if t.address == HOST and NUM in t.numbers:
            print("OUTBOUND trunk (reused):", t.sip_trunk_id)
            return t.sip_trunk_id
    outbound = await lk.sip.create_sip_outbound_trunk(api.CreateSIPOutboundTrunkRequest(
        trunk=api.SIPOutboundTrunkInfo(
            name="Vobiz outbound (Kisan Alert)", address=HOST, numbers=[NUM],
            auth_username=USER, auth_password=PWD,
        ),
    ))
    print("OUTBOUND trunk (created):", outbound.sip_trunk_id)
    return outbound.sip_trunk_id


async def main() -> None:
    lk = api.LiveKitAPI()
    try:
        inbound_id = await ensure_inbound(lk)
        await ensure_dispatch(lk, inbound_id)
        outbound_id = await ensure_outbound(lk)
        print(f"\n>>> add to .env / voice-env.yaml:\nSIP_OUTBOUND_TRUNK_ID={outbound_id}")
    finally:
        await lk.aclose()


asyncio.run(main())
