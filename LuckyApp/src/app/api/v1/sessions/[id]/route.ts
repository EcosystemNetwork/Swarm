/**
 * PATCH /api/v1/sessions/:id
 *
 * Update session status
 * Auth: Ed25519 signature
 */

import { NextRequest } from 'next/server';
import { verifyAgentRequest } from '../../verify';
import { db } from '@/lib/firebase-admin-init';

/**
 * PATCH /api/v1/sessions/:id
 * Update session status (close, complete, etc.)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const verification = await verifyAgentRequest(req, 'PATCH:/v1/sessions');
    if (!verification.valid) {
      return Response.json({ error: verification.error }, { status: 401 });
    }

    const { agentId, orgId } = verification;
    const sessionId = params.id;
    const body = await req.json();
    const { status, metadata } = body;

    // Validate status
    const validStatuses = ['active', 'completed', 'cancelled', 'expired'];
    if (!status || !validStatuses.includes(status)) {
      return Response.json(
        { error: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      );
    }

    // Get session
    const sessionRef = db.collection('agentSessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    const session = sessionDoc.data();

    // Verify agent is participant or coordinator creator
    const isParticipant = session?.participants?.includes(agentId);
    const isCreator = session?.createdBy === agentId;

    if (!isParticipant && !isCreator) {
      return Response.json(
        { error: 'You are not authorized to modify this session' },
        { status: 403 }
      );
    }

    // Verify org matches
    if (session?.orgId !== orgId) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    // Update session
    const updateData: any = {
      status,
      updatedAt: new Date(),
      updatedBy: agentId,
    };

    if (metadata) {
      updateData.metadata = { ...session.metadata, ...metadata };
    }

    if (status === 'completed' || status === 'cancelled') {
      updateData.closedAt = new Date();
      updateData.closedBy = agentId;
    }

    await sessionRef.update(updateData);

    return Response.json({
      success: true,
      sessionId,
      status,
      updatedAt: updateData.updatedAt.getTime(),
    });
  } catch (err) {
    console.error('[sessions PATCH] Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/v1/sessions/:id
 * Get session details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const verification = await verifyAgentRequest(req, 'GET:/v1/sessions');
    if (!verification.valid) {
      return Response.json({ error: verification.error }, { status: 401 });
    }

    const { agentId, orgId } = verification;
    const sessionId = params.id;

    const sessionDoc = await db.collection('agentSessions').doc(sessionId).get();

    if (!sessionDoc.exists) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    const session = sessionDoc.data();

    // Verify agent is participant
    const isParticipant = session?.participants?.includes(agentId);
    const isCreator = session?.createdBy === agentId;

    if (!isParticipant && !isCreator) {
      return Response.json(
        { error: 'You are not authorized to view this session' },
        { status: 403 }
      );
    }

    // Verify org matches
    if (session?.orgId !== orgId) {
      return Response.json({ error: 'Session not found' }, { status: 404 });
    }

    return Response.json({
      session: {
        id: sessionDoc.id,
        ...session,
        createdAt: session.createdAt?.toMillis(),
        expiresAt: session.expiresAt?.toMillis(),
        closedAt: session.closedAt?.toMillis(),
      },
    });
  } catch (err) {
    console.error('[sessions GET] Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
