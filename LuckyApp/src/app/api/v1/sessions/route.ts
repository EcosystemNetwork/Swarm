/**
 * GET/POST /api/v1/sessions
 *
 * Agent session management for multi-step workflows
 * - GET: List active sessions for agent
 * - POST: Create new session
 *
 * Auth: Ed25519 signature
 */

import { NextRequest } from 'next/server';
import { verifyAgentRequest } from '../verify';
import { db } from '@/lib/firebase-admin-init';

/**
 * GET /api/v1/sessions
 * List active sessions for agent
 */
export async function GET(req: NextRequest) {
  try {
    const verification = await verifyAgentRequest(req, 'GET:/v1/sessions');
    if (!verification.valid) {
      return Response.json({ error: verification.error }, { status: 401 });
    }

    const { agentId, orgId } = verification;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'active';
    const coordinatorId = searchParams.get('coordinatorId');

    let query = db
      .collection('agentSessions')
      .where('orgId', '==', orgId)
      .where('status', '==', status);

    // Filter by participant
    if (coordinatorId) {
      query = query.where('coordinatorId', '==', coordinatorId);
    } else {
      query = query.where('participants', 'array-contains', agentId);
    }

    const snapshot = await query.orderBy('createdAt', 'desc').limit(50).get();
    const sessions = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toMillis(),
      expiresAt: doc.data().expiresAt?.toMillis(),
    }));

    return Response.json({ sessions });
  } catch (err) {
    console.error('[sessions GET] Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/sessions
 * Create new agent session
 */
export async function POST(req: NextRequest) {
  try {
    const verification = await verifyAgentRequest(req, 'POST:/v1/sessions');
    if (!verification.valid) {
      return Response.json({ error: verification.error }, { status: 401 });
    }

    const { agentId, agentName, orgId } = verification;
    const body = await req.json();

    const { coordinatorId, participants, purpose, metadata, ttlMinutes } = body;

    // Validate
    if (!coordinatorId) {
      return Response.json({ error: 'coordinatorId is required' }, { status: 400 });
    }

    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      return Response.json(
        { error: 'participants must be a non-empty array' },
        { status: 400 }
      );
    }

    // Verify coordinator exists
    const coordDoc = await db.collection('coordinators').doc(coordinatorId).get();
    if (!coordDoc.exists) {
      return Response.json({ error: 'Coordinator not found' }, { status: 404 });
    }

    // Create session
    const ttl = ttlMinutes || 60; // Default 1 hour
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000);

    const sessionRef = await db.collection('agentSessions').add({
      coordinatorId,
      orgId,
      participants,
      purpose: purpose || 'Multi-step workflow',
      metadata: metadata || {},
      status: 'active',
      messageCount: 0,
      createdBy: agentId,
      createdByName: agentName,
      createdAt: new Date(),
      expiresAt,
    });

    return Response.json({
      success: true,
      sessionId: sessionRef.id,
      coordinatorId,
      participants,
      expiresAt: expiresAt.getTime(),
    });
  } catch (err) {
    console.error('[sessions POST] Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
