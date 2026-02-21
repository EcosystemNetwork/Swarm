"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
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
  type Project,
  type Agent,
  type Task,
} from "@/lib/firestore";

const TASK_STATUS_COLORS: Record<string, string> = {
  todo: "bg-gray-100 text-gray-700",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-emerald-100 text-emerald-700",
};

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "text-gray-500" },
  medium: { label: "Medium", color: "text-amber-600" },
  high: { label: "High", color: "text-orange-600" },
};

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.swarmId as string;
  const { currentOrg } = useOrg();

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
  const [taskAssignee, setTaskAssignee] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

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
          <p className="text-gray-500 mb-4">{error}</p>
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
          <Link href="/swarms" className="text-gray-400 hover:text-amber-600 transition-colors text-lg">
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
                    : "bg-gray-100 text-gray-600 border-gray-200"
                }
              >
                {project.status === "active" ? "● Active" : 
                 project.status === "paused" ? "⏸ Paused" : "✓ Done"}
              </Badge>
            </div>
            <p className="text-gray-500 mt-1">{project.description || 'No description'}</p>
          </div>
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
          <TabsTrigger value="channel">📡 Project Channel</TabsTrigger>
        </TabsList>

        {/* Agents Tab */}
        <TabsContent value="agents" className="space-y-4">
          <div className="flex justify-end">
            <Button 
              onClick={() => setShowAssignAgent(true)}
              disabled={unassignedAgents.length === 0}
              className="bg-amber-600 hover:bg-blue-700"
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
                        <span className={`text-xs ${agent.status === "online" ? "text-emerald-600" : agent.status === "busy" ? "text-orange-600" : "text-gray-400"}`}>
                          {agent.status === "online" ? "● Online" : 
                           agent.status === "busy" ? "● Busy" : "○ Offline"}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-gray-600 mb-3">{agent.description}</p>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">
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
              <div className="col-span-full text-center py-12 text-gray-400">
                <div className="text-4xl mb-3">🤖</div>
                <p>No agents assigned</p>
                <Button 
                  onClick={() => setShowAssignAgent(true)}
                  disabled={unassignedAgents.length === 0}
                  className="mt-2"
                >
                  Assign First Agent
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="flex justify-end">
            <Button 
              onClick={() => setShowCreateTask(true)}
              className="bg-amber-600 hover:bg-blue-700"
            >
              + Create Task
            </Button>
          </div>

          <div className="space-y-3">
            {tasks.map((task) => {
              const assignee = task.assigneeAgentId ? assignedAgents.find(a => a.id === task.assigneeAgentId) : null;
              const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.medium;
              return (
                <Card key={task.id} className="cursor-pointer hover:border-blue-300" 
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
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
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
              <div className="text-center py-12 text-gray-400">
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

        {/* Channel Tab */}
        <TabsContent value="channel">
          <Card>
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base">📡 Project Channel</CardTitle>
              <CardDescription>Real-time communication with project agents</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[400px] overflow-y-auto p-4 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <div className="text-4xl mb-3">💬</div>
                  <p className="text-sm">Channel integration coming soon</p>
                  <p className="text-xs text-gray-500 mt-1">Connect with agents in real-time</p>
                </div>
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
              <p className="text-sm text-gray-600">{selectedTask.description}</p>
              
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">Priority:</span>
                <Badge className={PRIORITY_LABELS[selectedTask.priority]?.color}>
                  {PRIORITY_LABELS[selectedTask.priority]?.label}
                </Badge>
              </div>
              
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-500">Status:</span>
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
    </div>
  );
}