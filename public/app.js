const API_URL = '/api';

const loginScreen = document.getElementById('loginScreen');
const loginForm = document.getElementById('loginForm');
const loginTitle = document.getElementById('loginTitle');
const loginUsernameInput = document.getElementById('login_username');
const loginPasswordInput = document.getElementById('login_password');
const loginSubmit = document.getElementById('loginSubmit');
const toggleSignupButton = document.getElementById('toggleSignup');
const loginError = document.getElementById('loginError');
const appContainer = document.querySelector('.container');
const logoutButton = document.getElementById('logoutButton');
const reminderForm = document.getElementById('reminderForm');
const formTitle = document.querySelector('.add-reminder h2');
const submitReminderButton = document.getElementById('submitReminder');
const cancelEditButton = document.getElementById('cancelEdit');
const titleInput = document.getElementById('title');
const descriptionInput = document.getElementById('description');
const contactEmailInput = document.getElementById('contact_email');
const contactPhoneInput = document.getElementById('contact_phone');
const dateInput = document.getElementById('remind_date');
const timeInput = document.getElementById('remind_time');
const recurringCheckbox = document.getElementById('is_recurring');
const emailCheckbox = document.getElementById('notify_email');
const pushCheckbox = document.getElementById('notify_push');
const smsCheckbox = document.getElementById('notify_sms');
const offsetCheckboxes = document.querySelectorAll('input[name="reminder_offset"]');
const remindersList = document.getElementById('remindersList');
const statusPanel = document.getElementById('statusPanel');
const refreshStatusButton = document.getElementById('refreshStatus');
const testButtons = document.querySelectorAll('[data-test-channel]');
let remindersCache = [];
let editingReminderId = null;
let isSignupMode = false;

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';

  try {
    const response = await fetch(`${API_URL}/${isSignupMode ? 'signup' : 'login'}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: loginUsernameInput.value.trim(),
        password: loginPasswordInput.value
      })
    });

    if (!response.ok) {
      const error = await response.json();
      loginError.textContent = error.error || 'Login failed';
      return;
    }

    loginPasswordInput.value = '';
    isSignupMode = false;
    updateAuthMode();
    showApp();
    await loadReminders();
    await loadStatus();
  } catch (error) {
    console.error('Login error:', error);
    loginError.textContent = 'Connection error';
  }
});

toggleSignupButton.addEventListener('click', () => {
  isSignupMode = !isSignupMode;
  loginError.textContent = '';
  updateAuthMode();
});

logoutButton.addEventListener('click', async () => {
  await fetch(`${API_URL}/logout`, { method: 'POST' });
  showLogin();
});

reminderForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const reminder = {
    title: titleInput.value.trim(),
    description: descriptionInput.value.trim(),
    contact_email: contactEmailInput.value.trim(),
    contact_phone: contactPhoneInput.value.trim(),
    remind_date: dateInput.value,
    remind_time: timeInput.value,
    is_recurring: recurringCheckbox.checked,
    reminder_offsets: selectedOffsets(),
    notify_email: emailCheckbox.checked,
    notify_push: pushCheckbox.checked,
    notify_sms: smsCheckbox.checked
  };

  try {
    const url = editingReminderId
      ? `${API_URL}/reminders/${editingReminderId}`
      : `${API_URL}/reminders`;
    const response = await fetch(url, {
      method: editingReminderId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reminder)
    });

    if (response.ok) {
      const wasEditing = Boolean(editingReminderId);
      resetForm();
      await loadReminders();
      await loadStatus();
      showNotification(wasEditing ? 'Reminder updated' : 'Reminder added');
    } else {
      const error = await response.json();
      showNotification(error.error || 'Error adding reminder', true);
    }
  } catch (error) {
    console.error('Error:', error);
    showNotification('Connection error', true);
  }
});

refreshStatusButton.addEventListener('click', loadStatus);
cancelEditButton.addEventListener('click', resetForm);

testButtons.forEach((button) => {
  button.addEventListener('click', () => testNotification(button.dataset.testChannel));
});

async function loadStatus() {
  try {
    const response = await fetch(`${API_URL}/health`);
    if (response.status === 401) {
      showLogin();
      return;
    }
    const status = await response.json();
    const providers = status.providers;

    statusPanel.innerHTML = `
      <div class="status-grid">
        ${statusItem('Email', providers.email)}
        ${statusItem('Push', providers.push)}
        ${statusItem('SMS', providers.sms)}
        <div><strong>${status.sent_today}</strong><span>Sent today</span></div>
        <div><strong>${status.failed_notifications}</strong><span>Failed</span></div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading status:', error);
    statusPanel.textContent = 'Unable to load delivery status';
  }
}

