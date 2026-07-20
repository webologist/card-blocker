# Twilio OTP Integration — CardGuard Setup Guide

## Files added to your project

```
card-blocker/
├── api/
│   ├── send-otp.js       ← Serverless function: sends OTP via Twilio SMS
│   └── verify-otp.js     ← Serverless function: verifies OTP entered by user
├── otp.js                ← Frontend OTP UI (modal with phone + OTP screens)
├── vercel.json           ← Updated to support API routes
└── index.html            ← Add 1 line: <script src="./otp.js"></script>
```

---

## Step 1 — Add otp.js to index.html

Open `index.html` and add this line **before `</body>`**:

```html
<script src="./app.js"></script>
<script src="./otp.js"></script>   <!-- ADD THIS LINE -->
</body>
```

---

## Step 2 — Trigger OTP from your app

In your `app.js`, wherever you want to verify the user's phone (e.g. before showing bank contact details), call:

```js
CardGuardOTP.start(function(verifiedPhone) {
  console.log('Verified:', verifiedPhone);
  // User is verified — proceed to show sensitive content
});
```

Example — on a "Block My Card" button click:

```js
document.getElementById('block-btn').addEventListener('click', () => {
  CardGuardOTP.start((phone) => {
    // Show bank SMS/call options after verification
    showBankOptions();
  });
});
```

---

## Step 3 — Add Twilio env vars to Vercel

1. Go to https://vercel.com/dashboard
2. Click on your **card-blocker** project
3. Go to **Settings → Environment Variables**
4. Add these 3 variables:

| Variable Name          | Where to find it                          |
|------------------------|-------------------------------------------|
| `TWILIO_ACCOUNT_SID`   | Twilio Console → Account Info (starts AC…) |
| `TWILIO_AUTH_TOKEN`    | Twilio Console → Account Info             |
| `TWILIO_PHONE_NUMBER`  | Twilio Console → Phone Numbers (e.g. +1…) |

5. Click **Save** and then **Redeploy** your project.

---

## Step 4 — Push files to GitHub

```bash
git add api/send-otp.js api/verify-otp.js otp.js vercel.json
git commit -m "feat: add Twilio OTP verification"
git push origin main
```

Vercel will auto-deploy on push.

---

## How it works

1. User clicks "Block My Card" → OTP modal appears
2. User enters their 10-digit Indian mobile number
3. `/api/send-otp` generates a 6-digit OTP and sends it via Twilio SMS
4. User enters the OTP in the 6-box input
5. `/api/verify-otp` validates it (5 min expiry, single use)
6. On success → your app proceeds with card blocking flow

---

## Security features built in

- OTP expires in **5 minutes**
- OTP is **single-use** (deleted after verification)
- **Rate limited**: max 3 OTP requests per number per 10 minutes
- Phone numbers sanitized server-side
- Auth Token never exposed to frontend

---

## Note on production scaling

The current OTP store uses in-memory storage, which works fine for low traffic.
For high traffic or multi-instance deployments, replace with **Vercel KV** (Redis):
- https://vercel.com/docs/storage/vercel-kv
