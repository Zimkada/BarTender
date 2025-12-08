-- Create app_feedback table
create table if not exists public.app_feedback (
    id uuid not null default gen_random_uuid(),
    user_id uuid references auth.users(id),
    bar_id uuid references public.bars(id),
    type text not null check (type in ('bug', 'feature', 'other')),
    message text not null,
    email text,
    status text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved')),
    created_at timestamptz not null default now(),
    
    constraint app_feedback_pkey primary key (id)
);

-- RLS Policies
alter table public.app_feedback enable row level security;

-- Users can create feedback
create policy "Users can insert their own feedback"
    on public.app_feedback
    for insert
    to authenticated
    with check (auth.uid() = user_id);

-- Only admins/support can view feedback (assuming they have specific role or service role)
-- For now, users can view their own feedback
create policy "Users can view their own feedback"
    on public.app_feedback
    for select
    to authenticated
    using (auth.uid() = user_id);
