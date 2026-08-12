import { supabase } from "./supabase";
import { enqueue, remove, take } from "./queue";
import type { ProjectState, QueueOperation, Task } from "../types";
const uuid=()=>crypto.randomUUID();

export async function loadProject(id:string):Promise<ProjectState>{
 const [projectResult,tasksResult,userResult]=await Promise.all([supabase.from("projects").select("*").eq("id",id).single(),supabase.from("tasks").select("*").eq("project_id",id).order("updated_at",{ascending:false}),supabase.auth.getUser()]);
 const {data:p,error:pe}=projectResult; const {data:t,error:te}=tasksResult; const userId=userResult.data.user?.id ?? "";
 if(pe) throw pe;if(te) throw te;
 const {data:m,error:me}=await supabase.from("project_members").select("project_id,user_id,access,accepted_at").eq("project_id",id).eq("user_id",userId).maybeSingle();if(me)throw me;
 return {project:p,tasks:t??[],membership:m};
}
export async function createProject(title:string,description=""){
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("ابتدا وارد حساب شوید.");
 const now=new Date().toISOString();const row={id:uuid(),owner_id:user.id,title,description,status:"TODO",created_at:now,updated_at:now};
 const {data,error}=await supabase.from("projects").insert(row).select().single();if(error)throw error;return data;
}
export async function saveTask(task:Task){
 const {error}=await supabase.from("tasks").upsert(task,{onConflict:"id"});if(error){enqueue({id:uuid(),kind:"upsert-task",payload:task,createdAt:Date.now()});throw error;}
}
export async function deleteTask(id:string){const {error}=await supabase.from("tasks").delete().eq("id",id);if(error){enqueue({id:uuid(),kind:"delete-task",payload:{id},createdAt:Date.now()});throw error;}}
export async function flushQueue(){const q=take();const done=new Set<string>();for(const op of q){try{if(op.kind==="upsert-task")await saveTask(op.payload as Task);else await deleteTask((op.payload as {id:string}).id);done.add(op.id)}catch{break}}remove(done);}
/** One channel, three filtered feeds. Realtime replaces minute-by-minute polling. */
export function subscribeProject(id:string,onChange:()=>void){
 const channel=supabase.channel(`project:${id}`).on("postgres_changes",{event:"*",schema:"public",table:"projects",filter:`id=eq.${id}`},onChange).on("postgres_changes",{event:"*",schema:"public",table:"tasks",filter:`project_id=eq.${id}`},onChange).on("postgres_changes",{event:"*",schema:"public",table:"project_members",filter:`project_id=eq.${id}`},onChange).subscribe();
 return()=>{void supabase.removeChannel(channel)};
}
