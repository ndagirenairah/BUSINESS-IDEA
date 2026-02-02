# 🚀 Business Management API

A powerful multi-business product management backend for your mobile app.

## 📁 Project Structure

```
business-backend/
├── server.js           # Main entry point
├── .env                # Environment variables
├── package.json
├── uploads/            # Product images storage
├── models/
│   ├── Business.js     # Business schema
│   ├── User.js         # User schema (owners & staff)
│   ├── Product.js      # Product schema
│   └── Order.js        # Order schema
├── routes/
│   ├── auth.js         # Authentication routes
│   ├── products.js     # Product CRUD routes
│   ├── orders.js       # Order management routes
│   └── business.js     # Business routes
└── middleware/
    ├── auth.js         # JWT authentication
    └── upload.js       # Image upload handler
```

## 🛠 Setup Instructions

### 1️⃣ Install MongoDB

Download and install MongoDB Community Server:
https://www.mongodb.com/try/download/community

### 2️⃣ Start MongoDB

```bash
# Windows - MongoDB should start automatically as a service
# Or run manually:
mongod
```

### 3️⃣ Run the Server

```bash
# Development mode (auto-restart on changes)
npm run dev

# Production mode
npm start
```

Server will run at: `http://localhost:5000`

---

## 📚 API ENDPOINTS

### 🔐 Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/register` | Register new business & owner | No |
| POST | `/login` | Login user | No |
| GET | `/me` | Get current user profile | Yes |
| POST | `/add-staff` | Add staff member | Yes (Owner) |

#### Register Example:
```json
POST /api/auth/register
{
  "businessName": "Fashion Store",
  "businessType": "clothing",
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "phone": "+1234567890",
  "whatsapp": "+1234567890",
  "location": "New York"
}
```

#### Login Example:
```json
POST /api/auth/login
{
  "email": "john@example.com",
  "password": "password123"
}
```

---

### 📦 Products (`/api/products`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get all products (public) | No |
| GET | `/my-products` | Get your business products | Yes |
| GET | `/:id` | Get single product | No |
| POST | `/` | Create new product | Yes |
| PUT | `/:id` | Update product | Yes |
| DELETE | `/:id` | Delete product | Yes |

#### Create Product Example:
```
POST /api/products
Content-Type: multipart/form-data
Authorization: Bearer <token>

name: "Blue T-Shirt"
category: "shirts"
price: 29.99
stock: 50
description: "Comfortable cotton t-shirt"
image: <file>
```

#### Query Parameters:
- `?category=shirts` - Filter by category
- `?search=blue` - Search by name
- `?businessId=xxx` - Filter by business

---

### 🛒 Orders (`/api/orders`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/` | Place new order (customer) | No |
| GET | `/my-orders` | Get your business orders | Yes |
| GET | `/:id` | Get single order | Yes |
| PUT | `/:id/status` | Update order status | Yes |
| GET | `/stats/summary` | Get order statistics | Yes |

#### Place Order Example:
```json
POST /api/orders
{
  "productId": "product_id_here",
  "customerName": "Jane Smith",
  "customerPhone": "+1234567890",
  "customerEmail": "jane@example.com",
  "quantity": 2,
  "notes": "Please deliver ASAP"
}
```

#### Update Order Status:
```json
PUT /api/orders/:id/status
Authorization: Bearer <token>
{
  "status": "accepted"
}
```

Status options: `pending`, `accepted`, `rejected`, `completed`, `cancelled`

---

### 🏪 Business (`/api/business`)

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/` | Get all businesses (public) | No |
| GET | `/:id` | Get single business | No |
| PUT | `/update` | Update business details | Yes (Owner) |

---

## 🔑 Authentication

Include the JWT token in the Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📱 Connecting from Mobile App

### Using Fetch:
```javascript
// Login
const response = await fetch('http://YOUR_IP:5000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const data = await response.json();

// Get products with auth
const products = await fetch('http://YOUR_IP:5000/api/products/my-products', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Using Axios:
```javascript
import axios from 'axios';

const API = axios.create({
  baseURL: 'http://YOUR_IP:5000/api'
});

// Add auth token to requests
API.interceptors.request.use(config => {
  const token = getToken(); // your token storage
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Use it
const { data } = await API.get('/products');
const { data } = await API.post('/auth/login', { email, password });
```

---

## 🧪 Testing with Postman

1. Import the endpoints above
2. Create an environment with `baseUrl = http://localhost:5000`
3. Test register → login → use token for protected routes

---

## 🌐 Deployment (Free Options)

### Backend:
- **Render** - render.com
- **Railway** - railway.app
- **Cyclic** - cyclic.sh

### Database:
- **MongoDB Atlas** - mongodb.com/atlas (free 512MB)

---

## 🎓 GitHub Student Pack Benefits

- Free hosting credits
- Free MongoDB Atlas upgrade
- Free domain names
- Professional developer tools

Get it at: https://education.github.com/pack

---

## 📞 Support

Built for your business management needs! 🚀
