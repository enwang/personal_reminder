alter table public.reminders
  add column if not exists contact_email text,
  add column if not exists contact_phone text;
