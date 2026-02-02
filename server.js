const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

// Import routes
const authRoutes = require("./routes/auth");
const productRoutes = require("./routes/products");
const orderRoutes = require("./routes/orders");
const businessRoutes = require("./routes/business");
const chatRoutes = require("./routes/chat");
const buyerRoutes = require("./routes/buyer");
const buyerOrderRoutes = require("./routes/buyer-orders");
const adminRoutes = require("./routes/admin");
const marketplaceRoutes = require("./routes/marketplace");
const reviewRoutes = require("./routes/reviews");
const notificationRoutes = require("./routes/notifications");
const categoryRoutes = require("./routes/categories");
const recommendationRoutes = require("./routes/recommendations");
const deliveryRoutes = require("./routes/delivery");
const paymentRoutes = require("./routes/payments");
const checkoutRoutes = require("./routes/checkout");
const offerRoutes = require("./routes/offers");
const rewardRoutes = require("./routes/rewards");
const sellerDashboardRoutes = require("./routes/seller-dashboard");

// Import models for Socket.IO
const Message = require("./models/Message");
const Conversation = require("./models/Conversation");
const Notification = require("./models/Notification");

const app = express();
const server = http.createServer(app);

// Socket.IO setup with CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads")); // Serve uploaded images

// Database connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("✅ Database connected successfully"))
  .catch((err) => console.log("❌ Database connection error:", err));

// Routes - Seller/Business
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/business", businessRoutes);
app.use("/api/chat", chatRoutes);

// Routes - Buyer/Customer
app.use("/api/buyer", buyerRoutes);
app.use("/api/buyer-orders", buyerOrderRoutes);

// Routes - Marketplace (Public)
app.use("/api/marketplace", marketplaceRoutes);
app.use("/api/categories", categoryRoutes);

// Routes - Smart Recommendations & Notifications
app.use("/api/recommendations", recommendationRoutes);

// Routes - Delivery System
app.use("/api/delivery", deliveryRoutes);

// Routes - Payments
app.use("/api/payments", paymentRoutes);

// Routes - Checkout Flow
app.use("/api/checkout", checkoutRoutes);

// Routes - Offers/Negotiation
app.use("/api/offers", offerRoutes);

// Routes - Rewards/Gamification
app.use("/api/rewards", rewardRoutes);

// Routes - Seller Dashboard
app.use("/api/seller-dashboard", sellerDashboardRoutes);

// Routes - Reviews
app.use("/api/reviews", reviewRoutes);

// Routes - Notifications
app.use("/api/notifications", notificationRoutes);

// Routes - Admin
app.use("/api/admin", adminRoutes);

// Socket.IO Chat Logic
io.on("connection", (socket) => {
  console.log("👤 User connected:", socket.id);

  // Join a conversation room
  socket.on("join_conversation", (conversationId) => {
    socket.join(conversationId);
    console.log(`User joined conversation: ${conversationId}`);
  });

  // Send message
  socket.on("send_message", async (data) => {
    try {
      const { conversationId, senderId, senderName, senderType, message } = data;

      // Save message to database
      const newMessage = await Message.create({
        conversationId,
        senderId,
        senderName,
        senderType,
        message,
      });

      // Update conversation's last message
      await Conversation.findByIdAndUpdate(conversationId, {
        lastMessage: message,
        lastMessageAt: new Date(),
      });

      // Emit to all users in the conversation
      io.to(conversationId).emit("receive_message", newMessage);
    } catch (error) {
      console.error("Message error:", error);
    }
  });

  // Typing indicator
  socket.on("typing", (data) => {
    socket.to(data.conversationId).emit("user_typing", data);
  });

  socket.on("disconnect", () => {
    console.log("👤 User disconnected:", socket.id);
  });
});

