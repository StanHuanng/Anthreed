begin;

create table if not exists public.sources (
  id text primary key,
  name text not null,
  url text not null,
  enabled boolean not null default true,
  last_success_at timestamptz,
  status text not null default 'waiting'
);

create table if not exists public.clusters (
  id text primary key,
  event text not null default '',
  winner_id text not null,
  reason text not null default '',
  selection_mode text not null default 'deepseek',
  created_at timestamptz not null default now()
);

create table if not exists public.articles (
  id text primary key,
  source text not null references public.sources(id),
  title text not null,
  summary text not null default '',
  content text,
  url text not null check (url ~ '^https?://'),
  author text,
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  cluster_id text not null,
  also_covered_by jsonb not null default '[]'::jsonb,
  is_fixture boolean not null default false,
  selection_reason text,
  unique (url),
  unique (id, cluster_id)
);

create index if not exists article_dates on public.articles(published_at desc nulls last);
create index if not exists article_clusters on public.articles(cluster_id);

alter table public.sources enable row level security;
alter table public.articles enable row level security;
alter table public.clusters enable row level security;

drop policy if exists "Read enabled sources" on public.sources;
create policy "Read enabled sources" on public.sources for select to anon, authenticated using (enabled is true);
drop policy if exists "Read clusters" on public.clusters;
create policy "Read clusters" on public.clusters for select to anon, authenticated using (true);
drop policy if exists "Read articles" on public.articles;
create policy "Read articles" on public.articles for select to anon, authenticated using (true);

drop view if exists public.feed_articles;
create view public.feed_articles
with (security_invoker = true) as
  select a.id, a.source, a.title, a.summary, a.content, a.url, a.author,
         a.published_at, a.fetched_at, a.cluster_id, a.also_covered_by,
         a.is_fixture,
         coalesce(nullif(a.selection_reason, ''), c.reason, '') as selection_reason
  from public.articles a
  join public.clusters c on c.id = a.cluster_id and c.winner_id = a.id;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.sources, public.clusters, public.articles, public.feed_articles to anon, authenticated;
grant all on public.sources, public.clusters, public.articles to service_role;
grant select on public.feed_articles to service_role;

insert into public.sources (id, name, url) values
  ('guizang', '归藏', 'https://www.guizang.ai/'),
  ('qiaomu', '乔木', 'https://blog.qiaomu.ai/feed.xml'),
  ('aihot', 'AIHOT', 'https://aihot.news/api/v1/items')
on conflict (id) do nothing;

commit;
