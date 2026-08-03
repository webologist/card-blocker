# Razorpay Admin Settings - Troubleshooting

## Error: "Error loading Razorpay settings. Please check your admin access."

This error means the API call to `/api/razorpay/settings` failed. Here's how to fix it:

---

## Step 1: Verify Database Table Exists

**In Supabase Dashboard:**

1. Go to SQL Editor
2. Run this query:
```sql
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'razorpay_settings'
);
```

**Expected result**: `true`

**If result is `false`**, create the table:

```sql
CREATE TABLE razorpay_settings (
  id INT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN DEFAULT false,
  razorpay_key_id TEXT,
  razorpay_key_secret TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT razorpay_settings_singleton CHECK (id = 1)
);

ALTER TABLE razorpay_settings ENABLE ROW LEVEL SECURITY;

-- Insert default row
INSERT INTO razorpay_settings (id, enabled) VALUES (1, false) ON CONFLICT (id) DO NOTHING;
```

---

## Step 2: Verify Admin Authentication

You must be logged in as admin phone: **9223548779**

**Check in Browser Console (F12):**

```javascript
// Check if phone token exists
sessionStorage.getItem('bmc_phone_token')
// Should return a long string like: eyJhbGciOiJIUzI1NiI...

// Check if logged in as admin
sessionStorage.getItem('bmc_phone')
// Should return: 9223548779
```

**If either is missing:**
1. Logout (click "Log out" button)
2. Log back in with phone: **9223548779**
3. Complete OTP verification
4. You should see admin console appear
5. Try Razorpay tab again

---

## Step 3: Check Browser Console for Detailed Error

1. Open Developer Tools: **F12** (or Ctrl+Shift+I)
2. Click on **Console** tab
3. Look for error messages starting with "Error loading Razorpay settings"
4. Check the full error response

**Common errors:**

### "401 Unauthorized"
- You're not logged in as admin
- Phone token has expired
- Solution: Log out and log back in

### "404 Not Found"
- Server not running
- API endpoint not deployed
- Solution: Restart server, check `server.js` has Razorpay routes

### "500 Internal Server Error"
- Database table doesn't exist
- Supabase connection error
- Solution: Create table (see Step 1)

---

## Step 4: Test API Directly with cURL

**Test if API is working:**

```bash
# 1. Get phone token from browser console
# sessionStorage.getItem('bmc_phone_token')

# 2. Replace YOUR_PHONE_TOKEN and run:
curl http://localhost:3000/api/razorpay/settings \
  -H "x-phone-token: YOUR_PHONE_TOKEN"

# Should return:
# {"ok":true,"data":{"id":1,"enabled":false,"razorpay_key_id":null,"razorpay_key_secret":null,"updated_at":"2024-08-03T10:30:00Z"}}
```

**If it works**, the issue is with the admin panel JavaScript. Try Step 5.

**If it fails with 401**, you're not properly authenticated.

**If it fails with 500**, check server logs and ensure database table exists.

---

## Step 5: Clear Browser Cache

The admin panel uses JavaScript. Cached code might be outdated.

**Clear cache:**
1. Press **Ctrl+Shift+Delete** (Windows) or **Cmd+Shift+Delete** (Mac)
2. Select "All time"
3. Check "Cookies and other site data"
4. Check "Cached images and files"
5. Click "Clear data"
6. Reload page (Ctrl+R)

**Or use hard refresh:**
- **Windows**: Ctrl+Shift+R
- **Mac**: Cmd+Shift+R

---

## Step 6: Verify Files Are Deployed

**Check that these files exist:**

```bash
# In project directory
ls -la admin-razorpay-toggle.js
ls -la lib/razorpay-settings-store.js
ls -la lib/razorpay-checkout.js

# Check server.js has Razorpay routes
grep "razorpay" server.js
```

**If missing**, pull latest code:
```bash
git pull origin main
npm install
```

---

## Step 7: Check Server Logs

**Look for Razorpay initialization message on startup:**

```
Database: razorpay_settings OK
```

**If you see warning instead:**
```
WARNING: razorpay_settings table missing!
Run this in Supabase SQL editor:
CREATE TABLE razorpay_settings ...
```

Then create the table as shown in Step 1.

---

## Complete Verification Checklist

- [ ] Razorpay settings table exists in Supabase
- [ ] Default row exists in table (id=1)
- [ ] Logged in as admin (9223548779)
- [ ] Session storage has `bmc_phone_token`
- [ ] Browser console shows no errors
- [ ] Server logs show "Database: razorpay_settings OK"
- [ ] admin-razorpay-toggle.js file exists
- [ ] server.js has `/api/razorpay/settings` endpoint
- [ ] Latest code is deployed

---

## Quick Test Flow

1. **Login** as 9223548779
2. **Open DevTools** (F12)
3. **Check sessionStorage:**
   ```javascript
   sessionStorage.getItem('bmc_phone_token') // Should have value
   ```
4. **Test API:**
   ```javascript
   fetch('/api/razorpay/settings', {
     headers: {'x-phone-token': sessionStorage.getItem('bmc_phone_token')}
   }).then(r => r.json()).then(console.log)
   
   // Should see: {ok: true, data: {...}}
   ```
5. **Clear cache** (Ctrl+Shift+Delete)
6. **Reload** (Ctrl+R)
7. **Click Razorpay tab**

---

## If Still Not Working

**Provide this debug info:**

```javascript
// Run in browser console (F12 → Console tab)
console.log('Phone Token:', sessionStorage.getItem('bmc_phone_token'));
console.log('Phone:', sessionStorage.getItem('bmc_phone'));
console.log('Admin OTP Mode:', window.__bmc_dummy_mode);

// Test API
fetch('/api/razorpay/settings', {
  headers: {'x-phone-token': sessionStorage.getItem('bmc_phone_token')}
}).then(r => r.json()).then(d => console.log('API Response:', d))
```

Copy the console output and share it.

---

## Server-Side Debugging

**Check server logs for errors:**

```bash
# If running locally:
npm start

# Look for:
# - "Razorpay URL:" error messages
# - "razorpay_settings table" warnings
# - Any "Error:" messages related to Supabase
```

**Restart server if needed:**

```bash
# Kill current process (Ctrl+C)
# Then restart:
npm start
```

---

## Files Recently Updated

These files were modified to fix the admin panel:

- ✅ **admin-razorpay-toggle.js** - Fixed localStorage → sessionStorage keys
- ✅ **server.js** - Already has Razorpay endpoints
- ✅ **index.html** - Already loads admin-razorpay-toggle.js

If you updated code after the fix, make sure you have the latest version.

---

## Summary

| Issue | Check | Solution |
|-------|-------|----------|
| Table missing | Supabase SQL | Run CREATE TABLE query |
| Not authenticated | sessionStorage.getItem('bmc_phone_token') | Log in as 9223548779 |
| Cached code | DevTools → Network tab | Ctrl+Shift+Delete cache |
| Server error | Server logs | Restart server |
| File missing | `ls admin-razorpay-toggle.js` | `git pull && npm install` |

---

**Still having issues?** Check the server console output and browser DevTools (F12) for the specific error message.
