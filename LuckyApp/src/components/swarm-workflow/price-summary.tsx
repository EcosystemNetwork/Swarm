'use client';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { type WorkflowValidation, formatCostCents } from '@/lib/swarm-workflow';

interface PriceSummaryProps {
  validation: WorkflowValidation;
  agentCount: number;
  onExecute: () => void;
  executing: boolean;
}

export function PriceSummary({ validation, agentCount, onExecute, executing }: PriceSummaryProps) {
  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="text-sm">
          <span className="text-gray-500">Agents: </span>
          <span className="font-semibold">{agentCount}</span>
        </div>
        <div className="text-sm">
          <span className="text-gray-500">Est. Total: </span>
          <span className="font-bold text-amber-700 text-base">
            {formatCostCents(validation.totalCostCents)}
          </span>
        </div>
        {!validation.isValid && validation.errors.length > 0 && (
          <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">
            {validation.errors[0]}
          </Badge>
        )}
      </div>
      <Button
        onClick={onExecute}
        disabled={!validation.isValid || executing}
        className="bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
      >
        {executing ? 'Executing...' : `Execute Swarm (${formatCostCents(validation.totalCostCents)})`}
      </Button>
    </div>
  );
}
