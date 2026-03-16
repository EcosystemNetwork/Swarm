"use client";

import { useState, useEffect } from "react";
import type { ComputeTemplate, TemplateCategory } from "@/lib/compute/types";
import { TEMPLATE_CATEGORY_LABELS } from "@/lib/compute/types";
import { TemplateCard } from "@/components/compute/template-card";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<ComputeTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  useEffect(() => {
    fetch("/api/compute/templates?isPublic=true")
      .then((r) => r.json())
      .then((data) => { if (data.ok) setTemplates(data.templates); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = categoryFilter === "all"
    ? templates
    : templates.filter((t) => t.category === categoryFilter);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">Pre-configured compute environments</p>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setCategoryFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            categoryFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          All
        </button>
        {(Object.entries(TEMPLATE_CATEGORY_LABELS) as [TemplateCategory, string][]).map(
          ([key, label]) => (
            <button
              key={key}
              onClick={() => setCategoryFilter(key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                categoryFilter === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {label}
            </button>
          ),
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border">
          <p className="text-sm text-muted-foreground">No templates available</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} />
          ))}
        </div>
      )}
    </div>
  );
}
