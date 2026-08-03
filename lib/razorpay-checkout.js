// lib/razorpay-checkout.js
// Frontend Razorpay payment checkout handler

class RazorpayCheckout {
  constructor(options = {}) {
    this.onSuccess = options.onSuccess || (() => {});
    this.onError = options.onError || (() => {});
    this.onClose = options.onClose || (() => {});
  }

  async isEnabled() {
    try {
      const response = await fetch('/api/razorpay/public-key');
      return response.ok;
    } catch (e) {
      console.error('Error checking Razorpay status:', e);
      return false;
    }
  }

  async getPublicKey() {
    try {
      const response = await fetch('/api/razorpay/public-key');
      if (!response.ok) throw new Error('Razorpay not configured');
      const data = await response.json();
      return data.key_id;
    } catch (e) {
      console.error('Error getting Razorpay public key:', e);
      throw e;
    }
  }

  async createOrder(amount, description = 'BlockMyCard Premium', phone = null) {
    try {
      const response = await fetch('/api/razorpay/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, description, phone })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create order');
      }

      const data = await response.json();
      return data.order;
    } catch (e) {
      console.error('Error creating Razorpay order:', e);
      throw e;
    }
  }

  async verifyPayment(orderId, paymentId, signature) {
    try {
      const response = await fetch('/api/razorpay/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_signature: signature
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Payment verification failed');
      }

      const data = await response.json();
      return data.ok === true;
    } catch (e) {
      console.error('Error verifying payment:', e);
      throw e;
    }
  }

  async checkout(amount, options = {}) {
    const {
      description = 'BlockMyCard Premium',
      phone = null,
      email = null,
      name = null,
      prefill = {}
    } = options;

    try {
      // Ensure Razorpay script is loaded
      if (!window.Razorpay) {
        const script = document.createElement('script');
        script.src = 'https://checkout.razorpay.com/v1/checkout.js';
        script.async = true;
        document.body.appendChild(script);

        // Wait for script to load
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          setTimeout(reject, 5000);
        });
      }

      // Create order on backend
      const order = await this.createOrder(amount, description, phone);
      const publicKey = await this.getPublicKey();

      // Prepare Razorpay checkout options
      const checkoutOptions = {
        key: publicKey,
        amount: order.amount,
        currency: order.currency,
        name: 'BlockMyCard',
        description: description,
        order_id: order.id,
        prefill: {
          email: email || (prefill.email || ''),
          contact: phone || (prefill.contact || ''),
          name: name || (prefill.name || '')
        },
        theme: {
          color: '#d63a2a'
        },
        handler: async (response) => {
          try {
            const verified = await this.verifyPayment(
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            );

            if (verified) {
              this.onSuccess({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature
              });
            } else {
              this.onError(new Error('Payment verification failed'));
            }
          } catch (error) {
            this.onError(error);
          }
        },
        modal: {
          ondismiss: () => {
            this.onClose();
          }
        }
      };

      // Open Razorpay checkout
      const razorpay = new window.Razorpay(checkoutOptions);
      razorpay.open();
    } catch (error) {
      this.onError(error);
    }
  }
}

// Export for both browser and Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RazorpayCheckout;
}
