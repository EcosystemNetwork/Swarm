/**
 * POST /api/v1/messaging
 *
 * Structured agent messaging API
 * Supports a2a, coord, broadcast, and session message types
 *
 * Auth: Ed25519 signature
 * Signature message: "POST:/v1/messaging:{timestamp_ms}"
 */

import { NextRequest } from 'next/server';
import { verifyAgentRequest } from '../verify';
import { db } from '@/lib/firebase-admin-init';
import { createA2AMessage, createCoordMessage, createBroadcastMessage, createSessionMessage, validateAgentMessage } from '@/lib/agent-messaging';

export async function POST(req: NextRequest) {
  try {
    // Verify Ed25519 signature
    const verification = await verifyAgentRequest(req, 'POST:/v1/messaging');
    if (!verification.valid) {
      return Response.json({ error: verification.error }, { status: 401 });
    }

    const { agentId, agentName, orgId } = verification;
    const body = await req.json();

    const { messageType, payload } = body;

    if (!messageType || !['a2a', 'coord', 'broadcast', 'session'].includes(messageType)) {
      return Response.json(
        { error: 'Invalid messageType. Must be: a2a, coord, broadcast, or session' },
        { status: 400 }
      );
    }

    let message;

    switch (messageType) {
      case 'a2a':
        const { to, toName } = body;
        if (!to) {
          return Response.json({ error: 'Missing required field: to' }, { status: 400 });
        }
        message = createA2AMessage(agentId, agentName, to, payload, { toName });
        break;

      case 'coord':
        const { coordinatorId, action, targetId, targetName, priority } = body;
        if (!coordinatorId || !action) {
          return Response.json(
            { error: 'Missing required fields: coordinatorId, action' },
            { status: 400 }
          );
        }
        message = createCoordMessage(agentId, agentName, coordinatorId, action, payload, {
          targetId,
          targetName,
          priority,
        });
        break;

      case 'broadcast':
        const { channelId, channelName, mentions } = body;
        if (!channelId) {
          return Response.json({ error: 'Missing required field: channelId' }, { status: 400 });
        }
        message = createBroadcastMessage(agentId, agentName, channelId, payload, {
          channelName,
          mentions,
        });
        break;

      case 'session':
        const { sessionId, participants, sessionName, step, stepName } = body;
        if (!sessionId || !participants || !Array.isArray(participants)) {
          return Response.json(
            { error: 'Missing required fields: sessionId, participants (array)' },
            { status: 400 }
          );
        }
        message = createSessionMessage(agentId, agentName, sessionId, participants, payload, {
          sessionName,
          step,
          stepName,
        });
        break;
    }

    // Validate message structure
    if (!validateAgentMessage(message)) {
      return Response.json({ error: 'Invalid message structure' }, { status: 400 });
    }

    // Add orgId
    message.metadata = { ...message.metadata, orgId };

    // Store in Firestore (will be picked up by hub or polling agents)
    const messageRef = await db.collection('agentMessages').add({
      ...message,
      orgId,
      timestamp: new Date(message.timestamp),
      createdAt: new Date(),
    });

    return Response.json({
      success: true,
      messageId: message.id,
      messageType,
      firestoreId: messageRef.id,
      timestamp: message.timestamp,
    });
  } catch (err) {
    console.error('[messaging] Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
