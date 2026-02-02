import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import config from '../config/api';

// Create axios instance
const api = axios.create({
  baseURL: config.API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add auth token
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await SecureStore.getItemAsync('userToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.log('Error getting token:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      SecureStore.deleteItemAsync('userToken');
      SecureStore.deleteItemAsync('userData');
    }
    return Promise.reject(error);
  }
);

// ============================================
// AUTH SERVICES
// ============================================

export const authService = {
  // Buyer login
  buyerLogin: async (email, password) => {
    const response = await api.post('/api/buyer/login', { email, password });
    if (response.data.token) {
      await SecureStore.setItemAsync('userToken', response.data.token);
      await SecureStore.setItemAsync('userData', JSON.stringify(response.data.buyer));
      await SecureStore.setItemAsync('userType', 'buyer');
    }
    return response.data;
  },

  // Buyer register
  buyerRegister: async (userData) => {
    const response = await api.post('/api/buyer/register', userData);
    if (response.data.token) {
      await SecureStore.setItemAsync('userToken', response.data.token);
      await SecureStore.setItemAsync('userData', JSON.stringify(response.data.buyer));
      await SecureStore.setItemAsync('userType', 'buyer');
    }
    return response.data;
  },

  // Seller login
  sellerLogin: async (email, password) => {
    const response = await api.post('/api/auth/login', { email, password });
    if (response.data.token) {
      await SecureStore.setItemAsync('userToken', response.data.token);
      await SecureStore.setItemAsync('userData', JSON.stringify(response.data.user));
      await SecureStore.setItemAsync('userType', 'seller');
    }
    return response.data;
  },

  // Seller register
  sellerRegister: async (userData) => {
    const response = await api.post('/api/auth/register', userData);
    if (response.data.token) {
      await SecureStore.setItemAsync('userToken', response.data.token);
      await SecureStore.setItemAsync('userData', JSON.stringify(response.data.user));
      await SecureStore.setItemAsync('userType', 'seller');
    }
    return response.data;
  },

  // Logout
  logout: async () => {
    await SecureStore.deleteItemAsync('userToken');
    await SecureStore.deleteItemAsync('userData');
    await SecureStore.deleteItemAsync('userType');
  },

  // Get current user
  getCurrentUser: async () => {
    const userData = await SecureStore.getItemAsync('userData');
    const userType = await SecureStore.getItemAsync('userType');
    return {
      user: userData ? JSON.parse(userData) : null,
      userType,
    };
  },

  // Check if logged in
  isLoggedIn: async () => {
    const token = await SecureStore.getItemAsync('userToken');
    return !!token;
  },
};

// ============================================
// MARKETPLACE SERVICES
// ============================================

export const marketplaceService = {
  // Get categories
  getCategories: async () => {
    const response = await api.get('/api/categories');
    return response.data;
  },

  // Get products
  getProducts: async (params = {}) => {
    const response = await api.get('/api/marketplace/products', { params });
    return response.data;
  },

  // Get product details
  getProductDetails: async (productId) => {
    const response = await api.get(`/api/marketplace/products/${productId}`);
    return response.data;
  },

  // Search products
  searchProducts: async (query, filters = {}) => {
    const response = await api.get('/api/marketplace/search', {
      params: { q: query, ...filters },
    });
    return response.data;
  },

  // Get recommendations
  getRecommendations: async () => {
    const response = await api.get('/api/recommendations/for-you');
    return response.data;
  },

  // Get home feed
  getHomeFeed: async () => {
    const response = await api.get('/api/recommendations/home-feed');
    return response.data;
  },
};

// ============================================
// BUYER SERVICES
// ============================================

export const buyerService = {
  // Get profile
  getProfile: async () => {
    const response = await api.get('/api/buyer/profile');
    return response.data;
  },

  // Update profile
  updateProfile: async (data) => {
    const response = await api.put('/api/buyer/profile', data);
    return response.data;
  },

  // Wishlist
  getWishlist: async () => {
    const response = await api.get('/api/buyer/wishlist');
    return response.data;
  },

  addToWishlist: async (productId) => {
    const response = await api.post('/api/buyer/wishlist', { productId });
    return response.data;
  },

  removeFromWishlist: async (productId) => {
    const response = await api.delete(`/api/buyer/wishlist/${productId}`);
    return response.data;
  },

  // Addresses
  getAddresses: async () => {
    const response = await api.get('/api/buyer/addresses');
    return response.data;
  },

  addAddress: async (address) => {
    const response = await api.post('/api/buyer/addresses', address);
    return response.data;
  },
};

// ============================================
// ORDER SERVICES
// ============================================

export const orderService = {
  // Initiate checkout
  initiateCheckout: async (items, shippingAddress) => {
    const response = await api.post('/api/checkout/initiate', {
      items,
      shippingAddress,
    });
    return response.data;
  },

  // Select delivery
  selectDelivery: async (data) => {
    const response = await api.post('/api/checkout/delivery', data);
    return response.data;
  },

  // Complete checkout
  completeCheckout: async (orderData) => {
    const response = await api.post('/api/checkout/complete', orderData);
    return response.data;
  },

  // Get orders
  getOrders: async (params = {}) => {
    const response = await api.get('/api/buyer-orders', { params });
    return response.data;
  },

  // Get order details
  getOrderDetails: async (orderId) => {
    const response = await api.get(`/api/checkout/track/${orderId}`);
    return response.data;
  },
};

// ============================================
// PAYMENT SERVICES
// ============================================

