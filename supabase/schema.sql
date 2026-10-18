-- Apply to Aether's NEW Supabase project. No credentials belong in this file.
begin;
create table if not exists public.sources (
  id text primary key, name text not null, url text not null,
  enabled boolean not null default true, last_success_at timestamptz,
  status text not null default 'waiting'
);
create table if not exists public.clusters (
  id text primary key, event text not null, winner_id text not null,
  reason text not null, selection_mode text not null default 'deepseek',
  created_at timestamptz not null default now()
);
create table if not exists public.articles (
  id text primary key, source text not null references public.sources(id),
  title text not null, summary text not null default '', content text,
  url text not null check (url ~ '^https?://'), author text,
  published_at timestamptz, fetched_at timestamptz not null default now(),
  cluster_id text not null references public.clusters(id) deferrable initially deferred,
  also_covered_by jsonb not null default '[]'::jsonb,
  is_fixture boolean not null default false,
  unique (source, url), unique (id, cluster_id)
);
-- The selected article must belong to this exact cluster.
alter table public.clusters drop constraint if exists cluster_winner_in_cluster;
alter table public.clusters add constraint cluster_winner_in_cluster
  foreign key (winner_id, id) references public.articles(id, cluster_id) deferrable initially deferred;
create index if not exists article_dates on public.articles(published_at desc);
create index if not exists article_clusters on public.articles(cluster_id);

alter table public.sources enable row level security;
alter table public.articles enable row level security;
alter table public.clusters enable row level security;
drop policy if exists "Read enabled sources" on public.sources;
create policy "Read enabled sources" on public.sources for select to anon, authenticated using (enabled);
drop policy if exists "Read clusters" on public.clusters;
create policy "Read clusters" on public.clusters for select to anon, authenticated using (true);
drop policy if exists "Read selected articles only" on public.articles;
create policy "Read selected articles only" on public.articles for select to anon, authenticated
  using (exists (select 1 from public.clusters c where c.winner_id = articles.id and c.id = articles.cluster_id));
-- No browser write policies. Fetcher writes use the server-only service role.
create or replace view public.feed_articles with (security_invoker = true) as
  select a.*, c.reason as selection_reason
  from public.articles a join public.clusters c on c.winner_id = a.id and c.id = a.cluster_id
  join public.sources s on s.id = a.source and s.enabled;
grant select on public.sources, public.clusters, public.articles, public.feed_articles to anon, authenticated;
insert into public.sources (id, name, url) values
  ('guizang', '归藏', 'https://www.guizang.ai/'),
  ('qiaomu', '乔木', 'https://blog.qiaomu.ai/feed.xml'),
  ('aihot', 'AIHOT', 'https://aihot.news/api/v1/items') on conflict (id) do nothing;
commit;
