alter table companies
  add column if not exists system_enabled boolean not null default true;
