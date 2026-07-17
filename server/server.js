const express = require('express');
const cors = require('cors');
const os = require('os');
const path = require('path');
require('dotenv').config();

const db = require('./db');
const { configuredProviders, sendNotificationBundle } = require('./services/notifications');
const {
  buildMessage,
  runDailyReminderCheck,
  serializeOffsets
} = require('./services/reminderJobs');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const toBoolean = (value) => (value === true || value === 'true' || value === 1 ? 1 : 0);

const reminderFromBody = (body) => ({
  title: body.title?.trim(),
  description: body.description?.trim() || '',
  remind_date: body.remind_date,
  remind_time: body.remind_time || process.env.DEFAULT_REMINDER_TIME || '08:00',
  is_recurring: toBoolean(body.is_recurring),
  reminder_offsets: serializeOffsets(body.reminder_offsets),
  contact_email: body.contact_email?.trim() || '',
  contact_phone: body.contact_phone?.trim() || '',
  notify_email: body.notify_email === undefined ? 1 : toBoolean(body.notify_email),
  notify_push: toBoolean(body.notify_push),
  notify_sms: toBoolean(body.notify_sms)
});

const isValidReminderSchedule = (reminder) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reminder.remind_date || '')) return false;
  if (!/^\d{2}:\d{2}$/.test(reminder.remind_time || '')) return false;

  const scheduledAt = new Date(`${reminder.remind_date}T${reminder.remind_time}:00`);
  return !Number.isNaN(scheduledAt.getTime());
};

app.get('/api/health', async (req, res) => {
  const failed = await db.countFailedNotifications();
  const sentToday = await db.countSentToday();

  res.json({
    ok: true,
    database: db.provider,
    providers: configuredProviders(),
    schedule: 'daily',
    default_offsets: '30,7,1,0',
    sent_today: sentToday,
    failed_notifications: failed
  });
});

app.get('/api/reminders', async (req, res) => {
  try {
    const rows = await db.listReminders();

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reminders', async (req, res) => {
  const reminder = reminderFromBody(req.body);

  if (!reminder.title || !reminder.remind_date) {
    return res.status(400).json({ error: 'Title and date are required' });
  }

  if (!isValidReminderSchedule(reminder)) {
    return res.status(400).json({ error: 'Reminder date or time is invalid' });
  }

  try {
    const saved = await db.createReminder(reminder);

    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/reminders/:id', async (req, res) => {
  const id = req.params.id;
  const reminder = reminderFromBody(req.body);

  if (!reminder.title || !reminder.remind_date) {
    return res.status(400).json({ error: 'Title and date are required' });
  }

  if (!isValidReminderSchedule(reminder)) {
    return res.status(400).json({ error: 'Reminder date or time is invalid' });
  }

  try {
    const saved = await db.updateReminder(id, reminder);

    if (!saved) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/reminders/:id', async (req, res) => {
  const id = req.params.id;

  try {
    await db.deleteReminder(id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/test-notification', async (req, res) => {
  const reminder = {
    title: 'Test notification',
    description: 'Your personal reminder notifications are connected.',
    notify_email: req.body.notify_email === undefined ? 1 : toBoolean(req.body.notify_email),
    notify_push: toBoolean(req.body.notify_push),
    notify_sms: toBoolean(req.body.notify_sms)
  };

  const message = buildMessage(reminder);
  const result = await sendNotificationBundle({
    reminder,
    subject: 'Personal Reminder test',
    message
  });

  res.status(result.success ? 200 : 502).json(result);
});

const runDueRemindersHandler = async (req, res) => {
  if (process.env.CRON_SECRET && req.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await runDailyReminderCheck(db, { today: req.body?.today || req.query.today });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.get('/api/run-due-reminders', runDueRemindersHandler);
app.post('/api/run-due-reminders', runDueRemindersHandler);

const getLocalNetworkUrls = () => {
  const interfaces = os.networkInterfaces();

  return Object.values(interfaces)
    .flat()
    .filter((details) => details && details.family === 'IPv4' && !details.internal)
    .map((details) => `http://${details.address}:${PORT}`);
};

const server = app.listen(PORT, HOST, () => {
  const networkUrls = getLocalNetworkUrls();

  console.log(`Server running on http://localhost:${PORT}`);
  networkUrls.forEach((url) => console.log(`Network URL: ${url}`));
  console.log('Daily reminder checker available at /api/run-due-reminders');
});

const shutdown = () => {
  server.close(() => db.close(() => process.exit(0)));
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
