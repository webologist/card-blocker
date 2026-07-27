# Email Integrations Setup Guide

Lets the admin connect **Brevo**, **AWS SES**, or **Gmail (SMTP + App Password)**
from the Admin console, and sends a "new login" notification email to a user's
saved address whenever they log in, via whichever provider is active.

## Files added

```
card-blocker/
├── lib/
│   ├── email-providers.js       ← sendEmail() dispatch for brevo/ses/gmail + secret masking
│   ├── email-settings-store.js  ← reads/writes the email_settings + login_email_log tables
│   └── admin-auth.js            ← shared x-admin-key header check
├── api/
│   ├── email-settings/index.js  ← GET (masked) / POST (save) - admin key required
│   ├── email-settings/test.js   ← POST - send a test email - admin key required
│   └── login-email.js           ← POST - called after a real user login (see below)
├── admin-email-integrations.js  ← injects the "Email Integrations" admin tab
├── login-email-notifier.js      ← watches the activity log for fresh logins
└── server.js                    ← same routes added for local dev
```

## Step 1 — Create the database tables ✅ DONE

Both tables now exist in the `supabase-blue-coin` project with RLS enabled and
zero policies (verified 2026-07-27). Kept here for reference / re-creation:

```sql
CREATE TABLE email_settings (
  id INT PRIMARY KEY DEFAULT 1,
  active_provider TEXT,
  brevo_api_key TEXT, brevo_from_email TEXT, brevo_from_name TEXT,
  ses_access_key_id TEXT, ses_secret_access_key TEXT, ses_region TEXT, ses_from_email TEXT,
  gmail_address TEXT, gmail_app_password TEXT, gmail_from_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT email_settings_singleton CHECK (id = 1)
);
ALTER TABLE email_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE login_email_log (
  phone TEXT NOT NULL,
  ts TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (phone, ts)
);
ALTER TABLE login_email_log ENABLE ROW LEVEL SECURITY;
```

RLS is left **enabled with no policies** on purpose — these tables hold API
secrets, so only the service-role key (used server-side only) can read/write
them. Unlike `kv_store`, they are never exposed through a public passthrough
endpoint.

`server.js` prints a warning with this exact SQL on boot if the tables are
missing.

## Step 2 — Set ADMIN_API_SECRET

A random value has already been added to your local `.env.db`. Add the same
value to your Vercel project too:

1. Go to https://vercel.com/dashboard → your **card-blocker** project
2. **Settings → Environment Variables**
3. Add `ADMIN_API_SECRET` with the value from your local `.env.db`
4. Save and redeploy

This is a lightweight shared-secret gate, not a full auth system — the app
has no server-side sessions, so it's the same pragmatic level of protection
as everything else here. Don't reuse this value anywhere else.

## Step 3 — Connect a provider

Open the Admin console → **Email Integrations** tab, then:

1. Paste the `ADMIN_API_SECRET` value into the **Admin key** box and hit
   **Unlock** (once per browser tab).
2. **Step 1 · Choose a provider** — pick Brevo, AWS SES, or Google. Each
   button shows whether it's already set up and which one is currently in use.
3. **Step 2 · Credentials** — only the chosen provider's fields appear. Fill
   them in, tick *"Use … to send login emails"* if this should be the one that
   sends, and **Save**.
4. Hit **Send test email** to confirm it actually works before relying on it.

Saved secrets are never sent back to the browser — a stored key shows only as
`••••1234`, and leaving a secret field blank on save keeps the existing value
rather than wiping it.

What each provider needs:

- **Brevo**: API key (Brevo dashboard → SMTP & API → API Keys), a verified
  sender email/name.
- **AWS SES**: an IAM access key/secret with `ses:SendEmail` permission, the
  region your SES identity is verified in, and the verified sender email.
- **Gmail**: your Gmail/Workspace address and an
  [App Password](https://myaccount.google.com/apppasswords) (not your normal
  password — requires 2-Step Verification to be enabled).

Only one provider is active at a time. You can keep credentials saved for all
three and switch which one sends by ticking the box on whichever you want.

## How the login email works

1. A user signs in → the app's own activity log (`cbp:logs`) gets an entry.
   **Two actions matter**, because the app records them differently:
   - a returning user produces `Login`
   - a brand-new signup produces `Registered` and *never* a `Login`

   Watching only `Login` silently skips every first-time user, which is exactly
   the bug that shipped initially. Both are handled now, with different wording
   ("new login to your account" vs "your account is ready").
2. `login-email-notifier.js` (loaded on every page) polls that log every 3s
   for new entries and calls `/api/login-email` with the phone, log timestamp,
   and which event it was.

   On its first read it records everything already in the log as a baseline and
   sends nothing, so enabling this never blasts users about historical logins.
3. The server looks up that phone's saved email in `cbp:users`, and — only if
   an email is on file and a provider is active — sends a "new login to your
   account" notice through it.
4. The `(phone, ts)` pair is claimed atomically first, so if more than one
   open tab is polling at once, only one email goes out per login. It's
   rate-limited to 2 per phone per 3 minutes as a backstop.

Nothing here blocks or can fail the user's actual login — errors are only
logged server-side.

## Why "open each admin activity in a new tab" was removed

This was built (`admin-open-in-new-tab.js`) and then removed, because it
cannot work in this app as currently structured.

Admin access is **in-memory only** — a React state flag flipped after OTP
verification, with no server-side session and nothing persisted. Any page
load therefore drops you back to phone + OTP entry.

Opening an activity in a new tab requires a page load by definition, so the
sequence was always:

1. Click "Users" → interceptor cancels the normal inline tab switch
2. Browser loads `/?admin_tab=users`
3. That load wipes the admin flag → the app renders the login screen
4. The auto-select poller waits for a tab bar that never appears

The visible result was that the admin tabs simply stopped responding.

Making this work needs one of:

- **Persisted admin auth** (a real server-side session, or a signed
  short-lived token) so a fresh page load can land in the Admin console; or
- **Access to `app.js` source** so the admin view can be driven by a route
  rather than by transient in-memory state.

`app.js` is a minified bundle with no source in this repo, so neither is
possible without that source. Until then the admin tabs switch inline, which
works. The removed script is in git history if it's useful later.
