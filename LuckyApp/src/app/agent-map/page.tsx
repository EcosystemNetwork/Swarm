/** Agent Map — Visual node graph of all agents showing status, connections, and workload. */
"use client";

import { useState, useEffect } from "react";
import { useOrg } from "@/contexts/OrgContext";
import { motion } from "motion/react";
import BlurText from "@/components/reactbits/BlurText";
import { AgentMap } from "@/components/agent-map";
import {
    getAgentsByOrg,
    getTasksByOrg,
    getJobsByOrg,
    getProjectsByOrg,
    type Agent,
    type Task,
    type Job,
    type Project,
} from "@/lib/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AgentMapPage() {
    const { currentOrg } = useOrg();
    const [agents, setAgents] = useState<Agent[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [jobs, setJobs] = useState<Job[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProject, setSelectedProject] = useState<string>("all");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentOrg) return;
        setLoading(true);

        Promise.all([
            getAgentsByOrg(currentOrg.id),
            getTasksByOrg(currentOrg.id),
            getJobsByOrg(currentOrg.id),
            getProjectsByOrg(currentOrg.id),
        ]).then(([a, t, j, p]) => {
            setAgents(a);
            setTasks(t);
            setJobs(j);
            setProjects(p);
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [currentOrg]);

    if (!currentOrg) {
        return (
            <div className="space-y-6">
                <BlurText text="Agent Map" className="text-3xl font-bold tracking-tight" delay={80} animateBy="words" />
                <p className="text-muted-foreground mt-1">No organization selected</p>
            </div>
        );
    }

    // Filter by selected project
    const filteredAgents = selectedProject === "all"
        ? agents
        : agents.filter(a => a.projectIds?.includes(selectedProject));

    const filteredTasks = selectedProject === "all"
        ? tasks
        : tasks.filter(t => t.projectId === selectedProject);

    const filteredJobs = selectedProject === "all"
        ? jobs
        : jobs.filter(j => j.projectId === selectedProject);

    const projectName = selectedProject === "all"
        ? currentOrg.name
        : projects.find(p => p.id === selectedProject)?.name || "Project";

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <BlurText text="Agent Map" className="text-3xl font-bold tracking-tight" delay={80} animateBy="words" />
                    <p className="text-muted-foreground mt-1">
                        Visual map of agents, tasks, and jobs
                    </p>
                </div>
                <Select value={selectedProject} onValueChange={setSelectedProject}>
                    <SelectTrigger className="w-[220px]">
                        <SelectValue placeholder="All Projects" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Projects</SelectItem>
                        {projects.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Stats */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="flex gap-4 flex-wrap"
            >
                {[
                    { label: "Agents", value: filteredAgents.length, icon: "🤖" },
                    { label: "Online", value: filteredAgents.filter(a => a.status === "online").length, icon: "🟢" },
                    { label: "Tasks", value: filteredTasks.length, icon: "🎯" },
                    { label: "Jobs", value: filteredJobs.length, icon: "💼" },
                ].map(stat => (
                    <div
                        key={stat.label}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border bg-card text-sm"
                    >
                        <span>{stat.icon}</span>
                        <span className="font-semibold">{stat.value}</span>
                        <span className="text-muted-foreground">{stat.label}</span>
                    </div>
                ))}
            </motion.div>

            {/* Map */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="rounded-xl border bg-card overflow-hidden"
                style={{ height: "calc(100vh - 320px)", minHeight: 400 }}
            >
                {loading ? (
                    <div className="flex items-center justify-center h-full text-muted-foreground">
                        Loading map...
                    </div>
                ) : filteredAgents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                        <span className="text-5xl mb-4">🗺️</span>
                        <p className="text-lg">No agents to display</p>
                        <p className="text-sm mt-1">Add agents to a project to see them on the map</p>
                    </div>
                ) : (
                    <AgentMap
                        projectName={projectName}
                        agents={filteredAgents.map(a => ({
                            id: a.id,
                            name: a.name,
                            type: a.type,
                            status: a.status,
                        }))}
                        tasks={filteredTasks.map(t => ({
                            id: t.id,
                            status: t.status,
                            assigneeAgentId: t.assigneeAgentId,
                        }))}
                        jobs={filteredJobs.map(j => ({
                            id: j.id,
                            title: j.title,
                            reward: j.reward,
                            priority: j.priority,
                            requiredSkills: j.requiredSkills,
                            status: j.status,
                        }))}
                    />
                )}
            </motion.div>
        </div>
    );
}
