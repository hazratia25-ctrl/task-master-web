# Task Master Web

Collaborative task manager rebuilt with React, Supabase Auth, RLS, Realtime and an offline coalescing queue.

## Setup
1. Create a Supabase project and apply `supabase/migrations/20260812_task_master.sql`.
2. Copy `.env.example` to `.env` and set a publishable key only (never `service_role`).
3. `npm install && npm run dev`.

Realtime subscriptions are scoped per open project; they replace minute polling and are removed on navigation. RLS is the authority for all shared-project access.
