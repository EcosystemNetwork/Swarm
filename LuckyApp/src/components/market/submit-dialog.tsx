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
import { type MarketItemType, submitMarketItem } from "@/lib/skills";

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
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resetForm = () => {
        setName("");
        setType("");
        setCategory("");
        setIcon("");
        setDescription("");
        setVersion("1.0.0");
        setTagsInput("");
        setRequiredKeysInput("");
        setError(null);
    };

    const handleSubmit = async () => {
        if (!name.trim() || !type || !category.trim() || !icon.trim() || !description.trim()) return;

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

            await submitMarketItem({
                name: name.trim(),
                type: type as MarketItemType,
                category: category.trim(),
                icon: icon.trim(),
                description: description.trim(),
                version: version.trim() || "1.0.0",
                tags,
                requiredKeys: requiredKeys.length > 0 ? requiredKeys : undefined,
                submittedBy: submitterAddress,
            });

            resetForm();
            onOpenChange(false);
            onSubmitted();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to submit");
        } finally {
            setSubmitting(false);
        }
    };

    const isValid = name.trim() && type && category.trim() && icon.trim() && description.trim();

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
