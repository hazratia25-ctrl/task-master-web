import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { createProject, deleteTask, flushQueue, loadProject, saveTask, subscribeProject } from "./lib/projects";
import { supabase } from "./lib/supabase";
import type { ProjectState, Task } from "./types";
import "./styles.css";

const makeTask = (projectId: string, ownerId: string, title: string): Task => {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), project_id: projectId, owner_id: ownerId, title, description: "", status: "TODO", priority: "MEDIUM", due_at: null, created_at: now, updated_at: now };
};

function App() {
  const [signedIn, setSignedIn] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<ProjectState | null>(null);
  const [title, setTitle] = useState("");
  const [sync, setSync] = useState("Ready");

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    const flush = () => void flushQueue().then(() => setSync("Synced")).catch(() => setSync("Offline queue"));
    window.addEventListener("online", flush); flush(); return () => window.removeEventListener("online", flush);
  }, []);
  useEffect(() => {
    if (!projectId) return;
    let active = true;
    const refresh = () => void loadProject(projectId).then((x) => active && setProject(x)).catch(() => active && setSync("Load failed"));
    refresh();
    return subscribeProject(projectId, refresh);
  }, [projectId]);
  const metrics = useMemo(() => ({ total: project?.tasks.length ?? 0, done: project?.tasks.filter((x) => x.status === "COMPLETED").length ?? 0 }), [project]);
  const canEdit = !project?.membership || project.membership.access !== "VIEW";

  const addTask = async (event: React.FormEvent) => {
    event.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!project || !user || !title.trim()) return;
    const task = makeTask(project.project.id, user.id, title.trim());
    setProject((old) => old && ({ ...old, tasks: [task, ...old.tasks] })); setTitle("");
    try { await saveTask(task); setSync("Synced"); } catch { setSync("Offline queue"); }
  };
  const toggle = async (task: Task) => {
    const next: Task = { ...task, status: task.status === "COMPLETED" ? "TODO" : "COMPLETED", updated_at: new Date().toISOString() };
    setProject((old) => old && ({ ...old, tasks: old.tasks.map((x) => x.id === next.id ? next : x) }));
    try { await saveTask(next); } catch { setSync("Offline queue"); }
  };
  if (!signedIn) return <main><h1>Task Master</h1><p>Sign in to collaborate and sync projects.</p><button onClick={() => void supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin } })}>Sign in with Google</button></main>;
  return <main><header><h1>Task Master</h1><small>{sync}</small><button onClick={() => void supabase.auth.signOut()}>Sign out</button></header><section className="bar"><input value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder="Project id"/><button onClick={() => void createProject("New project").then((p) => setProjectId(p.id))}>New project</button></section>{project && <><h2>{project.project.title}</h2><p>{metrics.done} of {metrics.total} completed</p><form onSubmit={addTask}><input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!canEdit} placeholder="New task"/><button disabled={!canEdit}>Add</button></form><ul>{project.tasks.map((task) => <li key={task.id}><label><input type="checkbox" checked={task.status === "COMPLETED"} disabled={!canEdit} onChange={() => void toggle(task)}/>{task.title}</label>{canEdit && <button onClick={() => { setProject((old) => old && ({ ...old, tasks: old.tasks.filter((x) => x.id !== task.id) })); void deleteTask(task.id).catch(() => setSync("Offline queue")); }}>Delete</button>}</li>)}</ul></>}</main>;
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><App/></React.StrictMode>);
