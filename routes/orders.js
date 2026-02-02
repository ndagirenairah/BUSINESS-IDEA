const express = require("express");
const Order = require("../models/Order");
const Product = require("../models/Product");
const { protect } = require("../middleware/auth");

const router = express.Router();

// @route   POST /api/orders
// @desc    Place new order (customer)
// @access  Public
router.post("/", async (req, res) => {
  try {
    const { productId, customerName, customerPhone, customerEmail, quantity, notes } = req.body;

    // Get product details
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check stock
    if (product.stock < quantity) {
      return res.status(400).json({ message: "Not enough stock available" });
    }

    // Calculate total price
    const totalPrice = product.price * quantity;

    // Create order
    const order = await Order.create({
      productId,
      businessId: product.businessId,
      customerName,
      customerPhone,
      customerEmail,
      quantity,
      totalPrice,
      notes,
    });

    res.status(201).json({
      message: "Order placed successfully! 🎉 The business will contact you soon.",
      order,
    });
  } catch (error) {
    res.status(500).json({ message: "Error placing order", error: error.message });
  }
});

// @route   GET /api/orders/my-orders
// @desc    Get orders for logged in business
// @access  Private
router.get("/my-orders", protect, async (req, res) => {
  try {
    const { status } = req.query;
    let query = { businessId: req.user.businessId };

    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate("productId", "name price image")
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: "Error fetching orders", error: error.message });
  }
});

// @route   GET /api/orders/:id
// @desc    Get single order details
// @access  Private
router.get("/:id", protect, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("productId", "name price image category")
      .populate("businessId", "name phone");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if order belongs to user's business
    if (order.businessId._id.toString() !== req.user.businessId.toString()) {
      return res.status(403).json({ message: "Not authorized to view this order" });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Error fetching order", error: error.message });
  }
});

// @route   PUT /api/orders/:id/status
// @desc    Update order status
// @access  Private
router.put("/:id/status", protect, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if order belongs to user's business
    if (order.businessId.toString() !== req.user.businessId.toString()) {
      return res.status(403).json({ message: "Not authorized to update this order" });
    }

    // Update product stock if order is accepted
    if (status === "accepted" && order.status === "pending") {
      const product = await Product.findById(order.productId);
      if (product) {
        product.stock -= order.quantity;
        await product.save();
      }
    }

    // Restore stock if order is cancelled/rejected
    if ((status === "cancelled" || status === "rejected") && order.status === "accepted") {
      const product = await Product.findById(order.productId);
      if (product) {
        product.stock += order.quantity;
        await product.save();
      }
    }

    order.status = status;
    await order.save();

    res.json({
      message: `Order ${status}! ✅`,
      order,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating order", error: error.message });
  }
});

// @route   GET /api/orders/stats/summary
// @desc    Get order statistics for business
// @access  Private
router.get("/stats/summary", protect, async (req, res) => {
  try {
    const businessId = req.user.businessId;

    const stats = await Order.aggregate([
      { $match: { businessId: businessId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalValue: { $sum: "$totalPrice" },
        },
      },
    ]);

    const totalOrders = await Order.countDocuments({ businessId });
    const pendingOrders = await Order.countDocuments({ businessId, status: "pending" });

    res.json({
      totalOrders,
      pendingOrders,
      byStatus: stats,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching stats", error: error.message });
  }
});

module.exports = router;
