/**
 * GET/POST /api/v1/coordinators
 *
 * Coordinator agent management
 * - GET: List coordinators for org/project/channel
 * - POST: Register agent as coordinator
 *
 * Auth: Ed25519 signature
 */

import { NextRequest } from 'next/server';
import { verifyAgentRequest } from '../verify';
import { db } from '@/lib/firebase-admin-init';

/**
 * GET /api/v1/coordinators
 * List active coordinators
 */
export async function GET(req: NextRequest) {
  try {
    const verification = await verifyAgentRequest(req, 'GET:/v1/coordinators');
    if (!verification.valid) {
      return Response.json({ error: verification.error }, { status: 401 });
    }

    const { orgId } = verification;
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    const channelId = searchParams.get('channelId');

    let query = db.collection('coordinators').where('orgId', '==', orgId).where('active', '==', true);

    if (projectId) {
      query = query.where('projectId', '==', projectId);
    } else if (channelId) {
      query = query.where('channelId', '==', channelId);
    }

    const snapshot = await query.get();
    const coordinators = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      registeredAt: doc.data().registeredAt?.toMillis(),
    }));

    return Response.json({ coordinators });
  } catch (err) {
    console.error('[coordinators GET] Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/coordinators
 * Register as coordinator
 */
export async function POST(req: NextRequest) {
  try {
    const verification = await verifyAgentRequest(req, 'POST:/v1/coordinators');
    if (!verification.valid) {
      return Response.json({ error: verification.error }, { status: 401 });
    }

    const { agentId, agentName, orgId } = verification;
    const body = await req.json();

    const { projectId, channelId, responsibilities, maxConcurrentTasks } = body;

    // Validate
    if (!responsibilities || !Array.isArray(responsibilities)) {
      return Response.json(
        { error: 'responsibilities must be an array of strings' },
        { status: 400 }
      );
    }

    // Check if already registered
    const existing = await db
      .collection('coordinators')
      .where('agentId', '==', agentId)
      .where('orgId', '==', orgId)
      .where('active', '==', true)
      .get();

    if (!existing.empty) {
      return Response.json(
        { error: 'Agent already registered as coordinator', coordinatorId: existing.docs[0].id },
        { status: 400 }
      );
    }

    // Create coordinator
    const coordRef = await db.collection('coordinators').add({
      agentId,
      agentName,
      orgId,
      projectId: projectId || null,
      channelId: channelId || null,
      responsibilities,
      active: true,
      maxConcurrentTasks: maxConcurrentTasks || 10,
      currentLoad: 0,
      registeredAt: new Date(),
    });

    return Response.json({
      success: true,
      coordinatorId: coordRef.id,
      agentId,
      responsibilities,
      maxConcurrentTasks: maxConcurrentTasks || 10,
    });
  } catch (err) {
    console.error('[coordinators POST] Error:', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
