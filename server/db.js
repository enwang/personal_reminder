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
  contact_phone: reminder.contact_phone || '',
  user_id: reminder.user_id || null
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
  async listReminders(userId) {
    let query = client.from('reminders').select('*').order('remind_date').order('remind_time');
    if (userId) query = query.eq('user_id', userId);

    const { data } = await runQuery(query);
    return data.map(normalizeReminder);
  },
  async createReminder(userId, reminder) {
    const saved = normalizeReminder({ ...reminder, user_id: userId });
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
  async updateReminder(userId, id, reminder) {
    const saved = normalizeReminder({ ...reminder, user_id: userId });
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
        .eq('user_id', userId)
        .select()
        .maybeSingle()
    );

    return data ? normalizeReminder(data) : null;
  },
  async deleteReminder(userId, id) {
    const { data: reminder } = await runQuery(
      client.from('reminders').select('id').eq('id', id).eq('user_id', userId).maybeSingle()
    );
    if (!reminder) return 0;

    await runQuery(client.from('notification_log').delete().eq('reminder_id', id));
    const { data } = await runQuery(
      client.from('reminders').delete().eq('id', id).eq('user_id', userId).select('id')
    );
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
  async getUserByUsername(username) {
    const { data } = await runQuery(
      client.from('app_users').select('*').eq('username', username).eq('is_active', true).maybeSingle()
    );
    return data;
  },
  async createUser({ username, password_hash }) {
    const { data } = await runQuery(
      client
        .from('app_users')
        .insert({ username, password_hash })
        .select('id, username, created_at, is_active')
        .single()
    );
    return data;
  },
  close(callback) {
    if (callback) callback();
  }
};

console.log('Using Supabase database');

module.exports = db;