export const paymentService = {
  // Get payment methods
  getMethods: async () => {
    const response = await api.get('/api/payments/methods');
    return response.data;
  },

  // Initiate payment
  initiatePayment: async (data) => {
    const response = await api.post('/api/payments/initiate', data);
    return response.data;
  },

  // Verify payment
  verifyPayment: async (paymentId) => {
    const response = await api.post(`/api/payments/verify/${paymentId}`);
    return response.data;
  },

  // Get payment status
  getStatus: async (paymentId) => {
    const response = await api.get(`/api/payments/status/${paymentId}`);
    return response.data;
  },
};

// ============================================
// DELIVERY SERVICES
// ============================================

export const deliveryService = {
  // Get delivery options
  getOptions: async (businessId) => {
    const response = await api.get(`/api/delivery/options/${businessId}`);
    return response.data;
  },

  // Calculate fee
  calculateFee: async (data) => {
    const response = await api.post('/api/delivery/calculate-fee', data);
    return response.data;
  },

  // Track delivery
  trackDelivery: async (orderId) => {
    const response = await api.get(`/api/delivery/track/${orderId}`);
    return response.data;
  },
};

// ============================================
// REVIEW SERVICES
// ============================================

export const reviewService = {
  // Get product reviews
  getProductReviews: async (productId) => {
    const response = await api.get(`/api/reviews/product/${productId}`);
    return response.data;
  },

  // Add review
  addReview: async (data) => {
    const response = await api.post('/api/reviews', data);
    return response.data;
  },
};

// ============================================
// NOTIFICATION SERVICES
// ============================================

export const notificationService = {
  // Get notifications
  getNotifications: async () => {
    const response = await api.get('/api/notifications');
    return response.data;
  },

  // Mark as read
  markAsRead: async (notificationId) => {
    const response = await api.put(`/api/notifications/${notificationId}/read`);
    return response.data;
  },

  // Mark all as read
  markAllAsRead: async () => {
    const response = await api.put('/api/notifications/read-all');
    return response.data;
  },
};

// ============================================
// REWARDS SERVICES
// ============================================

export const rewardsService = {
  // Get my rewards
  getMyRewards: async () => {
    const response = await api.get('/api/rewards/my-rewards');
    return response.data;
  },

  // Claim daily bonus
  claimDailyBonus: async () => {
    const response = await api.post('/api/rewards/daily-bonus');
    return response.data;
  },

  // Redeem points
  redeemPoints: async (points) => {
    const response = await api.post('/api/rewards/redeem', { points });
    return response.data;
  },

  // Get leaderboard
  getLeaderboard: async () => {
    const response = await api.get('/api/rewards/leaderboard');
    return response.data;
  },
};

// ============================================
// OFFER SERVICES
// ============================================

export const offerService = {
  // Make offer
  makeOffer: async (data) => {
    const response = await api.post('/api/offers', data);
    return response.data;
  },

  // Get my offers
  getMyOffers: async () => {
    const response = await api.get('/api/offers/my-offers');
    return response.data;
  },

  // Accept counter offer
  acceptCounter: async (offerId) => {
    const response = await api.post(`/api/offers/${offerId}/accept-counter`);
    return response.data;
  },

  // Withdraw offer
  withdrawOffer: async (offerId) => {
    const response = await api.post(`/api/offers/${offerId}/withdraw`);
    return response.data;
  },
};

// ============================================
// CHAT SERVICES
// ============================================

export const chatService = {
  // Get conversations
  getConversations: async () => {
    const response = await api.get('/api/chat/buyer/conversations');
    return response.data;
  },

  // Get messages
  getMessages: async (conversationId) => {
    const response = await api.get(`/api/chat/conversations/${conversationId}/messages`);
    return response.data;
  },

  // Start conversation
  startConversation: async (businessId, productId) => {
    const response = await api.post('/api/chat/buyer/start', { businessId, productId });
    return response.data;
  },

  // Send message
  sendMessage: async (conversationId, message) => {
    const response = await api.post(`/api/chat/conversations/${conversationId}/messages`, {
      message,
    });
    return response.data;
  },
};

// ============================================
// SELLER SERVICES
// ============================================

export const sellerService = {
  // Dashboard
  getDashboard: async () => {
    const response = await api.get('/api/seller-dashboard/overview');
    return response.data;
  },

  // Get products
  getProducts: async () => {
    const response = await api.get('/api/products');
    return response.data;
  },

  // Add product
  addProduct: async (formData) => {
    const response = await api.post('/api/products', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Update product
  updateProduct: async (productId, data) => {
    const response = await api.put(`/api/products/${productId}`, data);
    return response.data;
  },

  // Delete product
  deleteProduct: async (productId) => {
    const response = await api.delete(`/api/products/${productId}`);
    return response.data;
  },

  // Get orders
  getOrders: async (params = {}) => {
    const response = await api.get('/api/orders', { params });
    return response.data;
  },

  // Update order status
  updateOrderStatus: async (orderId, status) => {
    const response = await api.put(`/api/orders/${orderId}/status`, { status });
    return response.data;
  },

  // Get analytics
  getAnalytics: async (period = '30d') => {
    const response = await api.get('/api/seller-dashboard/analytics/sales', {
      params: { period },
    });
    return response.data;
  },

  // Get offers
  getOffers: async () => {
    const response = await api.get('/api/offers/seller');
    return response.data;
  },

  // Accept offer
  acceptOffer: async (offerId) => {
    const response = await api.post(`/api/offers/${offerId}/accept`);
    return response.data;
  },

  // Counter offer
  counterOffer: async (offerId, counterPrice, message) => {
    const response = await api.post(`/api/offers/${offerId}/counter`, {
      counterPrice,
      message,
    });
    return response.data;
  },

  // Reject offer
  rejectOffer: async (offerId, message) => {
    const response = await api.post(`/api/offers/${offerId}/reject`, { message });
    return response.data;
  },
};

export default api;
