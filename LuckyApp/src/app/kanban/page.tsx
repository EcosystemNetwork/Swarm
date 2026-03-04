"use client";

import { useState, useEffect, useCallback, useRef, type DragEvent } from "react";
import {
    Plus, GripVertical, Loader2, LayoutGrid, Trash2, ChevronDown, ChevronUp,
    CheckSquare, Square, Calendar, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/contexts/OrgContext";
import { useActiveAccount } from "thirdweb/react";
import {
    type KanbanTask, type KanbanStatus, type SubTask,
    KANBAN_COLUMNS, PRIORITY_CONFIG,
    createKanbanTask, updateKanbanTask, moveTask, deleteKanbanTask,
    getKanbanTasks, groupByStatus,
} from "@/lib/kanban";

// ═══════════════════════════════════════════════════════════════
// Task Card
// ═══════════════════════════════════════════════════════════════

function TaskCard({
    task, onDelete, onUpdate,
}: {
    task: KanbanTask;
    onDelete: (id: string) => void;
    onUpdate: (id: string, updates: Partial<KanbanTask>) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const priority = PRIORITY_CONFIG[task.priority];
    const completedSubs = task.subtasks.filter(s => s.completed).length;
    const totalSubs = task.subtasks.length;

    const toggleSubtask = (subId: string) => {
        const updated = task.subtasks.map(s =>
            s.id === subId ? { ...s, completed: !s.completed } : s
        );
        onUpdate(task.id, { subtasks: updated });
    };

    return (
        <div
            draggable
            onDragStart={(e) => {
                e.dataTransfer.setData("taskId", task.id);
                e.dataTransfer.setData("fromStatus", task.status);
                e.dataTransfer.effectAllowed = "move";
            }}
            className="group cursor-grab active:cursor-grabbing"
        >
            <Card className="bg-card/80 border-border hover:border-amber-500/20 transition-all">
                <div className="p-3">
                    <div className="flex items-start gap-2">
                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 mt-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1">
                                {task.priority !== "none" && (
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${priority.dot}`} />
                                )}
                                <h4 className="text-sm font-medium leading-tight truncate">{task.title}</h4>
                            </div>

                            {task.description && (
                                <p className="text-[11px] text-muted-foreground line-clamp-2 mb-1.5">{task.description}</p>
                            )}

                            <div className="flex items-center gap-2 flex-wrap">
                                {task.assigneeName && (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                                        {task.assigneeName}
                                    </Badge>
                                )}
                                {task.dueDate && (
                                    <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                        <Calendar className="h-2.5 w-2.5" />
                                        {task.dueDate}
                                    </span>
                                )}
                                {totalSubs > 0 && (
                                    <span className={`text-[9px] flex items-center gap-0.5 ${completedSubs === totalSubs ? "text-emerald-400" : "text-muted-foreground"
                                        }`}>
                                        <CheckSquare className="h-2.5 w-2.5" />
                                        {completedSubs}/{totalSubs}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {totalSubs > 0 && (
                                <button onClick={() => setExpanded(!expanded)} className="p-0.5 rounded text-muted-foreground hover:text-foreground">
                                    {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </button>
                            )}
                            <button onClick={() => onDelete(task.id)} className="p-0.5 rounded text-muted-foreground hover:text-red-400">
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    </div>

                    {/* Subtask progress bar */}
                    {totalSubs > 0 && (
                        <div className="mt-2 h-1 bg-muted/30 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all"
                                style={{ width: `${(completedSubs / totalSubs) * 100}%` }}
                            />
                        </div>
                    )}

                    {/* Expanded subtasks */}
                    {expanded && totalSubs > 0 && (
                        <div className="mt-2 pt-2 border-t border-border space-y-1">
                            {task.subtasks.map((sub) => (
                                <button
                                    key={sub.id}
                                    onClick={() => toggleSubtask(sub.id)}
                                    className="flex items-center gap-1.5 w-full text-left py-0.5 hover:bg-muted/20 rounded px-1 -mx-1"
                                >
                                    {sub.completed
                                        ? <CheckSquare className="h-3 w-3 text-emerald-400 shrink-0" />
                                        : <Square className="h-3 w-3 text-muted-foreground shrink-0" />
                                    }
                                    <span className={`text-[11px] ${sub.completed ? "line-through text-muted-foreground" : ""}`}>
                                        {sub.title}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Column
// ═══════════════════════════════════════════════════════════════

function KanbanColumn({
    column, tasks, onDrop, onAddTask, onDeleteTask, onUpdateTask,
}: {
    column: typeof KANBAN_COLUMNS[0];
    tasks: KanbanTask[];
    onDrop: (taskId: string, newStatus: KanbanStatus) => void;
    onAddTask: (status: KanbanStatus, title: string) => void;
    onDeleteTask: (id: string) => void;
    onUpdateTask: (id: string, updates: Partial<KanbanTask>) => void;
}) {
    const [dragOver, setDragOver] = useState(false);
    const [adding, setAdding] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const taskId = e.dataTransfer.getData("taskId");
        if (taskId) onDrop(taskId, column.key);
    };

    const handleAdd = () => {
        if (newTitle.trim()) {
            onAddTask(column.key, newTitle.trim());
            setNewTitle("");
            setAdding(false);
        }
    };

    useEffect(() => {
        if (adding && inputRef.current) inputRef.current.focus();
    }, [adding]);

    return (
        <div
            onDragOver={handleDragOver}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex flex-col min-w-[240px] max-w-[280px] flex-1 rounded-xl border-t-2 transition-colors ${column.color} ${dragOver ? "bg-amber-500/5" : "bg-transparent"
                }`}
        >
            {/* Column header */}
            <div className="px-3 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <span className="text-sm">{column.icon}</span>
                    <span className="text-xs font-semibold">{column.label}</span>
                    <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 min-w-[18px] justify-center">
                        {tasks.length}
                    </Badge>
                </div>
                <button
                    onClick={() => setAdding(true)}
                    className="p-0.5 rounded text-muted-foreground hover:text-amber-400 transition-colors"
                >
                    <Plus className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Inline add */}
            {adding && (
                <div className="mx-2 mb-2">
                    <div className="flex gap-1">
                        <Input
                            ref={inputRef}
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleAdd();
                                if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
                            }}
                            placeholder="Task title..."
                            className="text-xs h-7"
                        />
                        <button onClick={() => { setAdding(false); setNewTitle(""); }} className="p-1 text-muted-foreground">
                            <X className="h-3 w-3" />
                        </button>
                    </div>
                </div>
            )}

            {/* Task cards */}
            <div className="flex-1 px-2 pb-2 space-y-1.5 overflow-y-auto max-h-[60vh]">
                {tasks.map((task) => (
                    <TaskCard key={task.id} task={task} onDelete={onDeleteTask} onUpdate={onUpdateTask} />
                ))}
                {tasks.length === 0 && !adding && (
                    <div className="py-8 text-center">
                        <p className="text-[10px] text-muted-foreground/50">Drop tasks here</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════════

export default function KanbanPage() {
    const { currentOrg } = useOrg();
    const account = useActiveAccount();
    const [tasks, setTasks] = useState<KanbanTask[]>([]);
    const [loading, setLoading] = useState(true);

    const loadTasks = useCallback(async () => {
        if (!currentOrg) return;
        try {
            setLoading(true);
            const data = await getKanbanTasks(currentOrg.id);
            setTasks(data);
        } catch (err) {
            console.error("Failed to load kanban tasks:", err);
        } finally {
            setLoading(false);
        }
    }, [currentOrg]);

    useEffect(() => { loadTasks(); }, [loadTasks]);

    const grouped = groupByStatus(tasks);

    const handleDrop = async (taskId: string, newStatus: KanbanStatus) => {
        // Optimistic update
        setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
        try {
            const col = grouped[newStatus];
            const newPos = col.length + 1;
            await moveTask(taskId, newStatus, newPos);
        } catch {
            loadTasks();
        }
    };

    const handleAddTask = async (status: KanbanStatus, title: string) => {
        if (!currentOrg) return;
        try {
            await createKanbanTask({ orgId: currentOrg.id, title, status });
            await loadTasks();
        } catch (err) {
            console.error("Failed to create task:", err);
        }
    };

    const handleDeleteTask = async (id: string) => {
        setTasks(prev => prev.filter(t => t.id !== id));
        try { await deleteKanbanTask(id); } catch { loadTasks(); }
    };

    const handleUpdateTask = async (id: string, updates: Partial<KanbanTask>) => {
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
        try { await updateKanbanTask(id, updates); } catch { loadTasks(); }
    };

    if (!account) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <LayoutGrid className="h-12 w-12 opacity-30" />
                <p>Connect your wallet to use the board</p>
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20">
                            <LayoutGrid className="h-6 w-6 text-amber-500" />
                        </div>
                        Board
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                        Kanban-style task management — drag cards between columns
                    </p>
                </div>
                <Badge variant="outline" className="text-xs">
                    {tasks.length} tasks
                </Badge>
            </div>

            {/* Board */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
                </div>
            ) : (
                <div className="flex gap-3 overflow-x-auto pb-4">
                    {KANBAN_COLUMNS.map((col) => (
                        <KanbanColumn
                            key={col.key}
                            column={col}
                            tasks={grouped[col.key]}
                            onDrop={handleDrop}
                            onAddTask={handleAddTask}
                            onDeleteTask={handleDeleteTask}
                            onUpdateTask={handleUpdateTask}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
