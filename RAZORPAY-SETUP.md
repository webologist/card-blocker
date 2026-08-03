# Razorpay Payment Gateway Integration

This guide explains how to set up and use the Razorpay payment gateway integration in BlockMyCard.

## Prerequisites

- Razorpay account (sign up at https://razorpay.com)
- Admin access to BlockMyCard (phone: 9223548779)
- Supabase project with `razorpay_settings` table

## Step 1: Get Razorpay API Keys

1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com)
2. Navigate to **Settings → API Keys**
3. Copy your:
   - **Key ID** (public key, starts with `rzp_live_` or `rzp_test_`)
   - **Key Secret** (private key - keep this secret!)

### Test vs. Live Mode

- **Test Keys**: Use `rzp_test_*` keys for development/testing (use dummy card 4111111111111111)
- **Live Keys**: Use `rzp_live_*` keys for production payments

## Step 2: Create Razorpay Settings Table in Supabase

Run this SQL in your Supabase SQL editor:

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
```

## Step 3: Configure Razorpay in Admin Console

### Via Admin Panel (Recommended)

1. Log in as admin (phone: 9223548779)
2. Navigate to the admin console (usually at `/admin` or via the admin dashboard)
3. Click on the **"Razorpay"** tab
4. Enter your Razorpay API credentials:
   - **Razorpay Key ID**: Your public key
   - **Razorpay Key Secret**: Your private key
5. Enable the checkbox to activate Razorpay
6. Click **Save Settings**

### Via API (cURL)

```bash
curl -X POST http://localhost:3000/api/razorpay/settings \
  -H "Content-Type: application/json" \
  -H "x-admin-key: YOUR_ADMIN_API_SECRET" \
  -d '{
    "enabled": true,
    "razorpay_key_id": "rzp_test_1Aa00000000001",
    "razorpay_key_secret": "YOUR_SECRET_KEY"
  }'
```

## Step 4: Add Razorpay Checkout to Your Frontend

### HTML Integration

```html
<!-- Add Razorpay script -->
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>

<!-- Include the checkout module -->
<script src="./lib/razorpay-checkout.js"></script>

<!-- Add a payment button -->
<button id="pay-btn">Pay with Razorpay</button>

<script>
  const checkout = new RazorpayCheckout({
    onSuccess: function(response) {
      console.log('Payment successful!', response);
      // Update user's subscription status
    },
    onError: function(error) {
      console.error('Payment failed:', error);
      alert('Payment failed: ' + error.message);
    },
    onClose: function() {
      console.log('Payment window closed');
    }
  });

  document.getElementById('pay-btn').addEventListener('click', function() {
    checkout.checkout(999, {  // Amount in INR
      description: 'BlockMyCard Premium - 1 Year',
      email: 'user@example.com',
      phone: '+919876543210',
      name: 'User Name'
    });
  });
</script>
```

### JavaScript Usage

```javascript
const checkout = new RazorpayCheckout({
  onSuccess: (response) => {
    console.log('Payment verified:', response);
    // Handle successful payment
  },
  onError: (error) => {
    console.error('Payment failed:', error);
  },
  onClose: () => {
    console.log('Payment modal closed');
  }
});

// Start checkout with amount (in INR)
await checkout.checkout(999, {
  description: 'Premium Subscription',
  phone: '9876543210',
  email: 'user@example.com',
  name: 'User Name'
});
```

## API Endpoints

### Get Razorpay Public Key

```bash
GET /api/razorpay/public-key
```

Response (when enabled):
```json
{
  "key_id": "rzp_live_xxx..."
}
```

### Create Payment Order

```bash
POST /api/razorpay/create-order
Content-Type: application/json

{
  "amount": 999,        // Amount in INR
  "description": "Premium",
  "phone": "9876543210" // Optional
}
```

Response:
```json
{
  "ok": true,
  "order": {
    "id": "order_xxx...",
    "entity": "order",
    "amount": 99900,      // Amount in paise
    "currency": "INR",
    "receipt": "order_timestamp_phone",
    "status": "created"
  }
}
```

### Verify Payment

```bash
POST /api/razorpay/verify-payment
Content-Type: application/json

