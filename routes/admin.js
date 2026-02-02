const express = require("express");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const User = require("../models/User");
const Buyer = require("../models/Buyer");
const Business = require("../models/Business");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Notification = require("../models/Notification");
const { protectAdmin } = require("../middleware/auth");

const router = express.Router();

// Generate JWT Token
const generateToken = (id, type = "admin") => {
  return jwt.sign({ id, type }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// ========================
// AUTH ROUTES
// ========================

// @route   POST /api/admin/login
// @desc    Admin login
// @access  Public
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!admin.isActive) {
      return res.status(403).json({ message: "Account has been deactivated" });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = generateToken(admin._id, "admin");

    res.json({
      message: "Welcome, Admin! 👑",
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
});

// @route   POST /api/admin/create
// @desc    Create new admin (super admin only)
// @access  Private
router.post("/create", protectAdmin, async (req, res) => {
  try {
    if (!req.admin.permissions.manageAdmins) {
      return res.status(403).json({ message: "Not authorized to create admins" });
    }

    const { name, email, password, role, permissions } = req.body;

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({ message: "Admin already exists" });
    }

    const admin = await Admin.create({
      name,
      email,
      password,
      role: role || "moderator",
      permissions: permissions || {},
    });

    await req.admin.logActivity("create_admin", "Admin", admin._id);

    res.status(201).json({
      message: "Admin created! 👑",
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error creating admin", error: error.message });
  }
});

// @route   POST /api/admin/setup
// @desc    Setup first super admin (only works if no admins exist)
// @access  Public
router.post("/setup", async (req, res) => {
  try {
    const adminCount = await Admin.countDocuments();
    if (adminCount > 0) {
      return res.status(400).json({ message: "Admin already exists. Use login." });
    }

    const { name, email, password } = req.body;

    const admin = new Admin({ name, email, password });
    admin.setSuperAdmin();
    await admin.save();

    const token = generateToken(admin._id, "admin");

    res.status(201).json({
      message: "Super Admin created! 👑 You have full access.",
      token,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Setup failed", error: error.message });
  }
});

// ========================
// DASHBOARD & ANALYTICS
// ========================

// @route   GET /api/admin/dashboard
// @desc    Get dashboard stats
// @access  Private
router.get("/dashboard", protectAdmin, async (req, res) => {
  try {
    const [
      totalBuyers,
      totalSellers,
      totalProducts,
      totalOrders,
      pendingProducts,
      recentOrders,
      recentBuyers,
      topProducts,
    ] = await Promise.all([
      Buyer.countDocuments(),
      Business.countDocuments(),
      Product.countDocuments({ status: "approved" }),
      Order.countDocuments(),
      Product.countDocuments({ status: "pending" }),
      Order.find().sort({ createdAt: -1 }).limit(5).populate("productId", "name"),
      Buyer.find().sort({ createdAt: -1 }).limit(5).select("name email createdAt"),
      Product.find({ status: "approved" })
        .sort({ "stats.views": -1 })
        .limit(5)
        .select("name stats.views price"),
    ]);

    // Revenue calculation
    const revenue = await Order.aggregate([
      { $match: { "payment.status": "paid" } },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]);

    res.json({
      stats: {
        totalBuyers,
        totalSellers,
        totalProducts,
        totalOrders,
        pendingProducts,
        totalRevenue: revenue[0]?.total || 0,
      },
      recentOrders,
      recentBuyers,
      topProducts,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching dashboard", error: error.message });
  }
});

// @route   GET /api/admin/analytics
// @desc    Get detailed analytics
// @access  Private
router.get("/analytics", protectAdmin, async (req, res) => {
  try {
    const { period = "30" } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Orders by day
    const ordersByDay = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
          revenue: { $sum: "$totalPrice" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Products by category
    const productsByCategory = await Product.aggregate([
      { $match: { status: "approved" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Top sellers
    const topSellers = await Order.aggregate([
      { $group: { _id: "$businessId", totalSales: { $sum: "$totalPrice" }, orderCount: { $sum: 1 } } },
      { $sort: { totalSales: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "businesses",
          localField: "_id",
          foreignField: "_id",
          as: "business",
        },
      },
      { $unwind: "$business" },
      { $project: { businessName: "$business.name", totalSales: 1, orderCount: 1 } },
    ]);

    res.json({ ordersByDay, productsByCategory, topSellers });
  } catch (error) {
    res.status(500).json({ message: "Error fetching analytics", error: error.message });
  }
});

// ========================
// USER MANAGEMENT
// ========================

// @route   GET /api/admin/buyers
// @desc    Get all buyers
// @access  Private
router.get("/buyers", protectAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    let query = {};

    if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      };
    }

    const buyers = await Buyer.find(query)
      .select("-password")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Buyer.countDocuments(query);

    res.json({ buyers, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: "Error fetching buyers", error: error.message });
  }
});

// @route   PUT /api/admin/buyers/:id/status
// @desc    Activate/Deactivate buyer
// @access  Private
router.put("/buyers/:id/status", protectAdmin, async (req, res) => {
  try {
    if (!req.admin.permissions.manageUsers) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { isActive } = req.body;
    const buyer = await Buyer.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).select("-password");

    await req.admin.logActivity(isActive ? "activate_buyer" : "deactivate_buyer", "Buyer", buyer._id);

    res.json({ message: `Buyer ${isActive ? "activated" : "deactivated"}`, buyer });
  } catch (error) {
    res.status(500).json({ message: "Error updating buyer", error: error.message });
  }
});

// ========================
// SELLER MANAGEMENT
// ========================

// @route   GET /api/admin/sellers
// @desc    Get all sellers/businesses
// @access  Private
router.get("/sellers", protectAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    let query = {};

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const sellers = await Business.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Business.countDocuments(query);

    res.json({ sellers, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: "Error fetching sellers", error: error.message });
  }
});

// @route   PUT /api/admin/sellers/:id/status
// @desc    Activate/Deactivate seller
// @access  Private
router.put("/sellers/:id/status", protectAdmin, async (req, res) => {
  try {
    if (!req.admin.permissions.manageSellers) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { isActive } = req.body;
    const seller = await Business.findByIdAndUpdate(req.params.id, { isActive }, { new: true });

    // Also suspend their products
    if (!isActive) {
      await Product.updateMany({ businessId: req.params.id }, { status: "suspended" });
    }

    await req.admin.logActivity(
      isActive ? "activate_seller" : "deactivate_seller",
      "Business",
      seller._id
    );

    res.json({ message: `Seller ${isActive ? "activated" : "deactivated"}`, seller });
  } catch (error) {
    res.status(500).json({ message: "Error updating seller", error: error.message });
  }
});

// ========================
// PRODUCT MODERATION
// ========================

// @route   GET /api/admin/products
// @desc    Get all products (with filters)
// @access  Private
router.get("/products", protectAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category, search } = req.query;
    let query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const products = await Product.find(query)
      .populate("businessId", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({ products, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ message: "Error fetching products", error: error.message });
  }
});

// @route   PUT /api/admin/products/:id/approve
// @desc    Approve product
// @access  Private
router.put("/products/:id/approve", protectAdmin, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { status: "approved", rejectionReason: "" },
      { new: true }
    );

    // Notify seller
    const business = await Business.findById(product.businessId);
    await Notification.notify({
      recipientId: product.businessId,
      recipientType: "Business",
      type: "system",
      title: "Product Approved! ✅",
      message: `Your product "${product.name}" has been approved and is now live.`,
      actionType: "product",
      referenceId: product._id,
    });

    await req.admin.logActivity("approve_product", "Product", product._id);

    res.json({ message: "Product approved! ✅", product });
  } catch (error) {
    res.status(500).json({ message: "Error approving product", error: error.message });
  }
});

