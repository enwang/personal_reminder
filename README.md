# 📅 Personal Reminder

A simple web application to manage personal reminders (property tax, home insurance, etc.) and receive email or SMS notifications on scheduled dates.

## Features

✅ Add reminders with date and description  
✅ Choose notification channels  
✅ Remind 30 days, 7 days, 1 day, and/or on the due date  
✅ Mark reminders as recurring (annually)  
✅ Delete reminders  
✅ Daily due-reminder checker  
✅ Email and optional SMS notifications
✅ Test notification buttons  
✅ Clean, responsive web interface  

## Quick Start

### 1. Setup

```bash
npm install
```

### 2. Configure

Edit `.env` with your details:

```env
PORT=3001
HOST=0.0.0.0
DEFAULT_REMINDER_TIME=08:00
EMAIL_TO=your-email@example.com
PHONE_NUMBER=+1234567890

# Cloud database via Supabase
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Email via Resend
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=Personal Reminder <onboarding@resend.dev>

# Optional SMS via Twilio
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_FROM_NUMBER=+1234567890
```

### 3. Run

```bash
npm start
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

To open it from another device on the same Wi-Fi, use the `Network URL` printed when the server starts, for example:

```text
http://192.168.1.25:3001
```

This makes the app available on your local network. For a public internet URL, use a tunnel or deploy it to a hosting provider.

## Usage

1. **Add Reminder**: Enter title, optional description, due date, reminder offsets, and delivery channels
2. **View**: All reminders displayed sorted by date
3. **Delete**: Click delete button to remove a reminder
4. **Notifications**: Run the daily checker once each morning to send reminders due that day

## Example Reminders

- Property Tax (annual)
- Home Insurance Renewal (annual)
- Car Registration (annual)
- Subscription Renewals
- Important Anniversaries

## Notifications Setup

The app checks reminders once per day. By default, each reminder can notify 30 days before, 7 days before, 1 day before, and on the due date.

## Supabase Setup

1. Create a Supabase project.
2. Go to Project Settings > API Keys.
3. Copy the Project URL into `SUPABASE_URL`.
4. Copy the secret key into `SUPABASE_SERVICE_ROLE_KEY`.
5. Go to Project Settings > Database and copy the Postgres connection string into `SUPABASE_DB_URL`.
6. Run:

```bash
npm run setup-db
```

The service role key must stay server-side only. Do not put it in browser JavaScript.

## Login Setup

Login users are stored in the Supabase `app_users` table. Passwords are stored as `scrypt` hashes.

Create a user:

```bash
npm run create-user -- admin your-password
```

Set `AUTH_SECRET` in local and production env vars. It signs the HTTP-only login cookie.

### Email (Resend - Free)

1. Sign up at [resend.com](https://resend.com)
2. Get API key
3. Add `RESEND_API_KEY`, `EMAIL_TO`, and `EMAIL_FROM` to `.env`

### SMS (Twilio - Optional)

1. Sign up at [twilio.com](https://www.twilio.com)
2. Get Account SID and Auth Token
3. Add to `.env`:
   ```
   TWILIO_ACCOUNT_SID=your_sid
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_FROM_NUMBER=+1234567890
   PHONE_NUMBER=+1234567890
   ```

SMS usually is not permanently free, so email is the best free default channel.

## Tech Stack

- **Frontend**: HTML, CSS, JavaScript (Vanilla)
- **Backend**: Node.js, Express
- **Database**: Supabase
- **Scheduler**: Daily reminder checker endpoint
- **Styling**: Modern responsive CSS

## Project Structure

```
personal_reminder/
├── public/
│   ├── index.html
│   ├── app.js
│   └── css/
│       └── style.css
├── server/
│   ├── server.js (main app)
│   ├── db.js (Supabase database adapter)
│   └── services/
│       ├── notifications.js (email/SMS providers)
│       └── reminderJobs.js (daily due-reminder logic)
├── supabase/
│   └── schema.sql
├── package.json
└── .env (configuration)
```

## API Endpoints

- `GET /api/reminders` - Get all reminders
- `POST /api/reminders` - Create reminder
- `PUT /api/reminders/:id` - Update reminder
- `DELETE /api/reminders/:id` - Delete reminder
- `GET /api/health` - Check delivery provider and job status
- `POST /api/test-notification` - Send a test notification
- `GET /api/run-due-reminders` - Run the daily reminder check
- `POST /api/run-due-reminders` - Run the daily reminder check with optional test date

## Notes

- Reminders are stored in Supabase
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are required
- Recurring reminders are treated as annual due dates
- A reminder is only sent once per due date and offset

## Deployment Note

This app uses Supabase for persistent cloud storage.

For a reliable public deployment, use one of these paths:

- Deploy with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and `EMAIL_TO` set as host environment variables.
- Use the included daily cron endpoint: `/api/run-due-reminders`.

Do not upload `.env`; `.vercelignore` keeps it local.
