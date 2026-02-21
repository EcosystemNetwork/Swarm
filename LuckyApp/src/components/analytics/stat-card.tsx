import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  icon: string;
  change?: number;
  changeLabel?: string;
  prefix?: string;
}

export function StatCard({ title, value, icon, change, changeLabel, prefix }: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const hasChange = change !== undefined;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-500">{title}</span>
          <span className="text-2xl">{icon}</span>
        </div>
        <div className="text-2xl font-bold tracking-tight">
          {prefix}{value}
        </div>
        {hasChange && (
          <div className="flex items-center gap-1 mt-2">
            <span
              className={cn(
                "text-xs font-medium flex items-center gap-0.5",
                isPositive ? "text-green-600" : "text-red-500"
              )}
            >
              {isPositive ? "↑" : "↓"} {Math.abs(change).toFixed(1)}%
            </span>
            {changeLabel && (
              <span className="text-xs text-gray-400">{changeLabel}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