async function loadReminders() {
  try {
    const response = await fetch(`${API_URL}/reminders`);
    if (response.status === 401) {
      showLogin();
      return;
    }
    const reminders = await response.json();
    remindersCache = reminders;

    if (reminders.length === 0) {
      remindersList.innerHTML = '<p class="empty">No reminders yet. Add one above.</p>';
      return;
    }

    remindersList.innerHTML = reminders
      .sort((a, b) => reminderDate(a) - reminderDate(b))
      .map((reminder) => `
        <div class="reminder-item">
          <div class="reminder-content">
            <div class="reminder-title">${escapeHtml(reminder.title)}</div>
            <div class="reminder-meta">
              <span>${formatDateTime(reminder.remind_date, reminder.remind_time)}</span>
              ${reminder.is_recurring ? '<span class="reminder-badge">Recurring</span>' : ''}
              ${channelBadges(reminder)}
            </div>
            ${reminder.description ? `<p class="reminder-description">${escapeHtml(reminder.description)}</p>` : ''}
            ${contactSummary(reminder)}
            ${reminderOffsets(reminder)}
          </div>
          <div class="reminder-actions">
            <button class="btn-secondary btn-small" onclick="editReminder(${reminder.id})">Edit</button>
            <button class="btn-delete" onclick="deleteReminder(${reminder.id})">Delete</button>
          </div>
        </div>
      `)
      .join('');
  } catch (error) {
    console.error('Error loading reminders:', error);
    remindersList.innerHTML = '<p class="empty">Error loading reminders</p>';
  }
}

function editReminder(id) {
  const reminder = remindersCache.find((item) => Number(item.id) === Number(id));
  if (!reminder) {
    showNotification('Reminder not found', true);
    return;
  }

  editingReminderId = reminder.id;
  formTitle.textContent = 'Edit Reminder';
  submitReminderButton.textContent = 'Save Changes';
  cancelEditButton.classList.remove('hidden');

  titleInput.value = reminder.title || '';
  descriptionInput.value = reminder.description || '';
  contactEmailInput.value = reminder.contact_email || '';
  contactPhoneInput.value = reminder.contact_phone || '';
  dateInput.value = reminder.remind_date || '';
  timeInput.value = normalizeTime(reminder.remind_time);
  recurringCheckbox.checked = Boolean(reminder.is_recurring);
  emailCheckbox.checked = Boolean(reminder.notify_email);
  pushCheckbox.checked = Boolean(reminder.notify_push);
  smsCheckbox.checked = Boolean(reminder.notify_sms);
  setOffsetCheckboxes(reminder.reminder_offsets);

  reminderForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  titleInput.focus();
}

