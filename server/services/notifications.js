const axios = require('axios');

const parseRecipients = (value) =>
  String(value || '')
    .split(/[\s,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const configuredProviders = () => ({
  email: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_TO),
  push: Boolean(process.env.NTFY_TOPIC),
  sms: Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER &&
    process.env.PHONE_NUMBER
  )
});

const sendEmail = async ({ subject, message, to }) => {
  const recipients = parseRecipients(to || process.env.EMAIL_TO);

  if (!process.env.RESEND_API_KEY || recipients.length === 0) {
    return { provider: 'email', skipped: true, error: 'Resend email or recipient is not configured' };
  }

  try {
    await axios.post(
      'https://api.resend.com/emails',
      {
        from: process.env.EMAIL_FROM || 'Personal Reminder <onboarding@resend.dev>',
        to: recipients,
        subject,
        text: message
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    return { provider: 'email', success: true };
  } catch (error) {
    return {
      provider: 'email',
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

const sendPush = async ({ subject, message }) => {
  if (!configuredProviders().push) {
    return { provider: 'push', skipped: true, error: 'ntfy push is not configured' };
  }

  try {
    const baseUrl = process.env.NTFY_BASE_URL || 'https://ntfy.sh';
    await axios.post(`${baseUrl.replace(/\/$/, '')}/${process.env.NTFY_TOPIC}`, message, {
      headers: {
        Title: subject,
        Priority: process.env.NTFY_PRIORITY || 'default',
        Tags: 'calendar'
      },
      timeout: 15000
    });

    return { provider: 'push', success: true };
  } catch (error) {
    return {
      provider: 'push',
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

const sendSMS = async ({ message, to }) => {
  const recipient = to || process.env.PHONE_NUMBER;

  if (
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_FROM_NUMBER ||
    !recipient
  ) {
    return { provider: 'sms', skipped: true, error: 'Twilio SMS or recipient is not configured' };
  }

  try {
    const credentials = Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
    ).toString('base64');
    const body = new URLSearchParams({
      From: process.env.TWILIO_FROM_NUMBER,
      To: recipient,
      Body: message
    });

    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      body,
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 15000
      }
    );

    return { provider: 'sms', success: true };
  } catch (error) {
    return {
      provider: 'sms',
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
};

const sendNotificationBundle = async ({ reminder, subject, message }) => {
  const tasks = [];

  if (reminder.notify_email) tasks.push(sendEmail({ subject, message, to: reminder.contact_email }));
  if (reminder.notify_push) tasks.push(sendPush({ subject, message }));
  if (reminder.notify_sms) tasks.push(sendSMS({ subject, message, to: reminder.contact_phone }));

  if (tasks.length === 0) {
    return {
      success: false,
      results: [{ provider: 'none', success: false, error: 'No notification channels selected' }]
    };
  }

  const results = await Promise.all(tasks);
  const failures = results.filter((result) => !result.success);

  return {
    success: failures.length === 0,
    results
  };
};

module.exports = {
  configuredProviders,
  parseRecipients,
  sendEmail,
  sendPush,
  sendSMS,
  sendNotificationBundle
};
