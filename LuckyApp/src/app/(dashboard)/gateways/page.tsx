/** Gateways — Connect and manage remote execution gateways for distributed agent deployment. */
"use client";

import { useState, useEffect, useCallback } from "react";
import { Network, Plus, Trash2, Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useOrg } from "@/contexts/OrgContext";
import { useAuthAddress } from "@/hooks/useAuthAddress";
import {
    type Gateway,
    GATEWAY_STATUS,
    getGateways,
    addGateway,
    deleteGateway,
} from "@/lib/gateways";

function timeAgo(d: Date | null): string {
    if (!d) return "never";
    const sec = Math.round((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return "just now";
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
}

export default function GatewaysPage() {
    const { currentOrg } = useOrg();
    const authAddress = useAuthAddress();
    const [gateways, setGateways] = useState<Gateway[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [newName, setNewName] = useState("");
    const [newUrl, setNewUrl] = useState("");
    const [adding, setAdding] = useState(false);

    const load = useCallback(async () => {
        if (!currentOrg) return;
        try {
            setLoading(true);
            setGateways(await getGateways(currentOrg.id));
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, [currentOrg]);

    useEffect(() => { load(); }, [load]);

    const handleAdd = async () => {
        if (!newName.trim() || !newUrl.trim() || !currentOrg) return;
        setAdding(true);
        try {
            await addGateway({ orgId: currentOrg.id, name: newName.trim(), url: newUrl.trim(), status: "disconnected", agentsConnected: 0 });
            setNewName(""); setNewUrl(""); setShowAdd(false);
            await load();
        } catch (err) { console.error(err); }
        finally { setAdding(false); }
    };

    const handleDelete = async (id: string) => {
        try { await deleteGateway(id); setGateways(prev => prev.filter(g => g.id !== id)); }
        catch (err) { console.error(err); }
    };

    if (!authAddress) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <Network className="h-12 w-12 opacity-30" /><p>Connect your wallet to manage gateways</p>
            </div>
        );
    }

    return (
        <div className="max-w-[900px] mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/20">
                            <Network className="h-6 w-6 text-teal-500" />
                        </div>
                        Gateways
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">Connect and manage remote execution gateways</p>
                </div>
                <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5 bg-teal-500 hover:bg-teal-600 text-black">
                    <Plus className="h-3.5 w-3.5" /> Add Gateway
                </Button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-teal-500" /></div>
            ) : gateways.length === 0 ? (
                <Card className="p-12 bg-card/80 border-border text-center">
                    <Network className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-sm font-semibold mb-1">No gateways connected</h3>
                    <p className="text-xs text-muted-foreground">Add a gateway to connect remote execution environments</p>
                </Card>
            ) : (
                <div className="space-y-2">
                    {gateways.map(gw => {
                        const cfg = GATEWAY_STATUS[gw.status];
                        return (
                            <Card key={gw.id} className="p-4 bg-card/80 border-border hover:border-teal-500/20 transition-colors">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot} animate-pulse`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="text-sm font-medium">{gw.name}</p>
                                            <Badge variant="outline" className={`text-[9px] ${cfg.color}`}>{cfg.label}</Badge>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">{gw.url}</p>
                                    </div>
                                    <div className="text-right shrink-0 mr-2">
                                        <p className="text-xs">{gw.agentsConnected} agents</p>
                                        <p className="text-[9px] text-muted-foreground">Pinged {timeAgo(gw.lastPing)}</p>
                                    </div>
                                    <button onClick={() => handleDelete(gw.id)} className="p-1.5 text-muted-foreground hover:text-red-400 transition-colors">
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Dialog open={showAdd} onOpenChange={setShowAdd}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Add Gateway</DialogTitle></DialogHeader>
                    <div className="space-y-3 py-2">
                        <Input placeholder="Gateway Name" value={newName} onChange={e => setNewName(e.target.value)} />
                        <Input placeholder="Gateway URL (https://...)" value={newUrl} onChange={e => setNewUrl(e.target.value)} />
                    </div>
                    <DialogFooter>
                        <Button onClick={handleAdd} disabled={adding || !newName.trim() || !newUrl.trim()}>
                            {adding ? "Connecting..." : "Connect Gateway"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