// @route   PUT /api/admin/products/:id/reject
// @desc    Reject product
// @access  Private
router.put("/products/:id/reject", protectAdmin, async (req, res) => {
  try {
    const { reason } = req.body;

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { status: "rejected", rejectionReason: reason },
      { new: true }
    );

    // Notify seller
    await Notification.notify({
      recipientId: product.businessId,
      recipientType: "Business",
      type: "system",
      title: "Product Rejected",
      message: `Your product "${product.name}" was rejected. Reason: ${reason}`,
      actionType: "product",
      referenceId: product._id,
    });

    await req.admin.logActivity("reject_product", "Product", product._id);

    res.json({ message: "Product rejected", product });
  } catch (error) {
    res.status(500).json({ message: "Error rejecting product", error: error.message });
  }
});

// @route   DELETE /api/admin/products/:id
// @desc    Delete product
// @access  Private
router.delete("/products/:id", protectAdmin, async (req, res) => {
  try {
    if (!req.admin.permissions.manageProducts) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const product = await Product.findByIdAndDelete(req.params.id);
    await req.admin.logActivity("delete_product", "Product", req.params.id);

    res.json({ message: "Product deleted! 🗑️" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting product", error: error.message });
  }
});

// ========================
// NOTIFICATIONS
// ========================

// @route   POST /api/admin/notifications/broadcast
// @desc    Send notification to all users
// @access  Private
router.post("/notifications/broadcast", protectAdmin, async (req, res) => {
  try {
    if (!req.admin.permissions.sendNotifications) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const { title, message, targetType } = req.body; // targetType: "all", "buyers", "sellers"

    let recipients = [];

    if (targetType === "all" || targetType === "buyers") {
      const buyers = await Buyer.find({ isActive: true }).select("_id");
      recipients.push(
        ...buyers.map((b) => ({
          recipientId: b._id,
          recipientType: "Buyer",
          type: "promotion",
          title,
          message,
        }))
      );
    }

    if (targetType === "all" || targetType === "sellers") {
      const businesses = await Business.find({ isActive: true }).select("_id");
      recipients.push(
        ...businesses.map((b) => ({
          recipientId: b._id,
          recipientType: "Business",
          type: "promotion",
          title,
          message,
        }))
      );
    }

    await Notification.insertMany(recipients);
    await req.admin.logActivity("broadcast_notification", "Notification", null);

    res.json({ message: `Notification sent to ${recipients.length} users! 📢` });
  } catch (error) {
    res.status(500).json({ message: "Error sending notification", error: error.message });
  }
});

module.exports = router;
