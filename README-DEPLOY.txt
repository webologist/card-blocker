CardGuard — Deploy to Netlify (2 minutes)
=========================================
This folder is a complete static website. To deploy:

OPTION A — Drag & drop (fastest, no account setup beyond signup)
1. Go to https://app.netlify.com/drop
2. Drag this entire folder (the one containing index.html) onto the page
3. Done — Netlify gives you a live URL like https://random-name.netlify.app
4. Optional: click "Site settings" to rename it, e.g. cardguard.netlify.app

OPTION B — Netlify CLI
1. npm install -g netlify-cli
2. cd into this folder
3. netlify deploy --prod --dir .

TEST CREDENTIALS (shown on the login page)
- User (own number):        9876543210
- User (alternate number):  9123456789
- Admin:                    9999999999
- OTP for everything:       1234

NOTES
- Data is stored in each visitor's browser (localStorage). Different
  visitors/devices see their own data. Fine for demos and user testing.
- Before real production: replace dummy OTP with an SMS gateway (MSG91),
  move data to a real database (Supabase), add Razorpay for the Rs.50 fee,
  and verify every bank's SMS number/format directly with the bank.
