"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useOrg } from "@/contexts/OrgContext";
import { 
  getProjectsByOrg, 
  getAgentsByOrg, 
  getTasksByOrg, 
  createProject,
  type Project, 
  type Agent, 
  type Task 
} from "@/lib/firestore";

interface ProjectWithStats extends Project {
  agentCount: number;
  taskCount: number;
  assignedAgents: Agent[];
}

export default function ProjectsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { currentOrg } = useOrg();
  const [projects, setProjects] = useState<ProjectWithStats[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const loadProjects = async () => {
    if (!currentOrg) return;

    try {
      setLoading(true);
      setError(null);

      const [projectsData, agentsData, tasksData] = await Promise.all([
        getProjectsByOrg(currentOrg.id),
        getAgentsByOrg(currentOrg.id),
        getTasksByOrg(currentOrg.id)
      ]);

      setAgents(agentsData);
      setTasks(tasksData);

      // Enrich projects with stats
      const enrichedProjects: ProjectWithStats[] = projectsData.map(project => {
        const assignedAgents = agentsData.filter(agent => 
          agent.projectIds.includes(project.id)
        );
        const projectTasks = tasksData.filter(task => 
          task.projectId === project.id
        );

        return {
          ...project,
          agentCount: assignedAgents.length,
          taskCount: projectTasks.length,
          assignedAgents
        };
      });

      setProjects(enrichedProjects);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setError(err instanceof Error ? err.message : 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, [currentOrg]);

  const handleCreateProject = async () => {
    if (!currentOrg || !name.trim()) return;

    try {
      setCreating(true);
      setError(null);

      await createProject({
        orgId: currentOrg.id,
        name: name.trim(),
        description: description.trim() || undefined,
        status: 'active',
        agentIds: [],
        createdAt: new Date(),
      });

      // Clear form and close dialog
      setName('');
      setDescription('');
      setShowCreate(false);

      // Reload projects
      await loadProjects();
    } catch (err) {
      console.error('Failed to create project:', err);
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  if (!currentOrg) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">📁 Projects</h1>
          <p className="text-gray-500 mt-1">No organization selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">📁 Projects</h1>
          <p className="text-gray-500 mt-1">
            Manage your agent projects and workflows
          </p>
        </div>
        <Button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          + Create Project
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">
          <p>Loading projects...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No projects yet</p>
          <p className="text-sm mt-1">Create your first project to get started</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/swarms/${project.id}`}>
              <Card className="hover:border-blue-300 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      <CardDescription>{project.description || 'No description'}</CardDescription>
                    </div>
                    <Badge
                      className={
                        project.status === "active"
                          ? "bg-blue-100 text-blue-700 border-blue-200"
                          : project.status === "paused"
                          ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                          : "bg-gray-100 text-gray-600 border-gray-200"
                      }
                    >
                      {project.status === "active" ? "● Active" : 
                       project.status === "paused" ? "⏸ Paused" : "✓ Done"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                    <span>🤖 {project.agentCount} Agents</span>
                    <span>🎯 {project.taskCount} Tasks</span>
                  </div>
                  <div className="flex -space-x-2">
                    {project.assignedAgents.slice(0, 4).map((agent) => (
                      <div
                        key={agent.id}
                        className="w-8 h-8 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-xs font-bold text-blue-700"
                        title={agent.name}
                      >
                        {agent.name.charAt(0)}
                      </div>
                    ))}
                    {project.assignedAgents.length > 4 && (
                      <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs font-medium text-gray-500">
                        +{project.assignedAgents.length - 4}
                      </div>
                    )}
                    {project.assignedAgents.length === 0 && (
                      <div className="text-xs text-gray-400">No agents assigned</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* Create Project Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Project Name *</label>
              <Input
                placeholder="e.g. Trading Bot Fleet"
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateProject()}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                placeholder="What is this project about?"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowCreate(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateProject}
                disabled={creating || !name.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {creating ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}