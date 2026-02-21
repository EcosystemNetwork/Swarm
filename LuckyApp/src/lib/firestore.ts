import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Unsubscribe,
  type Timestamp,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { db } from "./firebase";

// ─── Types ──────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  description?: string;
  inviteCode?: string;
  ownerAddress: string;
  logoUrl?: string;
  website?: string;
  twitter?: string;
  discord?: string;
  telegram?: string;
  members: string[];
  createdAt: unknown;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'completed';
  agentIds: string[];
  createdAt: unknown;
}

export interface Agent {
  id: string;
  orgId: string;
  name: string;
  type: 'Research' | 'Trading' | 'Operations' | 'Support' | 'Analytics' | 'Scout';
  description: string;
  capabilities: string[];
  status: 'online' | 'offline' | 'busy';
  projectIds: string[];
  apiKey?: string;
  avatarUrl?: string;
  createdAt: unknown;
}

export interface Task {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  description: string;
  assigneeAgentId?: string;
  status: 'todo' | 'in_progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  createdAt: unknown;
}

export interface Channel {
  id: string;
  orgId: string;
  projectId?: string;
  name: string;
  createdAt: unknown;
}

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  senderAddress?: string;
  senderName: string;
  senderType: 'human' | 'agent';
  content: string;
  orgId?: string;
  createdAt: unknown;
}

// ─── Profiles ───────────────────────────────────────────

export interface Profile {
  walletAddress: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  updatedAt: Timestamp;
}

export async function getProfile(walletAddress: string): Promise<Profile | null> {
  const snap = await getDoc(doc(db, "profiles", walletAddress.toLowerCase()));
  if (!snap.exists()) return null;
  return snap.data() as Profile;
}

