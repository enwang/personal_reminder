const { createClient } = require('@supabase/supabase-js');

const DEFAULT_REMINDER_OFFSETS = '30,7,1,0';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false
  }
});

const normalizeReminder = (reminder) => ({
  ...reminder,
  is_recurring: reminder.is_recurring ? 1 : 0,
  notify_email: reminder.notify_email ? 1 : 0,
  notify_push: reminder.notify_push ? 1 : 0,
  notify_sms: reminder.notify_sms ? 1 : 0,
  reminder_offsets: reminder.reminder_offsets || DEFAULT_REMINDER_OFFSETS,
  remind_time: reminder.remind_time || process.env.DEFAULT_REMINDER_TIME || '08:00',
  contact_email: reminder.contact_email || '',
  contact_phone: reminder.contact_phone || ''
});

const runQuery = async (query) => {
  const { data, error, count } = await query;
  if (error) throw error;
  return { data, count };
};

const db = {
  provider: 'supabase',
  async countFailedNotifications() {
    const { count } = await runQuery(
      client
        .from('notification_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
    );
    return count || 0;
  },
  async countSentToday() {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(`${today}T00:00:00.000Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    const { count } = await runQuery(
      client
        .from('notification_log')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'sent')
        .gte('sent_at', `${today}T00:00:00.000Z`)
        .lt('sent_at', tomorrow.toISOString())
    );
    return count || 0;
  },
  async listReminders() {
    const { data } = await runQuery(
      client.from('reminders').select('*').order('remind_date').order('remind_time')
    );
    return data.map(normalizeReminder);
  },
  async createReminder(reminder) {
    const saved = normalizeReminder(reminder);
    const { data } = await runQuery(
      client
        .from('reminders')
        .insert({
          ...saved,
          is_recurring: Boolean(saved.is_recurring),
          notify_email: Boolean(saved.notify_email),
          notify_push: Boolean(saved.notify_push),
          notify_sms: Boolean(saved.notify_sms)
        })
        .select()
        .single()
    );
    return normalizeReminder(data);
  },
  async updateReminder(id, reminder) {
    const saved = normalizeReminder(reminder);
    const { data } = await runQuery(
      client
        .from('reminders')
        .update({
          ...saved,
          is_recurring: Boolean(saved.is_recurring),
          notify_email: Boolean(saved.notify_email),
          notify_push: Boolean(saved.notify_push),
          notify_sms: Boolean(saved.notify_sms)
        })
        .eq('id', id)
        .select()
        .maybeSingle()
    );

    return data ? normalizeReminder(data) : null;
  },
  async deleteReminder(id) {
    await runQuery(client.from('notification_log').delete().eq('reminder_id', id));
    const { data } = await runQuery(client.from('reminders').delete().eq('id', id).select('id'));
    return data.length;
  },
  async hasSentReminder(reminderId, dueDate, offsetDays) {
    const { data } = await runQuery(
      client
        .from('notification_log')
        .select('id')
        .eq('reminder_id', reminderId)
        .eq('status', 'sent')
        .eq('due_date', dueDate)
        .eq('offset_days', offsetDays)
        .limit(1)
    );
    return data.length > 0;
  },
  async logNotificationResult(entry) {
    await runQuery(client.from('notification_log').insert(entry));
  },
  async updateReminderLastNotified(id, date) {
    await runQuery(client.from('reminders').update({ last_notified: date }).eq('id', id));
  },
  close(callback) {
    if (callback) callback();
  }
};

console.log('Using Supabase database');

module.exports = db;
