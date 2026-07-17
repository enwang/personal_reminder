alter table public.reminders
  add column if not exists user_id bigint references public.app_users(id) on delete cascade;

update public.reminders
set user_id = (select id from public.app_users order by id asc limit 1)
where user_id is null;

create index if not exists reminders_user_idx
  on public.reminders (user_id, remind_date);
