/** Submit Market Item Dialog — Form for community submissions. */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { type MarketItemType, type PricingModel, type MarketPricing, submitMarketItem, publishAgentPackage, AGENT_CATEGORIES } from "@/lib/skills";

interface SubmitMarketItemDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    submitterAddress: string;
    onSubmitted: () => void;
}

export function SubmitMarketItemDialog({
    open,
    onOpenChange,
    submitterAddress,
    onSubmitted,
}: SubmitMarketItemDialogProps) {
    const [name, setName] = useState("");
    const [type, setType] = useState<MarketItemType | "">("");
    const [category, setCategory] = useState("");
    const [icon, setIcon] = useState("");
    const [description, setDescription] = useState("");
    const [version, setVersion] = useState("1.0.0");
    const [tagsInput, setTagsInput] = useState("");
    const [requiredKeysInput, setRequiredKeysInput] = useState("");
    const [pricingModel, setPricingModel] = useState<PricingModel>("free");
    const [monthlyPrice, setMonthlyPrice] = useState("");
    const [yearlyPrice, setYearlyPrice] = useState("");
    const [lifetimePrice, setLifetimePrice] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Agent-specific fields
    const [agentType, setAgentType] = useState("");
    const [persona, setPersona] = useState("");
    const [personality, setPersonality] = useState("");
    const [rules, setRules] = useState("");
    const [agentCategory, setAgentCategory] = useState("");
    const [configPrice, setConfigPrice] = useState("");
    const [rentalMonthly, setRentalMonthly] = useState("");
    const [rentalUsage, setRentalUsage] = useState("");
    const [performanceShare, setPerformanceShare] = useState("");
    const [hirePerTask, setHirePerTask] = useState("");

    const resetForm = () => {
        setName("");
        setType("");
        setCategory("");
        setIcon("");
        setDescription("");
        setVersion("1.0.0");
        setTagsInput("");
        setRequiredKeysInput("");
        setPricingModel("free");
        setMonthlyPrice("");
        setYearlyPrice("");
        setLifetimePrice("");
        setError(null);
        setAgentType("");
        setPersona("");
        setPersonality("");
        setRules("");
        setAgentCategory("");
        setConfigPrice("");
        setRentalMonthly("");
        setRentalUsage("");
        setPerformanceShare("");
        setHirePerTask("");
    };

    const handleSubmit = async () => {
        if (!name.trim() || !type || !icon.trim() || !description.trim()) return;
        if (type !== "agent" && !category.trim()) return;

        setSubmitting(true);
        setError(null);
        try {
            const tags = tagsInput
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);
            const requiredKeys = requiredKeysInput
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean);

            if (type === "agent") {
                // Agent publishing flow
                const distributions: ("config" | "rental" | "hire")[] = [];
                if (configPrice) distributions.push("config");
                if (rentalMonthly || rentalUsage || performanceShare) distributions.push("rental");
                if (hirePerTask) distributions.push("hire");
                if (distributions.length === 0) distributions.push("config");

                await publishAgentPackage({
                    slug: name.trim().toLowerCase().replace(/\s+/g, "-"),
                    name: name.trim(),
                    version: version.trim() || "1.0.0",
                    description: description.trim(),
                    author: submitterAddress.slice(0, 8) + "...",
                    authorWallet: submitterAddress,
                    icon: icon.trim(),
                    category: (agentCategory.toLowerCase().replace(/\s+/g, "-") || "general") as "general",
                    tags,
                    distributions,
                    pricing: {
                        configPurchase: configPrice ? parseFloat(configPrice) : undefined,
                        rentalMonthly: rentalMonthly ? parseFloat(rentalMonthly) : undefined,
                        rentalUsage: rentalUsage ? parseFloat(rentalUsage) : undefined,
                        rentalPerformance: performanceShare ? parseFloat(performanceShare) : undefined,
                        hirePerTask: hirePerTask ? parseFloat(hirePerTask) : undefined,
                        currency: "USD",
                    },
                    identity: {
                        agentType: agentType || "General",
                        persona: persona || description.trim(),
                        personality: personality ? personality.split(",").map(p => p.trim()).filter(Boolean) : undefined,
                        rules: rules ? rules.split("\n").map(r => r.trim()).filter(Boolean) : undefined,
                    },
                    requiredSkills: [],
                    requiredKeys: requiredKeys.length > 0 ? requiredKeys : undefined,
                    source: "community",
                    creatorRevShare: 0.85,
                });
            } else {
                // Standard market item submission
                const pricing: MarketPricing = { model: pricingModel };
                if (pricingModel === "subscription") {
                    pricing.tiers = [];
                    if (monthlyPrice) pricing.tiers.push({ plan: "monthly", price: parseFloat(monthlyPrice), currency: "USD" });
                    if (yearlyPrice) pricing.tiers.push({ plan: "yearly", price: parseFloat(yearlyPrice), currency: "USD" });
                    if (lifetimePrice) pricing.tiers.push({ plan: "lifetime", price: parseFloat(lifetimePrice), currency: "USD" });
                }

                await submitMarketItem({
                    name: name.trim(),
                    type: type as MarketItemType,
                    category: category.trim(),
                    icon: icon.trim(),
                    description: description.trim(),
                    version: version.trim() || "1.0.0",
                    tags,
                    requiredKeys: requiredKeys.length > 0 ? requiredKeys : undefined,
                    pricing,
                    submittedBy: submitterAddress,
                });
            }

            resetForm();
            onOpenChange(false);
            onSubmitted();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to submit");
        } finally {
            setSubmitting(false);
        }
    };

    const hasValidPricing = type === "agent" || pricingModel === "free" || (monthlyPrice || yearlyPrice || lifetimePrice);
    const isValid = name.trim() && type && (type === "agent" || category.trim()) && icon.trim() && description.trim() && hasValidPricing;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Submit to Market</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="grid grid-cols-[1fr_auto] gap-3">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Name *</label>
                            <Input
                                placeholder="My Awesome Skill"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Icon *</label>
                            <Input
                                placeholder="🚀"
                                value={icon}
                                onChange={(e) => setIcon(e.target.value)}
                                className="w-20 text-center text-lg"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Type *</label>
                            <Select value={type} onValueChange={(v) => setType(v as MarketItemType)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="agent">Agent</SelectItem>
                                    <SelectItem value="mod">Mod</SelectItem>
                                    <SelectItem value="plugin">Plugin</SelectItem>
                                    <SelectItem value="skill">Skill</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Category *</label>
                            <Input
                                placeholder="e.g. Developer, Safety"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-1 block">Description *</label>
                        <Textarea
                            placeholder="Describe what this does..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={3}
                        />
                    </div>

                    {/* Agent-specific fields */}
                    {type === "agent" && (
                        <div className="space-y-3 p-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5">
                            <p className="text-xs font-medium text-cyan-400">Agent Identity</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Agent Type</label>
                                    <Select value={agentType} onValueChange={setAgentType}>
                                        <SelectTrigger className="h-8 text-sm">
                                            <SelectValue placeholder="Select type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {["Research", "Trading", "Operations", "Support", "Analytics", "Security", "Creative", "Engineering"].map(t => (
                                                <SelectItem key={t} value={t}>{t}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Category</label>
                                    <Select value={agentCategory} onValueChange={setAgentCategory}>
                                        <SelectTrigger className="h-8 text-sm">
                                            <SelectValue placeholder="Select category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {AGENT_CATEGORIES.filter(c => c !== "All").map(c => (
                                                <SelectItem key={c} value={c}>{c}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div>
                                <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Persona</label>
                                <Textarea
                                    placeholder="Short persona description..."
                                    value={persona}
                                    onChange={(e) => setPersona(e.target.value)}
                                    rows={2}
                                    className="text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Personality Traits</label>
                                <Input
                                    placeholder="analytical, concise, thorough"
                                    value={personality}
                                    onChange={(e) => setPersonality(e.target.value)}
                                    className="h-8 text-sm"
                                />
                                <p className="text-[10px] text-muted-foreground mt-0.5">Comma-separated</p>
                            </div>
                            <div>
                                <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Rules</label>
                                <Textarea
                                    placeholder="One rule per line..."
                                    value={rules}
                                    onChange={(e) => setRules(e.target.value)}
                                    rows={2}
                                    className="text-sm"
                                />
                            </div>

                            {/* Agent pricing */}
                            <p className="text-xs font-medium text-cyan-400 mt-2">Distribution Pricing</p>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Config Purchase ($)</label>
                                    <Input
                                        type="number" min="0" step="0.01"
                                        placeholder="39"
                                        value={configPrice}
                                        onChange={(e) => setConfigPrice(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Rental Monthly ($)</label>
                                    <Input
                                        type="number" min="0" step="0.01"
                                        placeholder="15"
                                        value={rentalMonthly}
                                        onChange={(e) => setRentalMonthly(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Per Request ($)</label>
                                    <Input
                                        type="number" min="0" step="0.01"
                                        placeholder="2"
                                        value={rentalUsage}
                                        onChange={(e) => setRentalUsage(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Hire Per Task ($)</label>
                                    <Input
                                        type="number" min="0" step="0.01"
                                        placeholder="5"
                                        value={hirePerTask}
                                        onChange={(e) => setHirePerTask(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Performance Share (%)</label>
                                <Input
                                    type="number" min="0" max="100" step="1"
                                    placeholder="20"
                                    value={performanceShare}
                                    onChange={(e) => setPerformanceShare(e.target.value)}
                                    className="h-8 text-sm w-24"
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground">Leave blank for fields you don't want to offer. Revenue split: Creator 85% / Platform 15% for sales, Creator 70% / Host 15% / Platform 15% for rentals.</p>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Version</label>
                            <Input
                                placeholder="1.0.0"
                                value={version}
                                onChange={(e) => setVersion(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1 block">Required Keys</label>
                            <Input
                                placeholder="API_KEY, SECRET"
                                value={requiredKeysInput}
                                onChange={(e) => setRequiredKeysInput(e.target.value)}
                            />
                            <p className="text-[10px] text-muted-foreground mt-0.5">Comma-separated</p>
                        </div>
                    </div>

                    {/* Pricing Model (non-agent types) */}
                    {type !== "agent" && <div className="space-y-3 p-3 rounded-lg border border-border bg-muted/30">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Access Model</label>
                            <Select value={pricingModel} onValueChange={(v) => setPricingModel(v as PricingModel)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="free">Free</SelectItem>
                                    <SelectItem value="subscription">Subscription (Paid)</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                {pricingModel === "free" ? "Anyone can install and use this item" : "Users pay to access — you control the pricing tiers"}
                            </p>
                        </div>
                        {pricingModel === "subscription" && (
                            <div className="grid grid-cols-3 gap-2">
                                <div>
                                    <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Monthly ($)</label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="9.99"
                                        value={monthlyPrice}
                                        onChange={(e) => setMonthlyPrice(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Yearly ($)</label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="99.99"
                                        value={yearlyPrice}
                                        onChange={(e) => setYearlyPrice(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-[11px] font-medium mb-0.5 block text-muted-foreground">Lifetime ($)</label>
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="299.99"
                                        value={lifetimePrice}
                                        onChange={(e) => setLifetimePrice(e.target.value)}
                                        className="h-8 text-sm"
                                    />
                                </div>
                                <p className="col-span-3 text-[10px] text-muted-foreground">
                                    Set at least one tier. Leave blank to skip a tier.
                                </p>
                            </div>
                        )}
                    </div>}

                    <div>
                        <label className="text-sm font-medium mb-1 block">Tags</label>
                        <Input
                            placeholder="search, api, integration"
                            value={tagsInput}
                            onChange={(e) => setTagsInput(e.target.value)}
                        />
                        <p className="text-[10px] text-muted-foreground mt-0.5">Comma-separated, used for search</p>
                    </div>

                    {error && (
                        <div className="p-2 rounded bg-red-50 dark:bg-red-950/30 text-sm text-red-600 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    <div className="flex gap-2 justify-end">
                        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={submitting || !isValid}
                            className="bg-amber-600 hover:bg-amber-700 text-black"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                    Submitting...
                                </>
                            ) : (
                                "Submit"
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
