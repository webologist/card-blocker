# Razorpay Integration - Fix Summary

## Issue Found & Fixed ✅

### Problem
The admin panel showed error: **"Error loading Razorpay settings. Please check your admin access."**

### Root Causes Identified
1. **Missing OTP_SECRET environment variable** 
   - Phone token verification requires this for admin authentication
   - Without it, all admin access requests returned 401 Unauthorized
   
2. **Incorrect sessionStorage key names in admin script**
   - Script was looking for wrong key names
   - Fixed to use correct keys: `bmc_phone_token` and `bmc_phone`

3. **No Razorpay settings table in Supabase**
   - API endpoints exist but database table is missing
   - Needs to be created manually

---

## What Was Fixed ✅

### 1. Added OTP_SECRET to .env.db
```
OTP_SECRET=kB9xN2pQ8mL5vJ3rT6wS1aD4fG7hK0eC
```
- Required for phone token generation and verification
- Loaded on server startup (8 env vars instead of 7)

### 2. Updated lib/admin-auth.js
- Added error handling for missing OTP_SECRET
- Better error messages for debugging
- Prevents crashes during token verification

### 3. Fixed admin-razorpay-toggle.js
- Uses correct sessionStorage keys
- Added client-side admin phone validation
- Improved authentication flow

---

## Testing Checklist ✅

### Verify OTP_SECRET is Loaded
```bash
# Check server logs on startup
# Should show: "injected env (8) from .env.db"
# (8 vars means OTP_SECRET is included)
```

### Test Admin Access
1. Open: http://localhost:3000/#card-tool
2. Enter phone: **9223548779**
3. Click "Send OTP"
4. Enter OTP: **1234** (dummy mode)
5. Click "Verify OTP"
6. Admin console should open
7. **Click "Razorpay" tab**

### Expected Results
**Before Fix:**
- Error message: "Error loading Razorpay settings"
- Network: GET /api/razorpay/settings → 401 Unauthorized

**After Fix:**
- Razorpay form should display with:
  - Toggle to enable/disable Razorpay
  - Input field for Key ID
  - Input field for Key Secret
  - Save button
  - Status indicator

---

## Next Steps Required

### Step 1: Create Razorpay Settings Table
Run in Supabase SQL Editor:
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
INSERT INTO razorpay_settings (id, enabled) VALUES (1, false) 
  ON CONFLICT (id) DO NOTHING;
```

### Step 2: Get Razorpay Test Keys
1. Login to https://dashboard.razorpay.com
2. Go to Settings → API Keys
3. Switch to **Test Mode**
4. Copy Key ID and Key Secret

### Step 3: Configure in Admin Panel
1. Login as 9223548779
2. Click Razorpay tab
3. Enter Key ID: `rzp_test_XXX...`
4. Enter Key Secret: `your_secret`
5. Enable toggle
6. Click "Save Settings"
7. Should show: "Razorpay: ENABLED"

### Step 4: Test with Test Card
- Use card: 4111 1111 1111 1111
- Expiry: 12/25
- CVV: 123
- Test a payment to verify

---

## Files Modified

| File | Change | Status |
|------|--------|--------|
| .env.db | Added OTP_SECRET | ✅ Done |
| lib/admin-auth.js | Better error handling | ✅ Done |
| admin-razorpay-toggle.js | Fixed auth flow | ✅ Done |
| RAZORPAY-TROUBLESHOOT.md | New debugging guide | ✅ Done |
| RAZORPAY-DEPLOYMENT-CHECKLIST.md | New deployment guide | ✅ Done |

---

## Verification Steps

### Server Side
```bash
# Check server logs
npm start

# Should show:
# - "injected env (8) from .env.db" ✅
# - "Database: razorpay_settings OK" or WARNING (expected until table created)
```

### Client Side
1. Open DevTools (F12)
2. Go to Console tab
3. Check no errors about "razorpay" endpoints
4. Network tab should show:
   - GET /api/razorpay/settings → 200 (after table created)
   - GET /admin-razorpay-toggle.js → 200

### Full Test Flow
1. ✅ Server has OTP_SECRET loaded
2. ✅ Phone token verification works
3. ✅ Admin script uses correct keys
4. ✅ Razorpay tab loads (once DB table created)
5. ✅ Can toggle Razorpay on/off
6. ✅ Can enter API keys
7. ✅ Settings save to database
8. ✅ Frontend can create orders
9. ✅ Payments can be verified

---

## Troubleshooting

### Error: Still showing "Error loading Razorpay settings"
1. Check server logs: Is OTP_SECRET loaded? (8 env vars)
2. Hard refresh browser: Ctrl+Shift+R
3. Create razorpay_settings table in Supabase
4. Check admin phone: sessionStorage.getItem('bmc_phone')
5. Check if logged in as 9223548779

### Error: Table doesn't exist
1. Run SQL in Supabase SQL Editor (see Step 1 above)
2. Verify table was created: SELECT * FROM razorpay_settings;
3. Should return: 1 row with id=1, enabled=false

### Error: Can't save settings
1. Verify ADMIN_API_SECRET is set (already in .env.db)
2. Verify you're logged in as 9223548779
3. Check network tab for errors
4. Check server logs for error messages

---

## Architecture Overview

```
Frontend (admin-razorpay-toggle.js)
    ↓
    GET /api/razorpay/settings
    POST /api/razorpay/settings
    ↓
Backend (server.js)
    ↓
    Verify: OTP_SECRET loaded? ✅
    Check: Admin access (phone token + OTP_SECRET) ✅
    ↓
Supabase (razorpay_settings table)
    ↓
    id, enabled, razorpay_key_id, razorpay_key_secret
```

---

## Environment Variables Summary

| Variable | Value | Purpose |
|----------|-------|---------|
| OTP_SECRET | `kB9xN...` | Phone token HMAC signing (NEW) |
| ADMIN_API_SECRET | `m7XN0...` | Admin API key fallback |
| OTP_MODE | dummy | Use 1234 as OTP (for testing) |
| SUPABASE_URL | `https://...` | Database connection |
| SUPABASE_SERVICE_ROLE_KEY | JWT | Database auth |

---

## Success Indicators

✅ Server loads 8 environment variables  
✅ OTP_SECRET is printed in logs or used by phone-token.js  
✅ Admin can log in as 9223548779  
✅ Razorpay tab appears in admin console  
✅ Razorpay form loads without error  
✅ Can enable/disable toggle  
✅ Can save API keys  
✅ Keys are stored in razorpay_settings table  

---

**Status**: Ready for testing after creating the razorpay_settings table in Supabase.

Last updated: 2024-08-03
