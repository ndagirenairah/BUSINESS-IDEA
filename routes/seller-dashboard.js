const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Product = require("../models/Product");
const Payment = require("../models/Payment");
const Review = require("../models/Review");
const Offer = require("../models/Offer");
const Business = require("../models/Business");
const Conversation = require("../models/Conversation");
const { protect } = require("../middleware/auth");

/**
 * Seller Dashboard Routes
 * Comprehensive analytics and management for sellers
 */

// ============================================
// DASHBOARD OVERVIEW
// ============================================

/**
 * @route   GET /api/seller-dashboard/overview
 * @desc    Get seller dashboard overview with all key metrics
 * @access  Private (Seller)
 */
router.get("/overview", protect, async (req, res) => {
  try {
    const sellerId = req.user._id;

    // Get business
    const business = await Business.findOne({ owner: sellerId });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found. Please create a business first.",
      });
    }

    const businessId = business._id;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Parallel queries for performance
    const [
      // Products
      totalProducts,
      activeProducts,
      outOfStock,

      // Orders
      totalOrders,
      ordersToday,
      ordersThisWeek,
      pendingOrders,
      processingOrders,

      // Revenue
      totalRevenue,
      revenueToday,
      revenueThisWeek,
      revenueThisMonth,

      // Reviews
      totalReviews,
      averageRating,

      // Offers
      pendingOffers,

      // Messages
      unreadMessages,
    ] = await Promise.all([
      // Products
      Product.countDocuments({ businessId }),
      Product.countDocuments({ businessId, isActive: true, stock: { $gt: 0 } }),
      Product.countDocuments({ businessId, stock: 0 }),

      // Orders
      Order.countDocuments({ businessId }),
      Order.countDocuments({ businessId, createdAt: { $gte: today } }),
      Order.countDocuments({ businessId, createdAt: { $gte: thisWeek } }),
      Order.countDocuments({ businessId, status: "pending" }),
      Order.countDocuments({ businessId, status: "processing" }),

      // Revenue
      Order.aggregate([
        {
          $match: {
            businessId,
            status: { $in: ["completed", "delivered"] },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),
      Order.aggregate([
        {
          $match: {
            businessId,
            status: { $in: ["completed", "delivered"] },
            createdAt: { $gte: today },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),
      Order.aggregate([
        {
          $match: {
            businessId,
            status: { $in: ["completed", "delivered"] },
            createdAt: { $gte: thisWeek },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),
      Order.aggregate([
        {
          $match: {
            businessId,
            status: { $in: ["completed", "delivered"] },
            createdAt: { $gte: thisMonth },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),

      // Reviews
      Review.countDocuments({ businessId }),
      Review.aggregate([
        { $match: { businessId } },
        { $group: { _id: null, avg: { $avg: "$rating" } } },
      ]),

      // Offers
      Offer.countDocuments({ sellerId, status: "pending" }),

      // Messages (unread conversations)
      Conversation.countDocuments({
        businessId,
        "lastMessage.read": false,
        "lastMessage.senderType": "buyer",
      }),
    ]);

    // Get recent orders
    const recentOrders = await Order.find({ businessId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("orderNumber customerName totalPrice status createdAt items");

    // Get top products
    const topProducts = await Product.find({ businessId })
      .sort({ "stats.totalViews": -1 })
      .limit(5)
      .select("name price images stats stock");

    // Get revenue trend (last 7 days)
    const revenueTrend = await Order.aggregate([
      {
        $match: {
          businessId,
          status: { $in: ["completed", "delivered"] },
          createdAt: { $gte: thisWeek },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$totalPrice" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      dashboard: {
        business: {
          name: business.name,
          logo: business.logo,
          isVerified: business.isVerified,
        },

        products: {
          total: totalProducts,
          active: activeProducts,
          outOfStock,
        },

        orders: {
          total: totalOrders,
          today: ordersToday,
          thisWeek: ordersThisWeek,
          pending: pendingOrders,
          processing: processingOrders,
        },

        revenue: {
          total: totalRevenue[0]?.total || 0,
          today: revenueToday[0]?.total || 0,
          thisWeek: revenueThisWeek[0]?.total || 0,
          thisMonth: revenueThisMonth[0]?.total || 0,
          currency: "UGX",
        },

        ratings: {
          totalReviews,
          averageRating: Math.round((averageRating[0]?.avg || 0) * 10) / 10,
        },

        engagement: {
          pendingOffers,
          unreadMessages,
        },

        recentOrders,
        topProducts,
        revenueTrend,
      },
    });
  } catch (error) {
    console.error("Dashboard overview error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// SALES ANALYTICS
// ============================================

/**
 * @route   GET /api/seller-dashboard/analytics/sales
 * @desc    Get detailed sales analytics
 * @access  Private (Seller)
 */
router.get("/analytics/sales", protect, async (req, res) => {
  try {
    const { period = "30d" } = req.query;

    const business = await Business.findOne({ owner: req.user._id });
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }

    // Calculate date range
    let startDate = new Date();
    if (period === "7d") startDate.setDate(startDate.getDate() - 7);
    else if (period === "30d") startDate.setDate(startDate.getDate() - 30);
    else if (period === "90d") startDate.setDate(startDate.getDate() - 90);
    else if (period === "1y") startDate.setFullYear(startDate.getFullYear() - 1);

    // Sales by day
    const salesByDay = await Order.aggregate([
      {
        $match: {
          businessId: business._id,
          status: { $in: ["completed", "delivered"] },
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$totalPrice" },
          orders: { $sum: 1 },
          items: { $sum: { $size: "$items" } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Sales by category
    const salesByCategory = await Order.aggregate([
      {
        $match: {
          businessId: business._id,
          status: { $in: ["completed", "delivered"] },
          createdAt: { $gte: startDate },
        },
      },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $group: {
          _id: "$product.category",
          revenue: { $sum: "$items.total" },
          quantity: { $sum: "$items.quantity" },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    // Sales by payment method
    const salesByPayment = await Order.aggregate([
      {
        $match: {
          businessId: business._id,
          status: { $in: ["completed", "delivered"] },
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$payment.method",
          count: { $sum: 1 },
          total: { $sum: "$totalPrice" },
        },
      },
    ]);

    // Sales by delivery method
    const salesByDelivery = await Order.aggregate([
      {
        $match: {
          businessId: business._id,
          status: { $in: ["completed", "delivered"] },
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: "$delivery.method",
          count: { $sum: 1 },
          total: { $sum: "$totalPrice" },
        },
      },
    ]);

    // Top selling products
    const topProducts = await Order.aggregate([
      {
        $match: {
          businessId: business._id,
          status: { $in: ["completed", "delivered"] },
          createdAt: { $gte: startDate },
        },
      },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          productName: { $first: "$items.productName" },
          totalSold: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.total" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      success: true,
      period,
      analytics: {
        salesByDay,
        salesByCategory,
        salesByPayment,
        salesByDelivery,
        topProducts,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// PRODUCT ANALYTICS
// ============================================

/**
 * @route   GET /api/seller-dashboard/analytics/products
 * @desc    Get product performance analytics
 * @access  Private (Seller)
 */
router.get("/analytics/products", protect, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }

    // Most viewed products
    const mostViewed = await Product.find({ businessId: business._id })
      .sort({ "stats.totalViews": -1 })
      .limit(10)
      .select("name images price stats stock");

    // Most wishlisted
    const mostWishlisted = await Product.find({ businessId: business._id })
      .sort({ "stats.wishlistCount": -1 })
      .limit(10)
      .select("name images price stats stock");

    // Conversion rate (views to orders)
    const products = await Product.find({ businessId: business._id }).select(
      "name stats"
    );

    const conversionData = products
      .map((p) => ({
        name: p.name,
        views: p.stats?.totalViews || 0,
        orders: p.stats?.totalOrders || 0,
        conversionRate:
          p.stats?.totalViews > 0
            ? ((p.stats?.totalOrders / p.stats?.totalViews) * 100).toFixed(2)
            : 0,
      }))
      .sort((a, b) => b.conversionRate - a.conversionRate)
      .slice(0, 10);

    // Low stock alerts
    const lowStock = await Product.find({
      businessId: business._id,
      stock: { $gt: 0, $lte: 5 },
      isActive: true,
    }).select("name stock images");

    // Out of stock
    const outOfStock = await Product.find({
      businessId: business._id,
      stock: 0,
    }).select("name images");

    // Category distribution
    const categoryDistribution = await Product.aggregate([
      { $match: { businessId: business._id } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          totalValue: { $sum: { $multiply: ["$price", "$stock"] } },
        },
      },
    ]);

    res.json({
      success: true,
      analytics: {
        mostViewed,
        mostWishlisted,
        conversionData,
        lowStock,
        outOfStock,
        categoryDistribution,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// CUSTOMER ANALYTICS
// ============================================

/**
 * @route   GET /api/seller-dashboard/analytics/customers
 * @desc    Get customer insights
 * @access  Private (Seller)
 */
router.get("/analytics/customers", protect, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) {
      return res.status(404).json({ success: false, message: "Business not found" });
    }

    // Top customers by order value
    const topCustomers = await Order.aggregate([
      {
        $match: {
          businessId: business._id,
          status: { $in: ["completed", "delivered"] },
        },
      },
      {
        $group: {
          _id: "$buyerId",
          customerName: { $first: "$customerName" },
          customerPhone: { $first: "$customerPhone" },
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: "$totalPrice" },
          lastOrder: { $max: "$createdAt" },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
    ]);

    // Repeat customers vs new
    const customerStats = await Order.aggregate([
      {
        $match: {
          businessId: business._id,
          status: { $in: ["completed", "delivered"] },
        },
      },
      {
        $group: {
          _id: "$buyerId",
          orders: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          repeatCustomers: {
            $sum: { $cond: [{ $gt: ["$orders", 1] }, 1, 0] },
          },
          newCustomers: {
            $sum: { $cond: [{ $eq: ["$orders", 1] }, 1, 0] },
          },
        },
      },
    ]);

    // Customer locations (cities)
    const customerLocations = await Order.aggregate([
      {
        $match: {
          businessId: business._id,
          "shippingAddress.city": { $exists: true, $ne: "" },
        },
      },
      {
        $group: {
          _id: "$shippingAddress.city",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      success: true,
      analytics: {
        topCustomers,
        customerStats: customerStats[0] || {
          totalCustomers: 0,
          repeatCustomers: 0,
          newCustomers: 0,
        },
        customerLocations,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// QUICK ACTIONS
// ============================================

/**
 * @route   GET /api/seller-dashboard/pending-actions
 * @desc    Get items needing seller attention
 * @access  Private (Seller)
 */
router.get("/pending-actions", protect, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) {
      return res.json({ success: true, actions: [] });
    }

    const actions = [];

    // Pending orders
    const pendingOrders = await Order.find({
      businessId: business._id,
      status: "pending",
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("orderNumber customerName totalPrice createdAt");

    if (pendingOrders.length > 0) {
      actions.push({
        type: "pending_orders",
        priority: "high",
        count: pendingOrders.length,
        message: `${pendingOrders.length} orders waiting to be confirmed`,
        items: pendingOrders,
      });
    }

    // Pending offers
    const pendingOffers = await Offer.find({
      sellerId: req.user._id,
      status: "pending",
    })
      .populate("productId", "name")
      .populate("buyerId", "firstName")
      .sort({ createdAt: -1 })
      .limit(5);

    if (pendingOffers.length > 0) {
      actions.push({
        type: "pending_offers",
        priority: "medium",
        count: pendingOffers.length,
        message: `${pendingOffers.length} price offers waiting for response`,
        items: pendingOffers,
      });
    }

    // Unanswered reviews
    const unansweredReviews = await Review.find({
      businessId: business._id,
      "sellerReply.reply": { $exists: false },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("rating comment buyerName createdAt productId");

    if (unansweredReviews.length > 0) {
      actions.push({
        type: "unanswered_reviews",
        priority: "low",
        count: unansweredReviews.length,
        message: `${unansweredReviews.length} reviews need your response`,
        items: unansweredReviews,
      });
    }

    // Low stock products
    const lowStock = await Product.find({
      businessId: business._id,
      stock: { $gt: 0, $lte: 5 },
      isActive: true,
    }).select("name stock");

    if (lowStock.length > 0) {
      actions.push({
        type: "low_stock",
        priority: "medium",
        count: lowStock.length,
        message: `${lowStock.length} products running low on stock`,
        items: lowStock,
      });
    }

    res.json({
      success: true,
      totalActions: actions.reduce((sum, a) => sum + a.count, 0),
      actions,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