// Welcome route - Complete API Documentation
app.get("/", (req, res) => {
  res.json({
    message: "🚀 Modern Marketplace API is running!",
    version: "2.0.0",
    
    // ====================================
    // 📱 APP FLOW DOCUMENTATION
    // ====================================
    appFlow: {
      step1_welcome: "User opens app → Login/Register or Continue as Guest",
      step2_roles: {
        buyer: "Can browse, search, wishlist, purchase, chat with sellers",
        seller: "Can add products, manage orders, respond to buyers, view analytics",
        admin: "Can manage all users, moderate products, send notifications",
      },
      step3_journey: "Buyer → Browse → View Product → Contact Seller → Purchase",
    },

    // ====================================
    // 🛒 BUYER ENDPOINTS
    // ====================================
    buyer: {
      auth: {
        register: "POST /api/buyer/register",
        login: "POST /api/buyer/login",
        profile: "GET /api/buyer/profile",
        updateProfile: "PUT /api/buyer/profile",
      },
      shopping: {
        browseProducts: "GET /api/marketplace",
        searchProducts: "GET /api/marketplace?search=laptop&category=electronics",
        filterProducts: "GET /api/marketplace?minPrice=100&maxPrice=500&city=Lagos",
        viewProduct: "GET /api/marketplace/product/:id",
        featured: "GET /api/marketplace/featured",
        trending: "GET /api/marketplace/trending",
      },
      categories: {
        allCategories: "GET /api/categories",
        categoriesWithCounts: "GET /api/categories?withCounts=true",
        singleCategory: "GET /api/categories/:categoryId",
        categoryProducts: "GET /api/categories/:categoryId/products",
        featuredByCategory: "GET /api/categories/featured/all",
      },
      wishlist: {
        getWishlist: "GET /api/buyer/wishlist",
        addToWishlist: "POST /api/buyer/wishlist/:productId",
        removeFromWishlist: "DELETE /api/buyer/wishlist/:productId",
      },
      orders: {
        placeOrder: "POST /api/buyer-orders",
        myOrders: "GET /api/buyer-orders",
        orderDetails: "GET /api/buyer-orders/:id",
        cancelOrder: "PUT /api/buyer-orders/:id/cancel",
        trackOrder: "GET /api/buyer-orders/track/:id?phone=xxx",
      },
      communication: {
        startChat: "POST /api/chat/start",
        myConversations: "GET /api/chat/buyer/conversations",
        getMessages: "GET /api/chat/messages/:conversationId",
        sendMessage: "POST /api/chat/message",
      },
      reviews: {
        writeReview: "POST /api/reviews/:productId",
        myReviews: "GET /api/reviews/my-reviews",
        productReviews: "GET /api/reviews/product/:productId",
      },
      notifications: "GET /api/notifications/buyer",
    },

    // ====================================
    // 🏪 SELLER ENDPOINTS
    // ====================================
    seller: {
      auth: {
        register: "POST /api/auth/register (creates business + owner)",
        login: "POST /api/auth/login",
        addStaff: "POST /api/auth/add-staff",
      },
      dashboard: {
        main: "GET /api/business/dashboard (stats, recent orders, top products)",
        analytics: "GET /api/business/analytics?period=30",
      },
      products: {
        myProducts: "GET /api/business/products",
        addProduct: "POST /api/products (with image upload)",
        updateProduct: "PUT /api/products/:id",
        deleteProduct: "DELETE /api/products/:id",
      },
      orders: {
        allOrders: "GET /api/business/orders",
        orderDetails: "GET /api/orders/:id",
        updateStatus: "PUT /api/business/orders/:orderId/status",
      },
      messages: {
        allMessages: "GET /api/business/messages",
        conversations: "GET /api/chat/conversations",
        archiveChat: "PUT /api/business/messages/:conversationId/archive",
      },
      profile: {
        getProfile: "GET /api/auth/me",
        updateBusiness: "PUT /api/business/update",
      },
      notifications: "GET /api/business/notifications",
    },

    // ====================================
    // 👑 ADMIN ENDPOINTS
    // ====================================
    admin: {
      auth: {
        setup: "POST /api/admin/setup (first admin only)",
        login: "POST /api/admin/login",
        createAdmin: "POST /api/admin/create",
      },
      dashboard: "GET /api/admin/dashboard",
      analytics: "GET /api/admin/analytics?period=30",
      users: {
        allBuyers: "GET /api/admin/buyers",
        toggleBuyerStatus: "PUT /api/admin/buyers/:id/status",
        allSellers: "GET /api/admin/sellers",
        toggleSellerStatus: "PUT /api/admin/sellers/:id/status",
      },
      products: {
        allProducts: "GET /api/admin/products",
        approveProduct: "PUT /api/admin/products/:id/approve",
        rejectProduct: "PUT /api/admin/products/:id/reject",
        deleteProduct: "DELETE /api/admin/products/:id",
      },
      notifications: {
        broadcast: "POST /api/admin/notifications/broadcast",
      },
    },

    // ====================================
    // � PRODUCT CATEGORIES
    // ====================================
    productCategories: {
      electronics: { name: "Electronics", icon: "📱", examples: "Phones, Laptops, TVs" },
      fashion: { name: "Fashion & Clothing", icon: "👗", examples: "Clothes, Shoes, Accessories" },
      home: { name: "Home & Living", icon: "🏡", examples: "Furniture, Kitchen, Décor" },
      beauty: { name: "Beauty & Health", icon: "💄", examples: "Skincare, Makeup, Fitness" },
      vehicles: { name: "Vehicles", icon: "🚗", examples: "Cars, Bikes, Parts" },
      books: { name: "Books & Stationery", icon: "📚", examples: "Books, Office Supplies" },
      services: { name: "Services", icon: "🛠️", examples: "Cleaning, Tutoring, Repairs" },
      food: { name: "Food & Groceries", icon: "🍔", examples: "Fresh, Packaged, Ready-to-Eat" },
      others: { name: "Others", icon: "🔄", examples: "Pets, Toys, Collectibles" },
    },

    // ====================================
    // �💬 REAL-TIME FEATURES (Socket.IO)
    // ====================================
    realtime: {
      connect: "io.connect('http://localhost:5000')",
      events: {
        join_conversation: "Join a chat room",
        send_message: "Send message in real-time",
        receive_message: "Receive messages live",
        typing: "Show typing indicator",
      },
    },

    // ====================================
    // ✨ KEY FEATURES
    // ====================================
    features: [
      "🛍️ Multi-seller marketplace like OLX/Jumia",
      "� 9 Product categories with subcategories",
      "👤 Buyer accounts with wishlist & order history",
      "🏪 Seller dashboard with analytics",
      "⭐ Product reviews & ratings",
      "💬 Real-time chat (Socket.IO)",
      "🔔 Push notifications for all events",
      "👑 Admin panel for moderation",
      "🖼️ Image uploads for products",
      "🔍 Search & filter by category, price, location",
      "📍 Location-based filtering",
    ],
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 API ready at http://localhost:${PORT}`);
  console.log(`💬 Socket.IO chat ready!`);
});
