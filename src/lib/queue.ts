import type { QueueOperation } from "../types";
const key="tm-offline-queue-v2";
const read=():QueueOperation[]=>{try{return JSON.parse(localStorage.getItem(key)||"[]")}catch{ return []}};
const write=(q:QueueOperation[])=>localStorage.setItem(key,JSON.stringify(q));
/** Last operation for an entity wins, preventing stale offline writes and request storms. */
export function enqueue(op:QueueOperation){const entity="id" in op.payload?op.payload.id:"";const q=read().filter(x=>!("id" in x.payload&&x.payload.id===entity));write([...q,op]);}
export function take(){return read()}
export function remove(ids:Set<string>){write(read().filter(x=>!ids.has(x.id)));}
