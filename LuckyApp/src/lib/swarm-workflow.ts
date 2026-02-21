import type { Agent } from './firestore';

// ─── Node Data Types ────────────────────────────────────

export interface TriggerNodeData {
  label: string;
  description: string;
}

export interface AgentNodeData {
  agentId: string;
  agentName: string;
  agentType: Agent['type'];
  agentStatus: Agent['status'];
  capabilities: string[];
  estimatedCost: number; // in USD cents
}

export interface OutputNodeData {
  label: string;
  outputType: 'result' | 'report' | 'action';
}

// ─── Price Configuration ────────────────────────────────

export const AGENT_TYPE_COSTS: Record<Agent['type'], number> = {
  Research: 150,     // $1.50
  Trading: 300,      // $3.00
  Operations: 100,   // $1.00
  Support: 75,       // $0.75
  Analytics: 200,    // $2.00
  Scout: 125,        // $1.25
};

export const AGENT_TYPE_ICONS: Record<Agent['type'], string> = {
  Research: '🔬',
  Trading: '📈',
  Operations: '⚙️',
  Support: '🛟',
  Analytics: '📊',
  Scout: '🔭',
};

// ─── Workflow Validation ────────────────────────────────

export interface WorkflowValidation {
  isValid: boolean;
  errors: string[];
  totalCostCents: number;
}

export function validateWorkflow(
  nodes: Array<{ id: string; type?: string; data: Record<string, unknown> }>,
  edges: Array<{ source: string; target: string }>
): WorkflowValidation {
  const errors: string[] = [];

  const triggerNodes = nodes.filter(n => n.type === 'trigger');
  const agentNodes = nodes.filter(n => n.type === 'agent');
  const outputNodes = nodes.filter(n => n.type === 'output');

  if (triggerNodes.length === 0) {
    errors.push('Add a Trigger node to start');
  }
  if (triggerNodes.length > 1) {
    errors.push('Only one Trigger node allowed');
  }
  if (agentNodes.length === 0) {
    errors.push('Add at least one Agent node');
  }
  if (outputNodes.length === 0) {
    errors.push('Add an Output node');
  }
  if (nodes.length > 1 && edges.length === 0) {
    errors.push('Connect the nodes together');
  }

  const totalCostCents = agentNodes.reduce((sum, node) => {
    return sum + ((node.data?.estimatedCost as number) || 0);
  }, 0);

  return {
    isValid: errors.length === 0,
    errors,
    totalCostCents,
  };
}

export function formatCostCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