export async function setProfile(walletAddress: string, data: Partial<Profile>): Promise<void> {
  const key = walletAddress.toLowerCase();
  await setDoc(doc(db, "profiles", key), {
    ...data,
    walletAddress: key,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function getProfilesByAddresses(addresses: string[]): Promise<Map<string, Profile>> {
  const map = new Map<string, Profile>();
  if (addresses.length === 0) return map;
  // Firestore 'in' queries limited to 30, batch if needed
  const lowered = addresses.map(a => a.toLowerCase());
  for (let i = 0; i < lowered.length; i += 30) {
    const batch = lowered.slice(i, i + 30);
    const q = query(collection(db, "profiles"), where("walletAddress", "in", batch));
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      const profile = d.data() as Profile;
      map.set(profile.walletAddress, profile);
    });
  }
  return map;
}

// ─── Organizations ──────────────────────────────────────

export async function createOrganization(data: Omit<Organization, "id">): Promise<string> {
  const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const ref = await addDoc(collection(db, "organizations"), {
    ...data,
    description: data.description || "",
    inviteCode,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getOrganization(orgId: string): Promise<Organization | null> {
  const snap = await getDoc(doc(db, "organizations", orgId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Organization;
}

export async function updateOrganization(orgId: string, data: Partial<Organization>): Promise<void> {
  await updateDoc(doc(db, "organizations", orgId), data);
}

export async function getOrganizationsByWallet(walletAddress: string): Promise<Organization[]> {
  // Get orgs where user is owner OR in members array
  const ownerQuery = query(collection(db, "organizations"), where("ownerAddress", "==", walletAddress));
  const memberQuery = query(collection(db, "organizations"), where("members", "array-contains", walletAddress));
  
  const [ownerSnap, memberSnap] = await Promise.all([
    getDocs(ownerQuery),
    getDocs(memberQuery)
  ]);
  
  const orgMap = new Map<string, Organization>();
  
  // Add orgs where user is owner
  ownerSnap.docs.forEach(d => {
    orgMap.set(d.id, { id: d.id, ...d.data() } as Organization);
  });
  
  // Add orgs where user is member (avoid duplicates)
  memberSnap.docs.forEach(d => {
    if (!orgMap.has(d.id)) {
      orgMap.set(d.id, { id: d.id, ...d.data() } as Organization);
    }
  });
  
  return Array.from(orgMap.values());
}

export async function addMemberToOrganization(orgId: string, walletAddress: string): Promise<void> {
  await updateDoc(doc(db, "organizations", orgId), {
    members: arrayUnion(walletAddress)
  });
}

export async function removeMemberFromOrganization(orgId: string, walletAddress: string): Promise<void> {
  await updateDoc(doc(db, "organizations", orgId), {
    members: arrayRemove(walletAddress)
  });
}

// ─── Projects ───────────────────────────────────────────

export async function createProject(data: Omit<Project, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "projects"), {
    ...data,
    description: data.description || "",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getProject(projectId: string): Promise<Project | null> {
  const snap = await getDoc(doc(db, "projects", projectId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Project;
}

export async function getProjectsByOrg(orgId: string): Promise<Project[]> {
  const q = query(collection(db, "projects"), where("orgId", "==", orgId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Project));
}

export async function updateProject(projectId: string, data: Partial<Project>): Promise<void> {
  await updateDoc(doc(db, "projects", projectId), data);
}

export async function deleteProject(projectId: string): Promise<void> {
  await deleteDoc(doc(db, "projects", projectId));
}

export async function assignAgentToProject(projectId: string, agentId: string): Promise<void> {
  await updateDoc(doc(db, "projects", projectId), {
    agentIds: arrayUnion(agentId)
  });
  await updateDoc(doc(db, "agents", agentId), {
    projectIds: arrayUnion(projectId)
  });
}

export async function unassignAgentFromProject(projectId: string, agentId: string): Promise<void> {
  await updateDoc(doc(db, "projects", projectId), {
    agentIds: arrayRemove(agentId)
  });
  await updateDoc(doc(db, "agents", agentId), {
    projectIds: arrayRemove(projectId)
  });
}

// ─── Agents ─────────────────────────────────────────────

export async function createAgent(data: Omit<Agent, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "agents"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getAgent(agentId: string): Promise<Agent | null> {
  const snap = await getDoc(doc(db, "agents", agentId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Agent;
}

export async function getAgentsByOrg(orgId: string): Promise<Agent[]> {
  const q = query(collection(db, "agents"), where("orgId", "==", orgId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Agent));
}

export async function getUnassignedAgents(orgId: string): Promise<Agent[]> {
  const agents = await getAgentsByOrg(orgId);
  return agents.filter(agent => (agent.projectIds ?? []).length === 0);
}

export async function updateAgent(agentId: string, data: Partial<Agent>): Promise<void> {
  await updateDoc(doc(db, "agents", agentId), data);
}

export async function deleteAgent(agentId: string): Promise<void> {
  await deleteDoc(doc(db, "agents", agentId));
}

// ─── Tasks ──────────────────────────────────────────────

export async function createTask(data: Omit<Task, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "tasks"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getTask(taskId: string): Promise<Task | null> {
  const snap = await getDoc(doc(db, "tasks", taskId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Task;
}

export async function getTasksByOrg(orgId: string): Promise<Task[]> {
  const q = query(collection(db, "tasks"), where("orgId", "==", orgId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
}

export async function getTasksByProject(projectId: string): Promise<Task[]> {
  const q = query(collection(db, "tasks"), where("projectId", "==", projectId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Task));
}

export async function updateTask(taskId: string, data: Partial<Task>): Promise<void> {
  await updateDoc(doc(db, "tasks", taskId), data);
}

export async function deleteTask(taskId: string): Promise<void> {
  await deleteDoc(doc(db, "tasks", taskId));
}

// ─── Channels ───────────────────────────────────────────

export async function createChannel(data: Omit<Channel, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "channels"), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getChannel(channelId: string): Promise<Channel | null> {
  const snap = await getDoc(doc(db, "channels", channelId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Channel;
}

export async function getChannelsByOrg(orgId: string): Promise<Channel[]> {
  const q = query(collection(db, "channels"), where("orgId", "==", orgId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Channel));
}

export async function ensureGeneralChannel(orgId: string): Promise<string> {
  const channels = await getChannelsByOrg(orgId);
  const generalChannel = channels.find(c => c.name.toLowerCase() === 'general');
  
  if (generalChannel) {
    return generalChannel.id;
  }
  
  // Create General channel
  return await createChannel({
    orgId,
    name: 'General',
    createdAt: new Date(),
  });
}

export async function getChannelsByProject(projectId: string): Promise<Channel[]> {
  const q = query(collection(db, "channels"), where("projectId", "==", projectId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Channel));
}

export async function getOrCreateProjectChannel(
  projectId: string,
  orgId: string,
  projectName: string
): Promise<Channel> {
  const q = query(
    collection(db, "channels"),
    where("orgId", "==", orgId),
    where("projectId", "==", projectId)
  );
  const snap = await getDocs(q);

  if (!snap.empty) {
    const d = snap.docs[0];
    return { id: d.id, ...d.data() } as Channel;
  }

  const id = await createChannel({
    orgId,
    projectId,
    name: `${projectName} Channel`,
    createdAt: new Date(),
  });

  return { id, orgId, projectId, name: `${projectName} Channel`, createdAt: new Date() };
}

// ─── Messages ───────────────────────────────────────────

export async function sendMessage(data: Omit<Message, "id">): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { createdAt: _ca, ...rest } = data;
  const ref = await addDoc(collection(db, "messages"), {
    ...rest,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export function onMessagesByChannel(
  channelId: string,
  callback: (messages: Message[]) => void
): Unsubscribe {
  const q = query(
    collection(db, "messages"),
    where("channelId", "==", channelId),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as Message)));
  });
}

export async function getMessagesByChannel(channelId: string): Promise<Message[]> {
  const q = query(
    collection(db, "messages"),
    where("channelId", "==", channelId),
    orderBy("createdAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Message));
}

// ─── Jobs ────────────────────────────────────────────────

export interface Job {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  description: string;
  status: 'open' | 'claimed' | 'closed' | 'in_progress' | 'completed';
  reward?: string;
  requiredSkills: string[];
  postedByAddress: string;
  takenByAgentId?: string;
  priority: 'low' | 'medium' | 'high';
  completedAt?: unknown;
  completedByAgentName?: string;
  createdAt: unknown;
  updatedAt?: unknown;
}

export async function createJob(data: Omit<Job, "id">): Promise<string> {
  const ref = await addDoc(collection(db, "jobs"), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getJobsByOrg(orgId: string): Promise<Job[]> {
  const q = query(collection(db, "jobs"), where("orgId", "==", orgId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Job));
}

export async function getJobsByProject(projectId: string): Promise<Job[]> {
  const q = query(collection(db, "jobs"), where("projectId", "==", projectId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Job));
}

export async function getOpenJobs(orgId: string): Promise<Job[]> {
  const q = query(collection(db, "jobs"), where("orgId", "==", orgId), where("status", "==", "open"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as Job));
}

export async function claimJob(jobId: string, agentId: string, orgId: string, projectId: string): Promise<string> {
  // Update job status
  await updateDoc(doc(db, "jobs", jobId), {
    status: "in_progress",
    takenByAgentId: agentId,
    updatedAt: serverTimestamp(),
  });
  // Auto-create a task for the claiming agent
  const job = await getDoc(doc(db, "jobs", jobId));
  const jobData = job.data();
  const taskId = await createTask({
    orgId,
    projectId,
    title: jobData?.title || "Job task",
    description: `From job: ${jobData?.description || ""}`,
    assigneeAgentId: agentId,
    status: "todo",
    priority: jobData?.priority || "medium",
    createdAt: new Date(),
  });
  return taskId;
}

export async function closeJob(jobId: string): Promise<void> {
  await updateDoc(doc(db, "jobs", jobId), {
    status: "completed",
    updatedAt: serverTimestamp(),
  });
}

export async function updateJob(jobId: string, data: Partial<Job>): Promise<void> {
  await updateDoc(doc(db, "jobs", jobId), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteJob(jobId: string): Promise<void> {
  await deleteDoc(doc(db, "jobs", jobId));
}

// ─── Statistics & Analytics ─────────────────────────────

export async function getOrgStats(orgId: string) {
  const [projects, agents, tasks, jobs] = await Promise.all([
    getProjectsByOrg(orgId),
    getAgentsByOrg(orgId),
    getTasksByOrg(orgId),
    getJobsByOrg(orgId),
  ]);

  return {
    projectCount: projects.length,
    agentCount: agents.length,
    taskCount: tasks.length,
    completedTasks: tasks.filter(t => t.status === 'done').length,
    activeTasks: tasks.filter(t => t.status === 'in_progress').length,
    todoTasks: tasks.filter(t => t.status === 'todo').length,
    jobCount: jobs.length,
    openJobs: jobs.filter(j => j.status === 'open').length,
    claimedJobs: jobs.filter(j => j.status === 'claimed').length,
    closedJobs: jobs.filter(j => j.status === 'closed').length,
  };
}