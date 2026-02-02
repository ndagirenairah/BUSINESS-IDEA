const express = require("express");
const Order = require("../models/Order");
const Product = require("../models/Product");
const Notification = require("../models/Notification");
const { protectBuyer, optionalBuyerAuth } = require("../middleware/auth");

const router = express.Router();

// @route   POST /api/buyer-orders
// @desc    Place new order (logged in buyer or guest)
// @access  Public (optional buyer auth)
router.post("/", optionalBuyerAuth, async (req, res) => {
  try {
    const {
      items, // Array of { productId, quantity }
      productId, // Single product (backward compatible)
      customerName,
      customerPhone,
      customerEmail,
      quantity,
      notes,
      shippingAddress,
      paymentMethod,
    } = req.body;

    let orderItems = [];
    let subtotal = 0;
    let businessId;

    // Handle multiple items or single product
    if (items && items.length > 0) {
      // Multiple items order
      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(404).json({ message: `Product not found: ${item.productId}` });
        }
        if (product.stock < item.quantity) {
          return res.status(400).json({ message: `Not enough stock for ${product.name}` });
        }

        // All items must be from same business
        if (!businessId) {
          businessId = product.businessId;
        } else if (businessId.toString() !== product.businessId.toString()) {
          return res.status(400).json({ message: "All items must be from the same seller" });
        }

        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;

        orderItems.push({
          productId: product._id,
          productName: product.name,
          productImage: product.image,
          quantity: item.quantity,
          price: product.price,
          total: itemTotal,
        });
      }
    } else if (productId) {
      // Single product order
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      if (product.stock < (quantity || 1)) {
        return res.status(400).json({ message: "Not enough stock available" });
      }

      businessId = product.businessId;
      const itemTotal = product.price * (quantity || 1);
      subtotal = itemTotal;

      orderItems.push({
        productId: product._id,
        productName: product.name,
        productImage: product.image,
        quantity: quantity || 1,
        price: product.price,
        total: itemTotal,
      });
    } else {
      return res.status(400).json({ message: "No products specified" });
    }

    // Calculate shipping
    const shippingCost = req.body.shippingCost || 0;
    const tax = req.body.tax || 0;
    const discount = req.body.discount || 0;
    const totalPrice = subtotal + shippingCost + tax - discount;

    // Create order
    const order = await Order.create({
      items: orderItems,
      productId: orderItems.length === 1 ? orderItems[0].productId : undefined,
      businessId,
      buyerId: req.buyer?._id,
      customerName: req.buyer?.name || customerName,
      customerPhone: req.buyer?.phone || customerPhone,
      customerEmail: req.buyer?.email || customerEmail,
      quantity: orderItems.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
      shippingCost,
      tax,
      discount,
      totalPrice,
      shippingAddress: shippingAddress || {},
      payment: {
        method: paymentMethod || "cash",
        status: "pending",
      },
      notes,
      statusHistory: [
        {
          status: "pending",
          note: "Order placed",
          updatedAt: new Date(),
        },
      ],
    });

    // Notify seller
    await Notification.notify({
      recipientId: businessId,
      recipientType: "Business",
      type: "new_order",
      title: "New Order! 🛍️",
      message: `You have a new order worth $${totalPrice.toFixed(2)}`,
      actionType: "order",
      referenceId: order._id,
    });

    // Update product inquiry stats
    for (const item of orderItems) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { "stats.inquiries": 1 },
      });
    }

    res.status(201).json({
      message: "Order placed successfully! 🎉",
      order,
    });
  } catch (error) {
    res.status(500).json({ message: "Error placing order", error: error.message });
  }
});

// @route   GET /api/buyer-orders
// @desc    Get buyer's orders
// @access  Private (Buyer)
router.get("/", protectBuyer, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    let query = { buyerId: req.buyer._id };

    if (status) query.status = status;

    const orders = await Order.find(query)
      .populate("businessId", "name phone whatsapp")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);

    res.json({
      orders,
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

// @route   GET /api/buyer-orders/:id
// @desc    Get order details
// @access  Private (Buyer)
router.get("/:id", protectBuyer, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("businessId", "name phone whatsapp email location");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Check if order belongs to this buyer
    if (order.buyerId && order.buyerId.toString() !== req.buyer._id.toString()) {
      return res.status(403).json({ message: "Not authorized to view this order" });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Error fetching order", error: error.message });
  }
});

// @route   PUT /api/buyer-orders/:id/cancel
// @desc    Cancel an order
// @access  Private (Buyer)
router.put("/:id/cancel", protectBuyer, async (req, res) => {
  try {
    const { reason } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.buyerId.toString() !== req.buyer._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Can only cancel pending or confirmed orders
    if (!["pending", "confirmed"].includes(order.status)) {
      return res.status(400).json({ message: "Cannot cancel order in current status" });
    }

    await order.updateStatus("cancelled", reason || "Cancelled by buyer", req.buyer._id);

    // Notify seller
    await Notification.notify({
      recipientId: order.businessId,
      recipientType: "Business",
      type: "order_update",
      title: "Order Cancelled",
      message: `Order #${order._id.toString().slice(-6)} has been cancelled`,
      actionType: "order",
      referenceId: order._id,
    });

    res.json({ message: "Order cancelled", order });
  } catch (error) {
    res.status(500).json({ message: "Error cancelling order", error: error.message });
  }
});

// @route   GET /api/buyer-orders/track/:id
// @desc    Track order by ID (public with phone verification)
// @access  Public
router.get("/track/:id", async (req, res) => {
  try {
    const { phone } = req.query;

    const order = await Order.findById(req.params.id)
      .populate("businessId", "name phone")
      .select("-sellerNotes");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Verify phone for non-logged-in users
    if (phone && order.customerPhone !== phone) {
      return res.status(403).json({ message: "Phone number doesn't match" });
    }

    res.json({
      orderId: order._id,
      status: order.status,
      items: order.items,
      totalPrice: order.totalPrice,
      tracking: order.tracking,
      statusHistory: order.statusHistory,
      createdAt: order.createdAt,
      seller: {
        name: order.businessId.name,
        phone: order.businessId.phone,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error tracking order", error: error.message });
  }
});

module.exports = router;
