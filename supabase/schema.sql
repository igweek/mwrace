create extension if not exists pgcrypto;

create table if not exists public.classes (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    name text not null check (char_length(trim(name)) between 1 and 40),
    description text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.groups (
    id uuid primary key default gen_random_uuid(),
    class_id uuid not null references public.classes(id) on delete cascade,
    owner_id uuid not null references auth.users(id) on delete cascade,
    name text not null check (char_length(trim(name)) between 1 and 40),
    avatar_index integer not null default 1 check (avatar_index between 1 and 9),
    sort_order integer not null default 0,
    points integer not null default 0 check (points >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists classes_owner_id_idx on public.classes(owner_id);
create index if not exists groups_owner_class_idx on public.groups(owner_id, class_id);
create index if not exists groups_class_sort_idx on public.groups(class_id, sort_order, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_classes_updated_at on public.classes;
create trigger set_classes_updated_at
before update on public.classes
for each row execute function public.set_updated_at();

drop trigger if exists set_groups_updated_at on public.groups;
create trigger set_groups_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

alter table public.classes enable row level security;
alter table public.groups enable row level security;

drop policy if exists "Users can read own classes" on public.classes;
create policy "Users can read own classes"
on public.classes for select
using (owner_id = auth.uid());

drop policy if exists "Users can create own classes" on public.classes;
create policy "Users can create own classes"
on public.classes for insert
with check (owner_id = auth.uid());

drop policy if exists "Users can update own classes" on public.classes;
create policy "Users can update own classes"
on public.classes for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Users can delete own classes" on public.classes;
create policy "Users can delete own classes"
on public.classes for delete
using (owner_id = auth.uid());

drop policy if exists "Users can read own groups" on public.groups;
create policy "Users can read own groups"
on public.groups for select
using (owner_id = auth.uid());

drop policy if exists "Users can create groups in own classes" on public.groups;
create policy "Users can create groups in own classes"
on public.groups for insert
with check (
    owner_id = auth.uid()
    and exists (
        select 1
        from public.classes c
        where c.id = class_id
          and c.owner_id = auth.uid()
    )
);

drop policy if exists "Users can update own groups" on public.groups;
create policy "Users can update own groups"
on public.groups for update
using (owner_id = auth.uid())
with check (
    owner_id = auth.uid()
    and exists (
        select 1
        from public.classes c
        where c.id = class_id
          and c.owner_id = auth.uid()
    )
);

drop policy if exists "Users can delete own groups" on public.groups;
create policy "Users can delete own groups"
on public.groups for delete
using (owner_id = auth.uid());
