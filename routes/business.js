const express = require("express");
const Business = require("../models/Business");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Conversation = require("../models/Conversation");
const Notification = require("../models/Notification");
const { protect, ownerOnly } = require("../middleware/auth");
const upload = require("../middleware/upload");

const router = express.Router();

// ====================================
// 🏪 SELLER DASHBOARD - Main Hub
// ====================================

// @route   GET /api/business/dashboard
// @desc    Get seller dashboard with all stats
// @access  Private
router.get("/dashboard", protect, async (req, res) => {
  try {
    const businessId = req.user.businessId;

    // Get all stats in parallel for speed
    const [
      business,
      totalProducts,
      activeProducts,
      totalOrders,
      pendingOrders,
      totalRevenue,
      unreadMessages,
      recentOrders,
      topProducts,
      unreadNotifications,
    ] = await Promise.all([
      // Business info
      Business.findById(businessId),
      // Product counts
      Product.countDocuments({ businessId }),
      Product.countDocuments({ businessId, isAvailable: true, status: "approved" }),
      // Order counts
      Order.countDocuments({ businessId }),
      Order.countDocuments({ businessId, status: "pending" }),
      // Revenue
      Order.aggregate([
        { $match: { businessId: businessId, status: { $in: ["completed", "delivered"] } } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]),
      // Unread messages
      Conversation.aggregate([
        { $match: { businessId: businessId } },
        { $group: { _id: null, total: { $sum: "$unreadBusiness" } } },
      ]),
      // Recent orders
      Order.find({ businessId })
        .populate("productId", "name image")
        .sort({ createdAt: -1 })
        .limit(5),
      // Top selling products
      Product.find({ businessId })
        .sort({ "stats.views": -1 })
        .limit(5)
        .select("name image price stats"),
      // Unread notifications
      Notification.countDocuments({
        recipientId: businessId,
        recipientType: "Business",
        isRead: false,
      }),
    ]);

    res.json({
      business: {
        id: business._id,
        name: business.name,
        type: business.type,
        logo: business.logo,
        location: business.location,
      },
      stats: {
        products: {
          total: totalProducts,
          active: activeProducts,
        },
        orders: {
          total: totalOrders,
          pending: pendingOrders,
        },
        revenue: totalRevenue[0]?.total || 0,
        unreadMessages: unreadMessages[0]?.total || 0,
        unreadNotifications,
      },
      recentOrders,
      topProducts,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching dashboard", error: error.message });
  }
});

// @route   GET /api/business/analytics
// @desc    Get detailed seller analytics
// @access  Private
router.get("/analytics", protect, async (req, res) => {
  try {
    const businessId = req.user.businessId;
    const { period = "30" } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Sales over time
    const salesOverTime = await Order.aggregate([
      {
        $match: {
          businessId: businessId,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          orders: { $sum: 1 },
          revenue: { $sum: "$totalPrice" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Orders by status
    const ordersByStatus = await Order.aggregate([
      { $match: { businessId: businessId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Products by category
    const productsByCategory = await Product.aggregate([
      { $match: { businessId: businessId } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
    ]);

    // Top performing products
    const topProducts = await Product.find({ businessId })
      .sort({ "stats.views": -1, "stats.inquiries": -1 })
      .limit(10)
      .select("name price stats rating");

    // Customer engagement
    const customerEngagement = await Conversation.aggregate([
      { $match: { businessId: businessId, createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          conversations: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      period: parseInt(period),
      salesOverTime,
      ordersByStatus,
      productsByCategory,
      topProducts,
      customerEngagement,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching analytics", error: error.message });
  }
});

// ====================================
// 📦 SELLER PRODUCT MANAGEMENT
// ====================================

// @route   GET /api/business/products
// @desc    Get all products for seller's business
// @access  Private
router.get("/products", protect, async (req, res) => {
  try {
    const { status, category, search, page = 1, limit = 20 } = req.query;
    let query = { businessId: req.user.businessId };

    if (status) query.status = status;
    if (category) query.category = category;
    if (search) query.name = { $regex: search, $options: "i" };

    const products = await Product.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({
      products,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching products", error: error.message });
  }
});

// ====================================
// 📬 SELLER CUSTOMER REQUESTS / MESSAGES
// ====================================

// @route   GET /api/business/messages
// @desc    Get all customer messages/inquiries
// @access  Private
router.get("/messages", protect, async (req, res) => {
  try {
    const { unreadOnly, page = 1, limit = 20 } = req.query;
    let query = { businessId: req.user.businessId, archivedByBusiness: false };

    if (unreadOnly === "true") {
      query.unreadBusiness = { $gt: 0 };
    }

    const conversations = await Conversation.find(query)
      .populate("productId", "name image price")
      .populate("buyerId", "name avatar")
      .sort({ lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Conversation.countDocuments(query);
    const unreadTotal = await Conversation.aggregate([
      { $match: { businessId: req.user.businessId } },
      { $group: { _id: null, total: { $sum: "$unreadBusiness" } } },
    ]);

    res.json({
      conversations,
      unreadTotal: unreadTotal[0]?.total || 0,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages", error: error.message });
  }
});

// @route   PUT /api/business/messages/:conversationId/archive
// @desc    Archive a conversation
// @access  Private
router.put("/messages/:conversationId/archive", protect, async (req, res) => {
  try {
    await Conversation.findByIdAndUpdate(req.params.conversationId, {
      archivedByBusiness: true,
    });
    res.json({ message: "Conversation archived" });
  } catch (error) {
    res.status(500).json({ message: "Error archiving conversation", error: error.message });
  }
});

// ====================================
// 📊 SELLER ORDERS MANAGEMENT
// ====================================

// @route   GET /api/business/orders
// @desc    Get all orders for seller
// @access  Private
router.get("/orders", protect, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let query = { businessId: req.user.businessId };

    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate("productId", "name image price")
      .populate("buyerId", "name email phone")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    // Count by status
    const statusCounts = await Order.aggregate([
      { $match: { businessId: req.user.businessId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    res.json({
      orders,
      statusCounts: statusCounts.reduce((acc, curr) => {
        acc[curr._id] = curr.count;
        return acc;
      }, {}),
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching orders", error: error.message });
  }
});

// @route   PUT /api/business/orders/:orderId/status
// @desc    Update order status with notification
// @access  Private
router.put("/orders/:orderId/status", protect, async (req, res) => {
  try {
    const { status, note, trackingNumber, trackingCarrier } = req.body;
    const order = await Order.findById(req.params.orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.businessId.toString() !== req.user.businessId.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Update order status
    await order.updateStatus(status, note, req.user._id);

    // Update tracking info if provided
    if (trackingNumber) {
      order.tracking = {
        number: trackingNumber,
        carrier: trackingCarrier || "",
        url: "",
      };
      await order.save();
    }

    // Notify buyer if they have an account
    if (order.buyerId) {
      const statusMessages = {
        confirmed: "Your order has been confirmed! 🎉",
        processing: "Your order is being processed 📦",
        shipped: `Your order has been shipped! ${trackingNumber ? `Tracking: ${trackingNumber}` : ""}`,
        delivered: "Your order has been delivered! 🚚",
        completed: "Your order is complete! Thanks for shopping! ⭐",
        cancelled: "Your order has been cancelled",
      };

      await Notification.notify({
        recipientId: order.buyerId,
        recipientType: "Buyer",
        type: "order_update",
        title: `Order ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        message: statusMessages[status] || `Order status updated to ${status}`,
        actionType: "order",
        referenceId: order._id,
      });
    }

    res.json({ message: `Order ${status}! ✅`, order });
  } catch (error) {
    res.status(500).json({ message: "Error updating order", error: error.message });
  }
});

// ====================================
// 🔔 SELLER NOTIFICATIONS
// ====================================

// @route   GET /api/business/notifications
// @desc    Get seller notifications
// @access  Private
router.get("/notifications", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    let query = {
      recipientId: req.user.businessId,
      recipientType: "Business",
    };

    if (unreadOnly === "true") query.isRead = false;

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({ ...query, isRead: false });

    res.json({
      notifications,
      unreadCount,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching notifications", error: error.message });
  }
});

// ====================================
// 🏪 PUBLIC BUSINESS ROUTES
// ====================================

// @route   GET /api/business
// @desc    Get all businesses (public - for customers)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const { type, search } = req.query;
    let query = { isActive: true };

    if (type) query.type = type;
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const businesses = await Business.find(query)
      .select("name type location logo")
      .sort({ createdAt: -1 });

    res.json(businesses);
  } catch (error) {
    res.status(500).json({ message: "Error fetching businesses", error: error.message });
  }
});

// @route   GET /api/business/:id
// @desc    Get single business details
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.json(business);
  } catch (error) {
    res.status(500).json({ message: "Error fetching business", error: error.message });
  }
});

// @route   PUT /api/business/update
// @desc    Update business details
// @access  Private (Owner only)
router.put("/update", protect, ownerOnly, upload.single("logo"), async (req, res) => {
  try {
    const business = await Business.findById(req.user.businessId);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const { name, type, phone, whatsapp, location, description } = req.body;

    business.name = name || business.name;
    business.type = type || business.type;
    business.phone = phone || business.phone;
    business.whatsapp = whatsapp || business.whatsapp;
    business.location = location || business.location;
    business.description = description || business.description;

    if (req.file) {
      business.logo = `/uploads/${req.file.filename}`;
    }

    await business.save();

    res.json({
      message: "Business updated! ✅",
      business,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating business", error: error.message });
  }
});

module.exports = router;
