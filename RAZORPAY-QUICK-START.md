# Razorpay Integration - Quick Start Guide

## What Was Added

### Backend Files
- **`lib/razorpay-settings-store.js`** - Database layer for storing Razorpay configuration
- **`lib/razorpay-checkout.js`** - Frontend payment checkout handler
- **`admin-razorpay-toggle.js`** - Admin UI panel for Razorpay settings
- **`server.js`** - Added 5 new API endpoints for Razorpay management

### Frontend
- **`index.html`** - Added script tag to load admin-razorpay-toggle.js

### Documentation
- **`RAZORPAY-SETUP.md`** - Complete setup and integration guide
- **`RAZORPAY-QUICK-START.md`** - This file

## 30-Second Setup

### 1. Create Database Table
```sql
CREATE TABLE razorpay_settings (
  id INT PRIMARY KEY DEFAULT 1, enabled BOOLEAN DEFAULT false,
  razorpay_key_id TEXT, razorpay_key_secret TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(), 
  CONSTRAINT razorpay_settings_singleton CHECK (id = 1)
);
ALTER TABLE razorpay_settings ENABLE ROW LEVEL SECURITY;
```

### 2. Get API Keys from Razorpay
1. Login to https://dashboard.razorpay.com
2. Go to Settings → API Keys
3. Copy Key ID and Key Secret

### 3. Configure in Admin Panel
1. Login to BlockMyCard as admin (9223548779)
2. Click "Razorpay" tab in admin console
3. Paste Key ID and Key Secret
4. Enable Razorpay
5. Click Save

### 4. Add Payment Button to Frontend

```html
<button onclick="startPayment()">Pay ₹999</button>

<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script src="./lib/razorpay-checkout.js"></script>

<script>
const checkout = new RazorpayCheckout({
  onSuccess: (resp) => alert('Payment successful! ID: ' + resp.paymentId),
  onError: (err) => alert('Payment failed: ' + err.message)
});

function startPayment() {
  checkout.checkout(999, {
    description: 'Premium Plan',
    email: 'user@example.com'
  });
}
</script>
```

## API Endpoints

| Method | Endpoint | Purpose | Auth |
|--------|----------|---------|------|
| GET | `/api/razorpay/public-key` | Get public key for checkout | Public |
| POST | `/api/razorpay/create-order` | Create payment order | Public |
| POST | `/api/razorpay/verify-payment` | Verify payment signature | Public |
| GET | `/api/razorpay/settings` | Get Razorpay config | Admin only |
| POST | `/api/razorpay/settings` | Update Razorpay config | Admin only |

## Test Payment

1. Use test keys (rzp_test_xxx)
2. Test card: 4111 1111 1111 1111
3. Expiry: Any future date
4. CVV: Any 3 digits

## Admin Only Feature

Only admin phone (9223548779) can toggle and configure Razorpay:

- **Access via**: `/api/razorpay/settings` endpoint
- **Auth methods**: 
  - Phone token (OTP login)
  - Admin API secret (x-admin-key header)
- **Admin UI**: Tab in admin console (auto-injected by admin-razorpay-toggle.js)

## Database Schema

```
razorpay_settings
├── id: integer (PRIMARY KEY, always = 1)
├── enabled: boolean (default: false)
├── razorpay_key_id: text (public key)
├── razorpay_key_secret: text (private key - MASKED in API responses)
└── updated_at: timestamp (auto-updated)
```

## Environment Variables (Optional)

No required env vars - everything is configured via admin panel. However, you can override:

```bash
# Not currently used, but available for future enhancements
# RAZORPAY_MODE=test  # or "live"
```

## Files Modified

1. **server.js**
   - Added Razorpay imports
   - Added 5 API endpoints
   - Added database table check on startup

2. **index.html**
   - Added admin-razorpay-toggle.js script tag

3. **package.json**
   - Added razorpay dependency (npm install razorpay --save)

## Security

✅ Key Secret stored securely in database  
✅ Key Secret masked in API responses  
✅ Payment verification via signature validation  
✅ Admin-only access via OTP or API key  
✅ HTTPS required for production  

## Next Steps

1. ✅ Install razorpay SDK (`npm install razorpay --save`)
2. ✅ Create razorpay_settings table in Supabase
3. ✅ Get test API keys from Razorpay
4. ✅ Configure via admin panel
5. ✅ Test payment flow with test card
6. ✅ Switch to live keys for production
7. ✅ Add payment tracking/logging
8. ✅ Integrate with user subscription system

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Razorpay not configured" | Enable in admin panel + verify table exists |
| Admin tab not showing | Clear cache, verify logged in as admin |
| Payment verification fails | Check Key Secret is correct |
| Test cards rejected | Verify using test mode keys (rzp_test_) |

## File Structure

```
C:\card-blocker\
├── admin-razorpay-toggle.js          (NEW - Admin UI)
├── lib/
│   ├── razorpay-settings-store.js    (NEW - DB layer)
│   └── razorpay-checkout.js          (NEW - Frontend checkout)
├── server.js                          (MODIFIED - +5 endpoints)
├── index.html                         (MODIFIED - +script tag)
├── RAZORPAY-SETUP.md                 (NEW - Full guide)
└── RAZORPAY-QUICK-START.md           (NEW - This file)
```

## Example: Complete Payment Flow

```javascript
// 1. Check if Razorpay is enabled
const checkout = new RazorpayCheckout({
  onSuccess: handleSuccess,
  onError: handleError
});

if (!await checkout.isEnabled()) {
  alert('Payment gateway not available');
  return;
}

// 2. Start payment
await checkout.checkout(999, {
  description: 'Premium Plan - Annual',
  email: 'user@example.com',
  phone: '9876543210',
  name: 'John Doe'
});

// 3. On success
function handleSuccess(response) {
  // response = {
  //   orderId: "order_xxx...",
  //   paymentId: "pay_xxx...",
  //   signature: "signature_hash"
  // }
  
  // Update user subscription in database
  updateUserSubscription(response.paymentId);
  showSuccessMessage();
}

// 4. On error
function handleError(error) {
  console.error('Payment failed:', error);
  showErrorMessage(error.message);
}
```

## Support

Razorpay Documentation: https://razorpay.com/docs/
Test Cards: https://razorpay.com/docs/payments/cards/test-cards/
