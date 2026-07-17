CardGuard — Deploy to Vercel
============================
This folder is a complete static website (index.html + app.js).

OPTION A — Vercel CLI (fastest, ~2 minutes)
1. Install Node.js if you don't have it (nodejs.org)
2. Open a terminal in this folder and run:
      npx vercel --prod
3. First run: it opens your browser to log in to Vercel, then asks a few
   questions — accept the defaults (no build command, output directory ".")
4. Done — it prints your live URL, e.g. https://cardguard.vercel.app

OPTION B — GitHub import (best if you'll keep iterating)
1. Create a new GitHub repository and upload these files to it
2. Go to https://vercel.com/new and import that repository
3. Framework preset: "Other". Build command: none. Output directory: ./
4. Click Deploy — every future push to the repo auto-deploys

TEST CREDENTIALS (shown on the login page)
- User (own number):        9876543210
- User (alternate number):  9123456789
- Admin:                    9999999999
- OTP for everything:       1234

NOTES
- Data lives in each visitor's browser (localStorage) — good for demos.
- Before real production: real OTPs (MSG91), a real database (Supabase),
  Razorpay for the Rs.50 fee, and verify every bank's SMS number/format
  directly with the bank.
