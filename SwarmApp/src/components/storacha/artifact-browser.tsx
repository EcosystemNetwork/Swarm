/**
 * Artifact Browser — Browsable list of CID-backed artifacts uploaded to Storacha
 *
 * Displays artifact records from Firestore with type filtering, search,
 * and actions (preview, download, copy CID). Used as a tab on the Memory page.
 */
"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Search, Upload, FileText, Image, FileCode, FileBarChart,
    Loader2, Copy, ExternalLink, Download, HardDrive, Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/contexts/OrgContext";
import { useAuthAddress } from "@/hooks/useAuthAddress";
import { getArtifactRecords } from "@/lib/storacha/cid-index";
import { UploadArtifactDialog, ARTIFACT_TYPE_CONFIG } from "./upload-artifact-dialog";
import type { ArtifactRecord, ArtifactType } from "@/lib/storacha/types";

function timeAgo(d: Date | null): string {
    if (!d) return "--";
    const sec = Math.round((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return "just now";
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
}

function fmtSize(bytes: number): string {
    if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
    if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
    return `${bytes} B`;
}

function cidShort(cid: string): string {
    if (cid.length <= 16) return cid;
    return `${cid.slice(0, 8)}...${cid.slice(-6)}`;
}

function getGatewayUrl(cid: string): string {
    return `https://${cid}.ipfs.storacha.link/`;
}

function isImageMime(mime: string): boolean {
    return mime.startsWith("image/");
}

export function ArtifactBrowser() {
    const { currentOrg } = useOrg();
    const authAddress = useAuthAddress();
    const [artifacts, setArtifacts] = useState<ArtifactRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<ArtifactType | "all">("all");
    const [showUpload, setShowUpload] = useState(false);
    const [copiedCid, setCopiedCid] = useState<string | null>(null);
    const [previewCid, setPreviewCid] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!currentOrg) return;
        try {
            setLoading(true);
            const data = await getArtifactRecords(
                currentOrg.id,
                typeFilter === "all" ? undefined : { artifactType: typeFilter },
            );
            setArtifacts(data);
        } catch (err) {
            console.error("Failed to load artifacts:", err);
        } finally {
            setLoading(false);
        }
    }, [currentOrg, typeFilter]);

    useEffect(() => { load(); }, [load]);

    const filtered = searchQuery
        ? artifacts.filter(a =>
            a.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.contentCid.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.uploadedBy.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : artifacts;

    const handleCopy = useCallback(async (cid: string) => {
        await navigator.clipboard.writeText(cid);
        setCopiedCid(cid);
        setTimeout(() => setCopiedCid(null), 2000);
    }, []);

    if (!authAddress) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-muted-foreground">
                <HardDrive className="h-12 w-12 opacity-30" />
                <p>Connect your wallet to browse artifacts</p>
            </div>
        );
    }

    return (
        <>
            {/* Toolbar */}
            <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                        placeholder="Search by filename or CID..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 h-9 text-sm"
                    />
                </div>

                {/* Type filter chips */}
                <div className="flex gap-1 bg-muted/30 rounded-lg p-0.5">
                    <button
                        onClick={() => setTypeFilter("all")}
                        className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${
                            typeFilter === "all"
                                ? "bg-purple-500/20 text-purple-400"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >All</button>
                    {(Object.entries(ARTIFACT_TYPE_CONFIG) as [ArtifactType, typeof ARTIFACT_TYPE_CONFIG["screenshot"]][]).map(
                        ([type, cfg]) => (
                            <button
                                key={type}
                                onClick={() => setTypeFilter(type)}
                                className={`px-2.5 py-1 text-[10px] rounded-md transition-colors ${
                                    typeFilter === type
                                        ? "bg-purple-500/20 text-purple-400"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                {cfg.label}
                            </button>
                        ),
                    )}
                </div>

                <Button
                    size="sm"
                    onClick={() => setShowUpload(true)}
                    className="bg-purple-600 hover:bg-purple-700 h-9"
                >
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    Upload
                </Button>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
                </div>
            ) : filtered.length === 0 ? (
                <Card className="p-12 bg-card/80 border-border text-center">
                    <HardDrive className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-sm font-semibold mb-1">
                        {searchQuery ? "No matching artifacts" : "No artifacts yet"}
                    </h3>
                    <p className="text-xs text-muted-foreground mb-4">
                        {searchQuery
                            ? "Try a different search term"
                            : "Upload screenshots, logs, outputs, or reports to decentralized storage"
                        }
                    </p>
                    {!searchQuery && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowUpload(true)}
                        >
                            <Upload className="h-3.5 w-3.5 mr-1.5" />
                            Upload First Artifact
                        </Button>
                    )}
                </Card>
            ) : (
                <div className="space-y-1.5">
                    {filtered.map(artifact => {
                        const cfg = ARTIFACT_TYPE_CONFIG[artifact.artifactType];
                        const Icon = cfg?.icon || FileText;
                        const isPreviewing = previewCid === artifact.contentCid;
                        const isImage = isImageMime(artifact.mimeType);

                        return (
                            <Card
                                key={artifact.id}
                                className="bg-card/80 border-border hover:border-purple-500/20 transition-colors"
                            >
                                <div className="p-3">
                                    <div className="flex items-center gap-2.5">
                                        <Icon className={`h-4 w-4 shrink-0 ${cfg?.color || "text-muted-foreground"}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium truncate">{artifact.filename}</p>
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[9px] ${cfg?.color || ""}`}
                                                >
                                                    {cfg?.label || artifact.artifactType}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                                                <span className="font-mono">{cidShort(artifact.contentCid)}</span>
                                                <span>&middot; {fmtSize(artifact.sizeBytes)}</span>
                                                <span>&middot; {artifact.uploadedBy}</span>
                                                <span>&middot; {timeAgo(artifact.createdAt)}</span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button
                                                onClick={() => handleCopy(artifact.contentCid)}
                                                className="p-1.5 rounded hover:bg-muted/50 transition-colors"
                                                title="Copy CID"
                                            >
                                                {copiedCid === artifact.contentCid ? (
                                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                                ) : (
                                                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                                                )}
                                            </button>
                                            {isImage && (
                                                <button
                                                    onClick={() => setPreviewCid(isPreviewing ? null : artifact.contentCid)}
                                                    className={`p-1.5 rounded hover:bg-muted/50 transition-colors ${
                                                        isPreviewing ? "bg-purple-500/10" : ""
                                                    }`}
                                                    title="Preview"
                                                >
                                                    <Image className="h-3.5 w-3.5 text-muted-foreground" />
                                                </button>
                                            )}
                                            <a
                                                href={getGatewayUrl(artifact.contentCid)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1.5 rounded hover:bg-muted/50 transition-colors"
                                                title="Open in IPFS Gateway"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                            </a>
                                            <a
                                                href={`/api/v1/artifacts/${artifact.contentCid}?orgId=${encodeURIComponent(currentOrg?.id || "")}`}
                                                download={artifact.filename}
                                                className="p-1.5 rounded hover:bg-muted/50 transition-colors"
                                                title="Download"
                                            >
                                                <Download className="h-3.5 w-3.5 text-muted-foreground" />
                                            </a>
                                        </div>
                                    </div>

                                    {/* Image preview */}
                                    {isPreviewing && isImage && (
                                        <div className="mt-3 pt-3 border-t border-border">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={getGatewayUrl(artifact.contentCid)}
                                                alt={artifact.filename}
                                                className="max-w-full max-h-64 rounded-lg border border-border object-contain"
                                            />
                                        </div>
                                    )}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Upload dialog */}
            {currentOrg && authAddress && (
                <UploadArtifactDialog
                    open={showUpload}
                    onOpenChange={setShowUpload}
                    orgId={currentOrg.id}
                    walletAddress={authAddress}
                    onUploaded={() => load()}
                />
            )}
        </>
    );
}
