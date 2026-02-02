// API Configuration
// ============================================
// IMPORTANT: Change this to your computer's IP address when testing on phone
// ============================================
// How to find your IP:
// - Windows: Open CMD and type 'ipconfig', look for IPv4 Address
// - Mac/Linux: Open Terminal and type 'ifconfig' or 'ip addr'
// ============================================

// For testing on same device (emulator)
// const API_URL = 'http://localhost:5000';

// For testing on Android Emulator
// const API_URL = 'http://10.0.2.2:5000';

// For testing on physical phone (use your computer's IP)
// Find your IP and replace below:
const API_URL = 'http://192.168.156.203:5000'; // ← YOUR COMPUTER'S IP

// Example: If your IP is 192.168.1.50, use:
// const API_URL = 'http://192.168.1.50:5000';

export default {
  API_URL,
  
  // API Endpoints
  endpoints: {
    // Auth
    buyerRegister: '/api/buyer/register',
    buyerLogin: '/api/buyer/login',
    sellerRegister: '/api/auth/register',
    sellerLogin: '/api/auth/login',
    
    // Marketplace
    categories: '/api/categories',
    products: '/api/marketplace/products',
    productDetails: '/api/marketplace/products',
    
    // Buyer
    profile: '/api/buyer/profile',
    wishlist: '/api/buyer/wishlist',
    cart: '/api/buyer/cart',
    addresses: '/api/buyer/addresses',
    
    // Orders
    checkout: '/api/checkout',
    orders: '/api/buyer-orders',
    
    // Payments
    paymentMethods: '/api/payments/methods',
    initiatePayment: '/api/payments/initiate',
    
    // Delivery
    deliveryOptions: '/api/delivery/options',
    
    // Reviews
    reviews: '/api/reviews',
    
    // Notifications
    notifications: '/api/notifications',
    
    // Recommendations
    recommendations: '/api/recommendations',
    
    // Rewards
    rewards: '/api/rewards',
    
    // Chat
    conversations: '/api/chat/conversations',
    messages: '/api/chat/messages',
    
    // Seller
    sellerProducts: '/api/products',
    sellerOrders: '/api/orders',
    sellerDashboard: '/api/seller-dashboard',
    
    // Offers
    offers: '/api/offers',
  }
};
