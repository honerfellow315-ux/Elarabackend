-- ELARAWAVE database schema (Postgres / Supabase)
-- Run once via: npm run db:migrate

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------- users --
create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          citext unique not null,
  phone          text,
  avatar         text,
  password_hash  text not null,
  role           text not null default 'user' check (role in ('user','admin','owner')),
  email_verified boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);


-- ------------------------------------------------------------ otp_codes --
-- purpose: 'register' | 'password_reset' | 'password_change'
create table if not exists otp_codes (
  id           uuid primary key default gen_random_uuid(),
  email        citext not null,
  purpose      text not null,
  otp_hash     text not null,
  attempts     int not null default 0,
  max_attempts int not null default 5,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now(),
  -- payload holds pending-registration data (name/password hash) until verified
  payload      jsonb
);
create index if not exists idx_otp_email_purpose on otp_codes(email, purpose);

-- --------------------------------------------------------- admin_users --
create table if not exists admin_users (
  id            uuid primary key default gen_random_uuid(),
  username      citext unique not null,
  password_hash text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------- password_resets --
create table if not exists password_resets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- products --
create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  title       text not null,
  description text default '',
  image       text,
  price       numeric(12,2),
  category    text,
  size        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------------- wishlist --
create table if not exists wishlist_items (
  user_id    uuid not null references users(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

-- -------------------------------------------------------------- gallery --
create table if not exists gallery_images (
  id         uuid primary key default gen_random_uuid(),
  url        text not null,
  alt        text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- reviews --
create table if not exists reviews (
  id         uuid primary key default gen_random_uuid(),
  author     text not null,
  avatar     text,
  rating     int not null check (rating between 1 and 5),
  review_date date not null default current_date,
  text       text not null,
  source     text default 'site',
  email      text,
  approved   boolean not null default false,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- contact --
create table if not exists contact_messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  phone      text,
  subject    text,
  message    text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------ newsletter --
create table if not exists newsletter_subscribers (
  id         uuid primary key default gen_random_uuid(),
  email      citext unique not null,
  source     text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------ branding_requests --
create table if not exists branding_requests (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  brand      text not null,
  email      text not null,
  phone      text,
  size       text,
  quantity   text,
  brief      text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ seo --
create table if not exists seo_settings (
  id          int primary key default 1,
  title       text,
  description text,
  keywords    text,
  canonical   text,
  og_image    text,
  favicon     text,
  robots      text,
  sitemap     text,
  updated_at  timestamptz not null default now(),
  check (id = 1)
);
insert into seo_settings (id) values (1) on conflict (id) do nothing;

-- -------------------------------------------------------------- settings --
create table if not exists site_settings (
  id         int primary key default 1,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (id = 1)
);
insert into site_settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------- customizer --
create table if not exists customizer_settings (
  id         int primary key default 1,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  check (id = 1)
);
insert into customizer_settings (id) values (1) on conflict (id) do nothing;

create table if not exists customizer_submissions (
  id         uuid primary key default gen_random_uuid(),
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
