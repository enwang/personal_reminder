const { sendNotificationBundle } = require('./notifications');

const DEFAULT_OFFSETS = [30, 7, 1, 0];

const toDateOnly = (date) => date.toISOString().slice(0, 10);

const parseLocalDate = (dateStr) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (dateStr, days) => {
  const date = parseLocalDate(dateStr);
  date.setDate(date.getDate() + days);
  return toDateOnly(date);
};

const daysBetween = (fromDateStr, toDateStr) => {
  const from = parseLocalDate(fromDateStr);
  const to = parseLocalDate(toDateStr);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((to - from) / msPerDay);
};

const parseOffsets = (value) => {
  if (Array.isArray(value)) {
    return value.map(Number).filter((offset) => Number.isInteger(offset) && offset >= 0);
  }

  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((offset) => Number(offset.trim()))
      .filter((offset) => Number.isInteger(offset) && offset >= 0);
  }

  return DEFAULT_OFFSETS;
};

const normalizeOffsets = (value) => {
  const offsets = parseOffsets(value);
  const unique = [...new Set(offsets.length ? offsets : DEFAULT_OFFSETS)];
  return unique.sort((a, b) => b - a);
};

const serializeOffsets = (value) => normalizeOffsets(value).join(',');

const nextAnnualDueDate = (reminderDate, today) => {
  const todayDate = parseLocalDate(today);
  const [todayYear] = today.split('-').map(Number);
  const [, month, day] = reminderDate.split('-').map(Number);

  let due = new Date(todayYear, month - 1, day);
  if (due < todayDate) {
    due = new Date(todayYear + 1, month - 1, day);
  }

  return toDateOnly(due);
};

const getRelevantDueDate = (reminder, today) => {
  if (reminder.is_recurring) {
    return nextAnnualDueDate(reminder.remind_date, today);
  }

  return reminder.remind_date;
};

const buildMessage = (reminder, offsetDays = 0, dueDate = reminder.remind_date) => {
  const when = offsetDays === 0 ? 'today' : `in ${offsetDays} day${offsetDays === 1 ? '' : 's'}`;
  const details = reminder.description ? `\n\n${reminder.description}` : '';

  return `Reminder: ${reminder.title} is due ${when} (${dueDate}).${details}`;
};

const alreadySent = async (db, reminderId, dueDate, offsetDays) => {
  return db.hasSentReminder(reminderId, dueDate, offsetDays);
};

const logNotificationResults = async (db, reminderId, dueDate, offsetDays, message, results) => {
  for (const result of results) {
    await db.logNotificationResult({
      reminder_id: reminderId,
      notification_type: result.provider,
      status: result.success ? 'sent' : result.skipped ? 'skipped' : 'failed',
      message,
      error: result.error || null,
      due_date: dueDate,
      offset_days: offsetDays
    });
  }
};

const sendDueReminder = async (db, reminder, today) => {
  const dueDate = getRelevantDueDate(reminder, today);
  const daysUntilDue = daysBetween(today, dueDate);
  const offsets = normalizeOffsets(reminder.reminder_offsets);

  if (!offsets.includes(daysUntilDue)) {
    return { sent: false, reason: 'not_due', reminder_id: reminder.id };
  }

  if (await alreadySent(db, reminder.id, dueDate, daysUntilDue)) {
    return { sent: false, reason: 'already_sent', reminder_id: reminder.id };
  }

  const subject =
    daysUntilDue === 0
      ? `Due today: ${reminder.title}`
      : `${reminder.title} due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`;
  const message = buildMessage(reminder, daysUntilDue, dueDate);
  const result = await sendNotificationBundle({ reminder, subject, message });

  await logNotificationResults(db, reminder.id, dueDate, daysUntilDue, message, result.results);

  if (result.success) {
    await db.updateReminderLastNotified(reminder.id, today);
  }

  return {
    sent: result.success,
    reminder_id: reminder.id,
    title: reminder.title,
    due_date: dueDate,
    offset_days: daysUntilDue,
    results: result.results
  };
};

const runDailyReminderCheck = async (db, options = {}) => {
  const today = options.today || toDateOnly(new Date());
  const reminders = await db.listReminders();
  const checked = [];
  const sent = [];
  const skipped = [];

  for (const reminder of reminders) {
    try {
      const result = await sendDueReminder(db, reminder, today);
      checked.push(reminder.id);

      if (result.sent) sent.push(result);
      else skipped.push(result);
    } catch (error) {
      skipped.push({
        sent: false,
        reason: 'error',
        reminder_id: reminder.id,
        error: error.message
      });
    }
  }

  return {
    today,
    checked: checked.length,
    sent,
    skipped
  };
};

module.exports = {
  DEFAULT_OFFSETS,
  buildMessage,
  normalizeOffsets,
  runDailyReminderCheck,
  serializeOffsets
};
