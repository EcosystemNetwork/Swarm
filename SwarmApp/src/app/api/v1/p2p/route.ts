/**
 * GET  /api/v1/p2p  — List mesh nodes and stats
 * POST /api/v1/p2p  — Register node, publish message, update status
 */
import { NextRequest } from "next/server";
import {
    registerP2PNode, getP2PNodes, updateNodeStatus, getMeshStats,
    publishP2PMessage, getP2PMessages, derivePeerIdFromASN, MESH_TOPICS,
    type P2PMessageType,
} from "@/lib/libp2p-agent-mesh";
import { requireOrgMember } from "@/lib/auth-guard";

export async function GET(req: NextRequest) {
    const orgId = req.nextUrl.searchParams.get("orgId");
    const statsOnly = req.nextUrl.searchParams.get("stats") === "true";
    const topic = req.nextUrl.searchParams.get("topic") || undefined;

    if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

    const auth = await requireOrgMember(req, orgId);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    if (statsOnly) {
        const stats = await getMeshStats(orgId);
        return Response.json({ stats });
    }

    if (topic) {
        const messages = await getP2PMessages(orgId, topic);
        return Response.json({ count: messages.length, messages });
    }

    const nodes = await getP2PNodes(orgId);
    return Response.json({ count: nodes.length, nodes });
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { orgId, action } = body;

        if (!orgId) return Response.json({ error: "orgId required" }, { status: 400 });

        const auth = await requireOrgMember(req, orgId);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        switch (action) {
            case "register": {
                const { agentId, asn } = body;
                if (!agentId || !asn) return Response.json({ error: "agentId and asn required" }, { status: 400 });

                const peerId = derivePeerIdFromASN(asn);
                const node = await registerP2PNode({
                    orgId, agentId, asn, peerId,
                    multiaddrs: [`/dns4/mesh.swarmprotocol.fun/tcp/443/wss/p2p/${peerId}`],
                    subscribedTopics: [
                        MESH_TOPICS.orgBroadcast(orgId),
                        MESH_TOPICS.cidShare(orgId),
                        MESH_TOPICS.discovery(),
                    ],
                    status: "online", peerCount: 0,
                    protocols: {
                        transport: "WebSockets (@libp2p/websockets)",
                        encryption: "Noise (@chainsafe/libp2p-noise)",
                        muxer: "Yamux (@chainsafe/libp2p-yamux)",
                        pubsub: "GossipSub",
                    },
                    lastSeenAt: new Date(),
                });
                return Response.json({ node }, { status: 201 });
            }

            case "publish": {
                const { agentId, asn, topic, messageType, payload, cidRef } = body;
                if (!agentId || !asn || !topic || !messageType) {
                    return Response.json({ error: "agentId, asn, topic, messageType required" }, { status: 400 });
                }
                const peerId = derivePeerIdFromASN(asn);
                const message = await publishP2PMessage({
                    orgId, topic, fromPeerId: peerId, fromAsn: asn, fromAgentId: agentId,
                    messageType: messageType as P2PMessageType,
                    payload: payload || {}, cidRef: cidRef || null, signature: null,
                });
                return Response.json({ message }, { status: 201 });
            }

            case "heartbeat": {
                const { nodeId, peerCount } = body;
                if (!nodeId) return Response.json({ error: "nodeId required" }, { status: 400 });
                await updateNodeStatus(nodeId, "online", peerCount);
                return Response.json({ status: "ok" });
            }

            case "disconnect": {
                const { nodeId } = body;
                if (!nodeId) return Response.json({ error: "nodeId required" }, { status: 400 });
                await updateNodeStatus(nodeId, "offline");
                return Response.json({ status: "disconnected" });
            }

            default:
                return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
        }
    } catch (err) {
        console.error("[p2p POST]", err);
        return Response.json({ error: "Internal server error" }, { status: 500 });
    }
}