async function deleteReminder(id) {
  if (!confirm('Delete this reminder?')) return;

  try {
    const response = await fetch(`${API_URL}/reminders/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      await loadReminders();
      await loadStatus();
      if (Number(editingReminderId) === Number(id)) resetForm();
      showNotification('Reminder deleted');
    } else {
      showNotification('Error deleting reminder', true);
    }
  } catch (error) {
    console.error('Error:', error);
    showNotification('Connection error', true);
  }
}

async function testNotification(channel) {
  const payload = {
    notify_email: channel === 'email',
    notify_push: channel === 'push',
    notify_sms: channel === 'sms'
  };

  try {
    const response = await fetch(`${API_URL}/test-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    const failed = result.results?.find((item) => !item.success);

    if (response.ok) {
      showNotification(`Test ${channel} sent`);
    } else {
      showNotification(failed?.error || `Test ${channel} failed`, true);
    }
  } catch (error) {
    console.error('Error:', error);
    showNotification('Connection error', true);
  }
}

async function checkAuth() {
  try {
    const response = await fetch(`${API_URL}/auth-status`);
    const status = await response.json();

    if (!status.auth_enabled || status.authenticated) {
      showApp();
      await loadReminders();
      await loadStatus();
    } else {
      showLogin();
    }
  } catch (error) {
    console.error('Auth status error:', error);
    showLogin();
  }
}

function showLogin() {
  appContainer.classList.add('hidden');
  logoutButton.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  loginPasswordInput.value = '';
  updateAuthMode();
  loginUsernameInput.focus();
}

function showApp() {
  loginScreen.classList.add('hidden');
  appContainer.classList.remove('hidden');
  logoutButton.classList.remove('hidden');
  loginError.textContent = '';
}

function updateAuthMode() {
  loginTitle.textContent = isSignupMode ? 'Create Account' : 'Personal Reminder';
  loginSubmit.textContent = isSignupMode ? 'Create Account' : 'Log In';
  toggleSignupButton.textContent = isSignupMode ? 'I already have an account' : 'Create Account';
  loginPasswordInput.autocomplete = isSignupMode ? 'new-password' : 'current-password';
}

function statusItem(label, enabled) {
  return `
    <div class="${enabled ? 'status-ok' : 'status-muted'}">
      <strong>${enabled ? 'Ready' : 'Off'}</strong>
      <span>${label}</span>
    </div>
  `;
}

function channelBadges(reminder) {
  const channels = [];
  if (reminder.notify_email) channels.push('Email');
  if (reminder.notify_push) channels.push('Push');
  if (reminder.notify_sms) channels.push('SMS');
  return channels.map((channel) => `<span class="channel-badge">${channel}</span>`).join('');
}

function selectedOffsets() {
  const offsets = [...offsetCheckboxes]
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => Number(checkbox.value));

  return offsets.length ? offsets : [0];
}

function setOffsetCheckboxes(offsetsValue) {
  const offsets = String(offsetsValue || '30,7,1,0')
    .split(',')
    .map((offset) => offset.trim());

  offsetCheckboxes.forEach((checkbox) => {
    checkbox.checked = offsets.includes(checkbox.value);
  });
}

function resetForm() {
  reminderForm.reset();
  editingReminderId = null;
  formTitle.textContent = 'Add New Reminder';
  submitReminderButton.textContent = 'Add Reminder';
  cancelEditButton.classList.add('hidden');
  timeInput.value = '08:00';
  recurringCheckbox.checked = true;
  emailCheckbox.checked = true;
  pushCheckbox.checked = false;
  smsCheckbox.checked = false;
  setOffsetCheckboxes('30,7,1,0');
}

function reminderOffsets(reminder) {
  const offsets = String(reminder.reminder_offsets || '30,7,1,0')
    .split(',')
    .map((offset) => Number(offset.trim()))
    .filter((offset) => Number.isInteger(offset))
    .sort((a, b) => b - a);
  const labels = offsets.map((offset) => (offset === 0 ? 'Due date' : `${offset} day${offset === 1 ? '' : 's'} before`));

  return `<div class="job-status"><span>Reminders: ${labels.map(escapeHtml).join(', ')}</span></div>`;
}

function contactSummary(reminder) {
  const contacts = [];
  contacts.push(reminder.contact_email ? `Emails: ${reminder.contact_email}` : 'Emails: default');
  contacts.push(reminder.contact_phone ? `Phone: ${reminder.contact_phone}` : 'Phone: default');

  return `<div class="contact-summary">${contacts.map(escapeHtml).join(' · ')}</div>`;
}

function formatDateTime(dateStr, timeStr = '08:00') {
  const date = reminderDate({ remind_date: dateStr, remind_time: timeStr });
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function normalizeTime(timeStr = '08:00') {
  return String(timeStr).split(':').slice(0, 2).join(':') || '08:00';
}

function reminderDate(reminder) {
  return new Date(`${reminder.remind_date}T${normalizeTime(reminder.remind_time)}:00`);
}

function formatIso(isoStr) {
  return new Date(isoStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, isError = false) {
  const notification = document.createElement('div');
  notification.className = `toast ${isError ? 'toast-error' : 'toast-success'}`;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => notification.remove(), 3500);
}
