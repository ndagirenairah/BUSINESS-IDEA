# 🇺🇬 Modern Marketplace API - Uganda 2026

A complete marketplace backend with **Mobile Money payments**, **delivery options**, **smart recommendations**, and **real-time notifications**.

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 3. Start server
npm run dev
```

---

## 💳 Payment System

### Supported Payment Methods

| Method | ID | Category | Popular |
|--------|-----|----------|---------|
| MTN Mobile Money | `mtn_mobile_money` | mobile_money | ✅ |
| Airtel Money | `airtel_money` | mobile_money | ✅ |
| Africell Money | `africell_money` | mobile_money | |
| Visa Card | `visa` | card | ✅ |
| Mastercard | `mastercard` | card | |
| Cash on Delivery | `cash_on_delivery` | cod | ✅ |

### Payment Flow

```
1. Buyer selects products → /api/checkout/initiate
2. Choose delivery method → /api/checkout/delivery
3. Complete checkout → /api/checkout/complete
4. Mobile Money: Buyer approves on phone
5. Card: Redirect to secure payment page
6. COD: Pay on delivery
```

### Payment Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payments/methods` | Get available payment methods |
| POST | `/api/payments/calculate` | Calculate fees & total |
| POST | `/api/payments/initiate` | Start payment |
| GET | `/api/payments/status/:id` | Check payment status |
| POST | `/api/payments/verify/:id` | Verify payment (Mobile Money) |
| GET | `/api/payments/receipt/:id` | Get receipt |
| POST | `/api/payments/confirm-delivery/:id` | Release escrow |

---

## 🛒 Checkout Flow

### Complete Checkout API

```javascript
// Step 1: Initiate checkout
POST /api/checkout/initiate
{
  "items": [
    { "productId": "xxx", "quantity": 2 }
  ],
  "shippingAddress": {
    "street": "Plot 12, Kampala Road",
    "city": "Kampala",
    "country": "Uganda"
  }
}

// Step 2: Select delivery
POST /api/checkout/delivery
{
  "deliveryMethod": "safeboda", // safeboda, faras, personal, pickup
  "deliveryAddress": { ... },
  "deliveryInstructions": "Call when arriving"
}

// Step 3: Complete order
POST /api/checkout/complete
{
  "items": [...],
  "delivery": {
    "method": "safeboda",
    "address": { ... },
    "fee": 5000
  },
  "paymentMethod": "mtn_mobile_money",
  "phoneNumber": "0771234567",
  "useEscrow": true
}
```

---

## 🚚 Delivery System

### Delivery Methods

| Method | ID | Description |
|--------|-----|-------------|
| SafeBoda | `safeboda` | Fast boda delivery |
| Faras | `faras` | Car delivery service |
| Personal | `personal` | Seller's own delivery |
| Pickup | `pickup` | Customer picks up |
| Shipping | `shipping` | Standard shipping |

### Delivery Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/delivery/options/:businessId` | Get delivery options |
| POST | `/api/delivery/calculate-fee` | Calculate delivery fee |
| POST | `/api/delivery/select` | Select delivery for order |
| GET | `/api/delivery/track/:orderId` | Track delivery |
| POST | `/api/delivery/assign-rider` | Assign rider (seller) |
| PUT | `/api/delivery/status/:orderId` | Update status |

### Delivery Status Flow

```
pending → assigned → picked_up → in_transit → arrived → delivered
                                                    ↓
                                               failed → returned
```

---

## 🔔 Notifications

### Notification Types

- `new_product` - New product in interested category
- `price_drop` - Wishlist item price dropped
- `back_in_stock` - Wishlist item available
- `order_update` - Order status change
- `delivery_update` - Delivery status change
- `payment_success` - Payment confirmed
- `payment_failed` - Payment failed

### Notification Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Get all notifications |
| PUT | `/api/notifications/:id/read` | Mark as read |
| PUT | `/api/notifications/read-all` | Mark all as read |
| DELETE | `/api/notifications/:id` | Delete notification |

