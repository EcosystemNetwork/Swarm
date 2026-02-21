"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import dynamic from "next/dynamic";
import Link from "next/link";

const AgentMap = dynamic(() => import("@/components/agent-map/agent-map"), { ssr: false });
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useOrg } from "@/contexts/OrgContext";
import {
  getProject,
  getAgentsByOrg,
  getTasksByProject,
  getUnassignedAgents,
  assignAgentToProject,
  unassignAgentFromProject,
  createTask,
  updateTask,
  getOrCreateProjectChannel,
  sendMessage,
  onMessagesByChannel,
  type Project,
  type Agent,
  type Task,
  type Message,
  type Channel,
  updateProject,
  deleteProject,
} from "@/lib/firestore";

const TASK_STATUS_COLORS: Record<string, string> = {
  todo: "bg-muted text-muted-foreground",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
};

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "text-muted-foreground" },
  medium: { label: "Medium", color: "text-amber-600" },
  high: { label: "High", color: "text-orange-600" },
};

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.swarmId as string;
  const { currentOrg } = useOrg();
  const account = useActiveAccount();

  const [project, setProject] = useState<Project | null>(null);
  const [assignedAgents, setAssignedAgents] = useState<Agent[]>([]);
  const [unassignedAgents, setUnassignedAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog states
  const [showAssignAgent, setShowAssignAgent] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showTaskDetail, setShowTaskDetail] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Form states
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [showEditProject, setShowEditProject] = useState(false);
  const [showDeleteProject, setShowDeleteProject] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const router = useRouter();
  const [taskAssignee, setTaskAssignee] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Chat state
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadProjectData = async () => {
    if (!currentOrg) return;

    try {
      setLoading(true);
      setError(null);

      const [projectData, allAgents, projectTasks] = await Promise.all([
        getProject(projectId),
        getAgentsByOrg(currentOrg.id),
        getTasksByProject(projectId),
      ]);

      if (!projectData) {
        setError('Project not found');
        return;
      }

      setProject(projectData);

      // Split agents into assigned and unassigned
      const assigned = allAgents.filter(agent => agent.projectIds.includes(projectId));
      const unassigned = allAgents.filter(agent => !agent.projectIds.includes(projectId));

      setAssignedAgents(assigned);
      setUnassignedAgents(unassigned);
      setTasks(projectTasks);
    } catch (err) {
      console.error('Failed to load project data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load project data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjectData();
  }, [projectId, currentOrg]);

  // Auto-create project channel & subscribe to messages
  useEffect(() => {
    if (!currentOrg || !project) return;
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const ch = await getOrCreateProjectChannel(projectId, currentOrg.id, project.name);
        setChannel(ch);
        unsub = onMessagesByChannel(ch.id, (msgs) => {
          setMessages(msgs);
        });
      } catch (err) {
        console.error('Failed to setup project channel:', err);
      }
    })();

    return () => { unsub?.(); };
  }, [projectId, currentOrg, project]);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendChat = async () => {
    if (!chatInput.trim() || !channel || !currentOrg) return;
    const addr = account?.address || 'anonymous';
    try {
      setSendingChat(true);
      await sendMessage({
        channelId: channel.id,
        senderId: addr,
        senderName: addr.slice(0, 6) + '...' + addr.slice(-4),
        senderType: 'human',
        content: chatInput.trim(),
        orgId: currentOrg.id,
        createdAt: new Date(),
      });
      setChatInput('');
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSendingChat(false);
    }
  };

  const handleAssignAgent = async () => {
    if (!selectedAgentId) return;

    try {
      await assignAgentToProject(projectId, selectedAgentId);
      setSelectedAgentId('');
      setShowAssignAgent(false);
      await loadProjectData();
    } catch (err) {
      console.error('Failed to assign agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to assign agent');
    }
  };

  const handleUnassignAgent = async (agentId: string) => {
    try {
      await unassignAgentFromProject(projectId, agentId);
      await loadProjectData();
    } catch (err) {
      console.error('Failed to unassign agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to unassign agent');
    }
  };

  const handleCreateTask = async () => {
    if (!currentOrg || !taskTitle.trim()) return;

    try {
      setCreating(true);
      await createTask({
        orgId: currentOrg.id,
        projectId,
        title: taskTitle.trim(),
        description: taskDescription.trim(),
        assigneeAgentId: taskAssignee || undefined,
        status: 'todo',
        priority: taskPriority,
        createdAt: new Date(),
      });

      // Reset form
      setTaskTitle('');
      setTaskDescription('');
      setTaskPriority('medium');
      setTaskAssignee('');
      setShowCreateTask(false);

      await loadProjectData();
    } catch (err) {
      console.error('Failed to create task:', err);
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateTaskStatus = async (task: Task, newStatus: Task['status']) => {
    try {
      setUpdating(true);
      await updateTask(task.id, { status: newStatus });
      await loadProjectData();
    } catch (err) {
      console.error('Failed to update task:', err);
      setError(err instanceof Error ? err.message : 'Failed to update task');
    } finally {
      setUpdating(false);
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
          <p>Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-4">😕</div>
          <h2 className="text-xl font-bold mb-2">Project Not Found</h2>
          <p className="text-muted-foreground mb-4">{error}</p>
          <Button asChild variant="outline">
            <Link href="/swarms">← Back to Projects</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Link href="/swarms" className="text-muted-foreground hover:text-amber-600 transition-colors text-lg">
            ←
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
              <Badge
                className={
                  project.status === "active"
                    ? "bg-amber-100 text-amber-700 border-amber-200"
                    : project.status === "paused"
                    ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                    : "bg-muted text-muted-foreground border-border"
                }
              >
                {project.status === "active" ? "● Active" : 
                 project.status === "paused" ? "⏸ Paused" : "✓ Done"}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1">{project.description || 'No description'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setEditName(project.name); setEditDescription(project.description || ''); setShowEditProject(true); }}>✏️ Edit</Button>
          <Button variant="outline" size="sm" className="text-red-400 border-red-400 hover:bg-red-500/10" onClick={() => setShowDeleteProject(true)}>🗑️ Delete</Button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      <Tabs defaultValue="agents">
        <TabsList>
          <TabsTrigger value="agents">🤖 Agents ({assignedAgents.length})</TabsTrigger>
          <TabsTrigger value="tasks">📋 Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="map">🗺️ Agent Map</TabsTrigger>
          <TabsTrigger value="channel">📡 Project Channel</TabsTrigger>
        </TabsList>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          <div className="flex justify-end">
            <Button 
              onClick={() => setShowAssignAgent(true)}
              disabled={unassignedAgents.length === 0}
              className="bg-amber-600 hover:bg-amber-600"
            >
              + Assign Agent
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {assignedAgents.map((agent) => (
              <Card key={agent.id} className="relative">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-lg font-bold text-amber-700">
                      {agent.name.charAt(0)}
                    </div>
                    <div>
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge variant="secondary" className="text-xs">{agent.type}</Badge>
                        <span className={`text-xs ${agent.status === "online" ? "text-emerald-600" : agent.status === "busy" ? "text-orange-600" : "text-muted-foreground"}`}>
                          {agent.status === "online" ? "● Online" : 
                           agent.status === "busy" ? "● Busy" : "○ Offline"}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground mb-3">{agent.description}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      {agent.capabilities.length} capabilities
                    </span>
                    <Button
                      variant="outline" 
                      size="sm"
                      onClick={() => handleUnassignAgent(agent.id)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {assignedAgents.length === 0 && (
              <div className="col-span-full text-center py-12 text-muted-foreground">
                <div className="text-4xl mb-3">🤖</div>
                <p>No agents assigned</p>
                {unassignedAgents.length > 0 ? (
                  <Button 
                    onClick={() => setShowAssignAgent(true)}
                    className="mt-2"
                  >
                    Assign First Agent
                  </Button>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm">No agents in your organization yet</p>
                    <Link href="/agents">
                      <Button className="bg-amber-500 hover:bg-amber-600 text-black">
                        + Register Your First Agent
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex justify-end">
            <Button 
              onClick={() => setShowCreateTask(true)}
              className="bg-amber-600 hover:bg-amber-600"
            >
              + Create Task
            </Button>
          </div>

          <div className="space-y-3">
            {tasks.map((task) => {
              const assignee = task.assigneeAgentId ? assignedAgents.find(a => a.id === task.assigneeAgentId) : null;
              const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.medium;
              return (
                <Card key={task.id} className="cursor-pointer hover:border-amber-300" 
                      onClick={() => { setSelectedTask(task); setShowTaskDetail(true); }}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{task.title}</h3>
                          <Badge className={TASK_STATUS_COLORS[task.status] || ""}>
                            {task.status === 'in_progress' ? 'In Progress' : 
                             task.status === 'todo' ? 'To Do' : 'Done'}
                          </Badge>
                        </div>
                        <CardDescription>{task.description}</CardDescription>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className={priority.color}>● {priority.label}</span>
                          {assignee && <span>🤖 {assignee.name}</span>}
                          <span>Created {formatTime(task.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {tasks.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <div className="text-4xl mb-3">🎯</div>
                <p>No tasks yet</p>
                <Button 
                  onClick={() => setShowCreateTask(true)}
                  className="mt-2"
                >
                  Create First Task
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Agent Map Tab */}
        <TabsContent value="map">
          <AgentMap
            projectName={project.name}
            agents={assignedAgents.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.type,
              status: a.status,
            }))}
            tasks={tasks.map((t) => ({
              id: t.id,
              status: t.status,
              assigneeAgentId: t.assigneeAgentId,
            }))}
          />
        </TabsContent>

        {/* Channel Tab */}
        <TabsContent value="channel">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base">📡 Project Channel</CardTitle>
              <CardDescription>
                Real-time communication with project agents
                {channel && <span className="ml-2 text-xs opacity-50">ID: {channel.id}</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex flex-col" style={{ height: '500px' }}>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <div className="text-center">
                      <div className="text-4xl mb-3">💬</div>
                      <p className="text-sm">No messages yet — say hello!</p>
                    </div>
                  </div>
                )}
                {messages.map((msg) => {
                  const isAgent = msg.senderType === 'agent';
                  const ts = msg.createdAt && typeof msg.createdAt === 'object' && 'seconds' in msg.createdAt
                    ? new Date((msg.createdAt as { seconds: number }).seconds * 1000)
                    : msg.createdAt instanceof Date ? msg.createdAt : null;
                  return (
                    <div key={msg.id} className={`flex gap-3 ${isAgent ? '' : ''}`}>
                      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm" 
                           style={{ background: isAgent ? 'rgba(139,92,246,0.15)' : 'rgba(245,158,11,0.15)' }}>
                        {isAgent ? '🤖' : '👤'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium text-sm">{msg.senderName}</span>
                          {isAgent && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              Agent
                            </Badge>
                          )}
                          {ts && (
                            <span className="text-[10px] text-muted-foreground">
                              {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground/90 break-words">{msg.content}</p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              {/* Input */}
              <div className="border-t p-3 flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                  disabled={sendingChat || !channel}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendChat}
                  disabled={sendingChat || !chatInput.trim() || !channel}
                  className="bg-amber-600 hover:bg-amber-700"
                >
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Assign Agent Dialog */}
      <Dialog open={showAssignAgent} onOpenChange={setShowAssignAgent}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Agent to Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Select Agent</label>
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an agent" />
                </SelectTrigger>
                <SelectContent>
                  {unassignedAgents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name} ({agent.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowAssignAgent(false)}>
                Cancel
              </Button>
              <Button onClick={handleAssignAgent} disabled={!selectedAgentId}>
                Assign Agent
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Task Dialog */}
      <Dialog open={showCreateTask} onOpenChange={setShowCreateTask}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Title *</label>
              <Input
                placeholder="Task title"
                value={taskTitle}
                onChange={e => setTaskTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                placeholder="Task description"
                value={taskDescription}
                onChange={e => setTaskDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Priority</label>
                <Select value={taskPriority} onValueChange={(value: any) => setTaskPriority(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Assignee</label>
                <Select value={taskAssignee} onValueChange={setTaskAssignee}>
                  <SelectTrigger>
                    <SelectValue placeholder="Unassigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Unassigned</SelectItem>
                    {assignedAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowCreateTask(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTask} disabled={creating || !taskTitle.trim()}>
                {creating ? 'Creating...' : 'Create Task'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Task Detail Dialog */}
      {selectedTask && (
        <Dialog open={showTaskDetail} onOpenChange={setShowTaskDetail}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{selectedTask.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{selectedTask.description}</p>
              
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Priority:</span>
                <Badge className={PRIORITY_LABELS[selectedTask.priority]?.color}>
                  {PRIORITY_LABELS[selectedTask.priority]?.label}
                </Badge>
              </div>
              
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Status:</span>
                <div className="flex gap-2">
                  {(['todo', 'in_progress', 'done'] as const).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={selectedTask.status === status ? 'default' : 'outline'}
                      onClick={() => handleUpdateTaskStatus(selectedTask, status)}
                      disabled={updating}
                    >
                      {status === 'in_progress' ? 'In Progress' : 
                       status === 'todo' ? 'To Do' : 'Done'}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Project Dialog */}
      <Dialog open={showEditProject} onOpenChange={setShowEditProject}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Project</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div><label className="text-sm font-medium">Name</label><Input value={editName} onChange={e => setEditName(e.target.value)} /></div>
            <div><label className="text-sm font-medium">Description</label><Input value={editDescription} onChange={e => setEditDescription(e.target.value)} /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowEditProject(false)}>Cancel</Button>
              <Button className="bg-amber-500 hover:bg-amber-600 text-black" onClick={async () => {
                await updateProject(projectId, { name: editName.trim(), description: editDescription.trim() || '' });
                setProject(p => p ? { ...p, name: editName.trim(), description: editDescription.trim() || '' } : p);
                setShowEditProject(false);
              }}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Project Dialog */}
      <Dialog open={showDeleteProject} onOpenChange={setShowDeleteProject}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Project</DialogTitle></DialogHeader>
          <p className="text-muted-foreground py-2">Are you sure you want to delete &quot;{project?.name}&quot;? This cannot be undone.</p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowDeleteProject(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={async () => {
              await deleteProject(projectId);
              router.push('/swarms');
            }}>Delete Project</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}