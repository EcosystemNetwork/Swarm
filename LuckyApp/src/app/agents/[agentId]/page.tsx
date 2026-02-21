"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrg } from "@/contexts/OrgContext";
import { 
  getAgent, 
  getProjectsByOrg, 
  getTasksByOrg, 
  updateAgent,
  deleteAgent,
  type Agent, 
  type Project, 
  type Task 
} from "@/lib/firestore";

const AGENT_TYPES: Agent['type'][] = ['Research', 'Trading', 'Operations', 'Support', 'Analytics', 'Scout'];

const TYPE_COLORS: Record<string, string> = {
  Research: "bg-amber-100 text-amber-700 border-amber-200",
  Trading: "bg-emerald-100 text-emerald-700 border-green-200",
  Operations: "bg-purple-100 text-purple-700 border-purple-200",
  Support: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Analytics: "bg-cyan-100 text-cyan-700 border-cyan-200",
  Scout: "bg-amber-100 text-amber-700 border-amber-200",
};

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.agentId as string;
  const { currentOrg } = useOrg();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [assignedProjects, setAssignedProjects] = useState<Project[]>([]);
  const [agentTasks, setAgentTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  // Edit state
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<Agent['type']>('Research');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete state
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadAgentData = async () => {
    if (!currentOrg) return;

    try {
      setLoading(true);
      setError(null);

      const [agentData, allProjects, allTasks] = await Promise.all([
        getAgent(agentId),
        getProjectsByOrg(currentOrg.id),
        getTasksByOrg(currentOrg.id),
      ]);

      if (!agentData) {
        setError('Agent not found');
        return;
      }

      if (agentData.orgId !== currentOrg.id) {
        setError('Agent not found in this organization');
        return;
      }

      setAgent(agentData);

      // Filter projects that this agent is assigned to
      const assigned = allProjects.filter(project => 
        agentData.projectIds.includes(project.id)
      );
      setAssignedProjects(assigned);

      // Filter tasks assigned to this agent
      const tasks = allTasks.filter(task => 
        task.assigneeAgentId === agentId
      );
      setAgentTasks(tasks);

    } catch (err) {
      console.error('Failed to load agent data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load agent data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgentData();
  }, [agentId, currentOrg]);

  const handleStatusToggle = async () => {
    if (!agent) return;

    const newStatus = agent.status === 'online' ? 'offline' : 'online';
    
    try {
      setUpdating(true);
      await updateAgent(agentId, { status: newStatus });
      setAgent({ ...agent, status: newStatus });
    } catch (err) {
      console.error('Failed to update agent status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update agent status');
    } finally {
      setUpdating(false);
    }
  };

  const handleEditOpen = () => {
    if (!agent) return;
    setEditName(agent.name);
    setEditType(agent.type);
    setEditDescription(agent.description);
    setShowEdit(true);
  };

  const handleEditSave = async () => {
    if (!agent || !editName.trim()) return;
    try {
      setSaving(true);
      await updateAgent(agentId, { name: editName.trim(), type: editType, description: editDescription.trim() });
      setAgent({ ...agent, name: editName.trim(), type: editType, description: editDescription.trim() });
      setShowEdit(false);
    } catch (err) {
      console.error('Failed to update agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to update agent');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(true);
      await deleteAgent(agentId);
      router.push('/agents');
    } catch (err) {
      console.error('Failed to delete agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete agent');
      setDeleting(false);
    }
  };

  const formatTime = (timestamp: unknown) => {
    if (!timestamp) return 'Unknown time';
    
    let date: Date;
    if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
      date = new Date((timestamp as any).seconds * 1000);
    } else {
      date = new Date(timestamp as any);
    }
    
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (days > 0) return `${days}d ago`;
    if (hrs > 0) return `${hrs}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return "just now";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <p>Loading agent...</p>
        </div>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4">😕</div>
          <h2 className="text-xl font-bold mb-2">Agent Not Found</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button asChild variant="outline">
            <Link href="/agents">← Back to Fleet</Link>
          </Button>
        </div>
      </div>
    );
  }

  const completedTasks = agentTasks.filter(t => t.status === 'done').length;
  const activeTasks = agentTasks.filter(t => t.status === 'in_progress').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/agents" className="text-muted-foreground hover:text-amber-600 transition-colors text-lg mt-2">
          ←
        </Link>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center text-2xl font-bold text-amber-700">
            {agent.name.charAt(0)}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{agent.name}</h1>
              <Badge className={TYPE_COLORS[agent.type] || ""}>{agent.type}</Badge>
              <span className={`text-sm flex items-center gap-1.5 ${
                agent.status === "online" ? "text-emerald-600" : 
                agent.status === "busy" ? "text-orange-600" : "text-muted-foreground"
              }`}>
                <span className={`w-2.5 h-2.5 rounded-full ${
                  agent.status === "online" ? "bg-emerald-500" : 
                  agent.status === "busy" ? "bg-orange-500" : "bg-muted"
                }`} />
                {agent.status}
              </span>
            </div>
            <p className="text-muted-foreground mt-1">{agent.description}</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleStatusToggle}
              disabled={updating}
              variant={agent.status === 'online' ? 'outline' : 'default'}
              className={agent.status === 'online' ? 'hover:bg-red-50 hover:border-red-300 hover:text-red-600' : 'bg-emerald-600 hover:bg-green-700'}
            >
              {updating ? 'Updating...' : agent.status === 'online' ? 'Set Offline' : 'Set Online'}
            </Button>
            <Button variant="outline" onClick={handleEditOpen}>
              ✏️ Edit
            </Button>
            <Button variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700" onClick={() => setShowDelete(true)}>
              🗑️ Remove
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{assignedProjects.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Assigned Projects</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-foreground">{agentTasks.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Tasks</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">{completedTasks}</div>
            <div className="text-xs text-muted-foreground mt-1">Completed</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{activeTasks}</div>
            <div className="text-xs text-muted-foreground mt-1">In Progress</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Capabilities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">⚡ Capabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {agent.capabilities.map((cap, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {cap}
                </Badge>
              ))}
              {agent.capabilities.length === 0 && (
                <p className="text-sm text-muted-foreground">No capabilities defined</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Project Assignments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">📁 Project Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {assignedProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/swarms/${project.id}`}
                  className="flex items-center justify-between p-2 rounded-lg hover:bg-muted transition-colors"
                >
                  <span className="font-medium text-sm">{project.name}</span>
                  <Badge
                    className={
                      project.status === "active"
                        ? "bg-amber-100 text-amber-700"
                        : project.status === "paused"
                        ? "bg-yellow-100 text-yellow-700"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {project.status}
                  </Badge>
                </Link>
              ))}
              {assignedProjects.length === 0 && (
                <p className="text-sm text-muted-foreground">Not assigned to any projects</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Agent Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Agent</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Agent Name *</label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Agent Type *</label>
              <Select value={editType} onValueChange={(value: Agent['type']) => setEditType(value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AGENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowEdit(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={saving || !editName.trim()} className="bg-amber-600 hover:bg-amber-700">
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Agent Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Agent</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to remove <strong>{agent?.name}</strong>? This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setShowDelete(false)} disabled={deleting}>Cancel</Button>
            <Button onClick={handleDeleteConfirm} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white">
              {deleting ? 'Removing...' : '🗑️ Remove'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recent Tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">📋 Assigned Tasks</CardTitle>
          <CardDescription>Tasks currently assigned to this agent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {agentTasks.slice(0, 10).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border"
              >
                <div className="flex-1">
                  <div className="font-medium text-sm">{task.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {task.description && `${task.description.substring(0, 80)}${task.description.length > 80 ? '...' : ''}`}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Priority: {task.priority} · Created {formatTime(task.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    className={
                      task.status === "done"
                        ? "bg-emerald-100 text-emerald-700"
                        : task.status === "in_progress"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {task.status === 'in_progress' ? 'In Progress' : 
                     task.status === 'todo' ? 'To Do' : 'Done'}
                  </Badge>
                </div>
              </div>
            ))}
            {agentTasks.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <div className="text-4xl mb-3">📋</div>
                <p>No tasks assigned yet</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}