---

## 🎯 Smart Recommendations

The system learns buyer interests from:
- Categories browsed
- Products viewed
- Search queries
- Purchase history

### Recommendation Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/recommendations/for-you` | Personalized products |
| GET | `/api/recommendations/suggested` | AI suggestions |
| GET | `/api/recommendations/similar/:productId` | Similar products |
| GET | `/api/recommendations/home-feed` | Complete home feed |
| POST | `/api/recommendations/track/view` | Track product view |

---

## 👥 User Roles

### 1. Buyer (`/api/buyer`)
- Browse marketplace
- Add to cart/wishlist
- Place orders
- Track deliveries
- Make payments
- Write reviews

### 2. Seller (`/api/auth`, `/api/products`, `/api/orders`)
- Manage products
- Handle orders
- Set delivery zones
- View analytics
- Chat with buyers

### 3. Admin (`/api/admin`)
- Manage all users
- View platform stats
- Handle disputes
- Manage categories
- Process refunds

---

## 🔐 Authentication

### Buyer Auth
```javascript
POST /api/buyer/register
POST /api/buyer/login
// Returns: { token, buyer }
// Use header: Authorization: Bearer <token>
```

### Seller Auth
```javascript
POST /api/auth/register
POST /api/auth/login
// Returns: { token, user }
```

### Admin Auth
```javascript
POST /api/admin/login
// Returns: { token, admin }
```

---

## 📦 Product Categories

```
electronics, fashion, home_garden, health_beauty, sports, 
automotive, books, toys, food_beverages, services, other
```

---

## 💰 Fee Structure

| Fee Type | Rate |
|----------|------|
| Platform Service Fee | 2.5% of subtotal |
| Mobile Money Fee | Handled by Flutterwave |
| Card Processing Fee | Handled by gateway |

---

## 🔧 Environment Variables

```env
# Required
MONGODB_URI=mongodb://...
JWT_SECRET=your-secret

# Payment (Flutterwave)
FLUTTERWAVE_PUBLIC_KEY=FLWPUBK_TEST-xxx
FLUTTERWAVE_SECRET_KEY=FLWSECK_TEST-xxx
FLUTTERWAVE_WEBHOOK_SECRET=xxx

# Optional
STRIPE_SECRET_KEY=sk_test_xxx
FIREBASE_PROJECT_ID=xxx
```

---

## 📱 Mobile App Integration

### React Native / Expo Example

```javascript
// Initialize payment
const response = await fetch(`${API_URL}/api/payments/initiate`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    orderId: order._id,
    method: 'mtn_mobile_money',
    phoneNumber: '0771234567'
  })
});

const data = await response.json();

if (data.requiresAction && data.actionType === 'mobile_money_approval') {
  // Show "Check your phone for MTN prompt" message
  // Poll for payment status
  pollPaymentStatus(data.paymentId);
}
```

---

## 🌐 Webhook Setup (Flutterwave)

1. Go to Flutterwave Dashboard → Settings → Webhooks
2. Add URL: `https://your-domain.com/api/payments/webhook`
3. Copy the secret hash to your `.env`

---

## 📊 Analytics Endpoints

### Seller Analytics
```
GET /api/payments/seller/analytics
GET /api/payments/seller/transactions
```

### Admin Analytics
```
GET /api/admin/stats
GET /api/payments/admin/overview
GET /api/delivery/admin/overview
```

---

## ✅ Checklist for Production

- [ ] Set `NODE_ENV=production`
- [ ] Use production MongoDB (Atlas)
- [ ] Get live Flutterwave keys
- [ ] Configure webhook URL
- [ ] Set up SSL/HTTPS
- [ ] Enable rate limiting
- [ ] Set up Firebase for push notifications
- [ ] Configure SMS gateway (Africa's Talking)

---

Made with ❤️ for Uganda 🇺🇬