{
  "razorpay_order_id": "order_xxx...",
  "razorpay_payment_id": "pay_xxx...",
  "razorpay_signature": "signature_hash"
}
```

Response (success):
```json
{
  "ok": true,
  "message": "Payment verified successfully"
}
```

### Admin: Get Razorpay Settings

```bash
GET /api/razorpay/settings
x-phone-token: YOUR_PHONE_TOKEN
# OR
x-admin-key: YOUR_ADMIN_API_SECRET
```

Response:
```json
{
  "ok": true,
  "data": {
    "id": 1,
    "enabled": true,
    "razorpay_key_id": "rzp_test_1Aa***",
    "razorpay_key_secret": "***abc123",
    "updated_at": "2024-08-03T10:30:00Z"
  }
}
```

### Admin: Update Razorpay Settings

```bash
POST /api/razorpay/settings
Content-Type: application/json
x-phone-token: YOUR_PHONE_TOKEN
# OR
x-admin-key: YOUR_ADMIN_API_SECRET

{
  "enabled": true,
  "razorpay_key_id": "rzp_test_1Aa00000000001",
  "razorpay_key_secret": "YOUR_SECRET_KEY"
}
```

## Testing Payment Flow

### Test Cards (Razorpay Test Mode)

Use these cards to test your integration:

- **Visa**: 4111 1111 1111 1111
- **Mastercard**: 5555 5555 5555 4444
- **Amex**: 3782 822463 10005

For all test cards, use:
- **Expiry**: Any future date (e.g., 12/25)
- **CVV**: Any 3-digit number (e.g., 123)

### Test Payment Flow

1. Enable Razorpay with test keys in admin panel
2. Click the payment button
3. Use a test card from the list above
4. Complete the payment flow
5. Verify payment was recorded correctly

## Production Checklist

- [ ] Switch to live Razorpay keys (rzp_live_*)
- [ ] Update admin panel with live keys
- [ ] Test with real payment (minimum amount)
- [ ] Verify payment email notifications
- [ ] Set up webhook handlers (optional, for async updates)
- [ ] Add payment success/failure landing pages
- [ ] Document refund policy
- [ ] Test payment reconciliation

## Security Best Practices

1. **Never expose Key Secret in client code** - All verification happens on backend
2. **Use HTTPS only** - Razorpay requires HTTPS for live payments
3. **Validate payments on backend** - Always verify signature server-side
4. **Store API keys in environment variables** - Don't hardcode credentials
5. **Rotate keys periodically** - Update Razorpay keys regularly
6. **Monitor for fraud** - Use Razorpay's fraud detection tools
7. **Implement rate limiting** - Prevent abuse of payment endpoints

## Troubleshooting

### "Razorpay is not configured"

- Check that razorpay_settings table exists in Supabase
- Ensure enabled=true and both API keys are set
- Verify admin credentials are correct

### Payment verification fails

- Check that razorpay_key_secret is correct
- Verify signature calculation uses correct order ID and payment ID
- Ensure backend timestamp is synchronized

### Admin panel not showing Razorpay tab

- Make sure you're logged in as admin (phone: 9223548779)
- Check browser console for errors
- Verify admin-razorpay-toggle.js is loaded
- Clear browser cache

### Keys rejected by Razorpay

- Verify you copied the full key string (no spaces)
- Check that test/live mode matches your key prefix
- Ensure keys haven't expired in Razorpay dashboard

## Webhook Integration (Optional)

For production, consider adding webhook handlers to update payment status asynchronously:

```javascript
app.post('/api/razorpay/webhook', (req, res) => {
  const crypto = require('crypto');
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  
  const signature = req.headers['x-razorpay-signature'];
  const body = req.rawBody; // Store raw request body
  
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  const hash = hmac.digest('hex');
  
  if (hash !== signature) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = req.body.event;
  const data = req.body.payload;

  // Handle different payment events
  switch(event) {
    case 'payment.authorized':
      // Update user subscription
      break;
    case 'payment.failed':
      // Log failed payment
      break;
    case 'payment.captured':
      // Process successful payment
      break;
  }

  res.json({ ok: true });
});
```

## Support

- Razorpay Docs: https://razorpay.com/docs/
- Test Cards: https://razorpay.com/docs/payments/cards/test-cards/
- API Reference: https://razorpay.com/docs/api/payments/
- Support: support@razorpay.com
