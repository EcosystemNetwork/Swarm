/**
 * Upload Artifact Dialog — Modal for uploading files to Storacha
 *
 * Provides drag-and-drop or click-to-select file upload with artifact type
 * selection. Uploads via POST /api/v1/artifacts/upload.
 */
"use client";

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from "react";
import { Upload, X, FileText, Image, FileCode, FileBarChart, Loader2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { uploadArtifact, type ArtifactUploadResult } from "@/lib/storacha/api";
import type { ArtifactType } from "@/lib/storacha/types";

const ARTIFACT_TYPE_CONFIG: Record<ArtifactType, { label: string; icon: typeof FileText; color: string }> = {
    screenshot: { label: "Screenshot", icon: Image, color: "text-blue-400" },
    output: { label: "Output", icon: FileCode, color: "text-emerald-400" },
    log: { label: "Log", icon: FileText, color: "text-amber-400" },
    report: { label: "Report", icon: FileBarChart, color: "text-purple-400" },
};

function fmtSize(bytes: number): string {
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
    return `${bytes} B`;
}

interface UploadArtifactDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    orgId: string;
    walletAddress: string;
    onUploaded?: (result: ArtifactUploadResult) => void;
}

export function UploadArtifactDialog({
    open,
    onOpenChange,
    orgId,
    walletAddress,
    onUploaded,
}: UploadArtifactDialogProps) {
    const [file, setFile] = useState<File | null>(null);
    const [artifactType, setArtifactType] = useState<ArtifactType>("output");
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const reset = useCallback(() => {
        setFile(null);
        setArtifactType("output");
        setError(null);
        setUploading(false);
    }, []);

    const handleClose = useCallback((open: boolean) => {
        if (!open) reset();
        onOpenChange(open);
    }, [onOpenChange, reset]);

    const handleDrop = useCallback((e: DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const dropped = e.dataTransfer.files[0];
        if (dropped) {
            setFile(dropped);
            setError(null);
            // Auto-detect type from mime
            if (dropped.type.startsWith("image/")) setArtifactType("screenshot");
            else if (dropped.type === "text/plain" || dropped.name.endsWith(".log")) setArtifactType("log");
        }
    }, []);

    const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            setFile(selected);
            setError(null);
            if (selected.type.startsWith("image/")) setArtifactType("screenshot");
            else if (selected.type === "text/plain" || selected.name.endsWith(".log")) setArtifactType("log");
        }
    }, []);

    const handleUpload = useCallback(async () => {
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) {
            setError("File exceeds 50 MB limit");
            return;
        }

        setUploading(true);
        setError(null);
        try {
            const result = await uploadArtifact(file, orgId, artifactType, walletAddress);
            onUploaded?.(result);
            handleClose(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    }, [file, orgId, artifactType, walletAddress, onUploaded, handleClose]);

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md bg-card border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Upload className="h-4 w-4 text-purple-400" />
                        Upload Artifact
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Drop zone */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => inputRef.current?.click()}
                        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                            dragOver
                                ? "border-purple-500 bg-purple-500/5"
                                : file
                                    ? "border-emerald-500/30 bg-emerald-500/5"
                                    : "border-border hover:border-muted-foreground/30"
                        }`}
                    >
                        <input
                            ref={inputRef}
                            type="file"
                            className="hidden"
                            onChange={handleFileChange}
                        />
                        {file ? (
                            <div className="flex items-center justify-center gap-3">
                                <FileText className="h-8 w-8 text-emerald-400" />
                                <div className="text-left">
                                    <p className="text-sm font-medium truncate max-w-[200px]">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">{fmtSize(file.size)} &middot; {file.type || "unknown"}</p>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                    className="ml-2 p-1 rounded hover:bg-muted/50"
                                >
                                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                            </div>
                        ) : (
                            <>
                                <Upload className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                                <p className="text-sm text-muted-foreground">
                                    Drop a file here or click to browse
                                </p>
                                <p className="text-[10px] text-muted-foreground/60 mt-1">Max 50 MB</p>
                            </>
                        )}
                    </div>

                    {/* Artifact type selector */}
                    <div>
                        <label className="text-xs text-muted-foreground mb-1.5 block">Artifact Type</label>
                        <Select
                            value={artifactType}
                            onValueChange={(v) => setArtifactType(v as ArtifactType)}
                        >
                            <SelectTrigger className="h-9 text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.entries(ARTIFACT_TYPE_CONFIG) as [ArtifactType, typeof ARTIFACT_TYPE_CONFIG["screenshot"]][]).map(
                                    ([type, cfg]) => {
                                        const Icon = cfg.icon;
                                        return (
                                            <SelectItem key={type} value={type}>
                                                <span className="flex items-center gap-2">
                                                    <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                                                    {cfg.label}
                                                </span>
                                            </SelectItem>
                                        );
                                    },
                                )}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Error */}
                    {error && (
                        <p className="text-xs text-red-400 bg-red-500/10 rounded px-3 py-2">{error}</p>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleClose(false)}
                            disabled={uploading}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleUpload}
                            disabled={!file || uploading}
                            className="bg-purple-600 hover:bg-purple-700"
                        >
                            {uploading ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                                    Upload to IPFS
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export { ARTIFACT_TYPE_CONFIG };
