export type Status = "TODO" | "IN_PROGRESS" | "COMPLETED";
export type Priority = "LOW" | "MEDIUM" | "HIGH";
export type Access = "VIEW" | "EDIT" | "MANAGE";
export interface Task { id:string; project_id:string|null; owner_id:string; title:string; description:string; status:Status; priority:Priority; due_at:string|null; updated_at:string; created_at:string; }
export interface Project { id:string; owner_id:string; title:string; description:string; status:Status; updated_at:string; created_at:string; }
export interface Membership { project_id:string; user_id:string; access:Access; accepted_at:string|null; }
export interface ProjectState { project:Project; tasks:Task[]; membership:Membership|null; }
export type QueueOperation={ id:string; kind:"upsert-task"|"delete-task"; payload: Task|{id:string}; createdAt:number };
