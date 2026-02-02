const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Product = require("../models/Product");
const Payment = require("../models/Payment");
const DeliveryZone = require("../models/DeliveryZone");
const PaymentService = require("../services/paymentService");
const PushNotificationService = require("../services/pushNotifications");
const { protectBuyer } = require("../middleware/auth");

/**
 * Modern Checkout Flow for Uganda 2026
 * Combines: Product Selection → Delivery → Payment → Confirmation
 */

// ============================================
// STEP 1: INITIATE CHECKOUT
// ============================================

/**
 * @route   POST /api/checkout/initiate
 * @desc    Start checkout process with cart items
 * @access  Private (Buyer)
 */
router.post("/initiate", protectBuyer, async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cart is empty",
      });
    }

    // Validate and get product details
    const productIds = items.map((item) => item.productId);
    const products = await Product.find({ _id: { $in: productIds } })
      .populate("businessId", "name owner")
      .select("name price images stock businessId category");

    if (products.length !== items.length) {
      return res.status(400).json({
        success: false,
        message: "Some products are not available",
      });
    }

    // Check stock and calculate totals
    const orderItems = [];
    let subtotal = 0;
    const businessIds = new Set();

    for (const item of items) {
      const product = products.find(
        (p) => p._id.toString() === item.productId
      );

      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product not found: ${item.productId}`,
        });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Not enough stock for ${product.name}. Available: ${product.stock}`,
        });
      }

      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;
      businessIds.add(product.businessId._id.toString());

      orderItems.push({
        productId: product._id,
        productName: product.name,
        productImage: product.images?.[0] || "",
        quantity: item.quantity,
        price: product.price,
        total: itemTotal,
        businessId: product.businessId._id,
        businessName: product.businessId.name,
        sellerId: product.businessId.owner,
      });
    }

    // Get delivery options for the first business (simplified)
    // In production, handle multi-seller orders differently
    const businessId = Array.from(businessIds)[0];
    const deliveryZones = await DeliveryZone.find({
      businessId,
      isActive: true,
    });

    // Compile available delivery methods
    const deliveryOptions = [];
    if (deliveryZones.length > 0) {
      const zone = deliveryZones[0];
      const opts = zone.deliveryOptions;

      if (opts.safeboda?.enabled) {
        deliveryOptions.push({
          id: "safeboda",
          name: "SafeBoda Delivery",
          description: "Fast delivery by SafeBoda",
          fee: opts.safeboda.baseFee,
          estimatedTime: "30-60 mins",
          icon: "bike",
        });
      }
      if (opts.faras?.enabled) {
        deliveryOptions.push({
          id: "faras",
          name: "Faras Delivery",
          description: "Delivery by Faras",
          fee: opts.faras.baseFee,
          estimatedTime: "45-90 mins",
          icon: "car",
        });
      }
      if (opts.personal?.enabled) {
        const isFree = opts.personal.freeAbove && subtotal >= opts.personal.freeAbove;
        deliveryOptions.push({
          id: "personal",
          name: "Seller Delivery",
          description: isFree ? "Free delivery!" : "Personal delivery by seller",
          fee: isFree ? 0 : opts.personal.baseFee,
          estimatedTime: zone.estimatedTime || "1-2 hours",
          icon: "package",
          freeAbove: opts.personal.freeAbove,
        });
      }
      if (opts.pickup?.enabled) {
        deliveryOptions.push({
          id: "pickup",
          name: "Pickup",
          description: `Pick up at: ${opts.pickup.address || "Seller location"}`,
          fee: 0,
          estimatedTime: "Available now",
          icon: "store",
          pickupAddress: opts.pickup.address,
          pickupHours: opts.pickup.hours,
        });
      }
      if (opts.shipping?.enabled) {
        deliveryOptions.push({
          id: "shipping",
          name: "Standard Shipping",
          description: `Delivered in ${opts.shipping.estimatedDays}`,
          fee: opts.shipping.baseFee,
          estimatedTime: opts.shipping.estimatedDays,
          icon: "truck",
        });
      }
    } else {
      // Default options if no zone configured
      deliveryOptions.push(
        {
          id: "personal",
          name: "Seller Delivery",
          description: "Delivery by seller",
          fee: 5000,
          estimatedTime: "1-2 hours",
          icon: "package",
        },
        {
          id: "pickup",
          name: "Pickup",
          description: "Pick up from seller",
          fee: 0,
          estimatedTime: "Available now",
          icon: "store",
        }
      );
    }

    // Payment methods
    const paymentMethods = [
      {
        id: "mtn_mobile_money",
        name: "MTN Mobile Money",
        category: "mobile_money",
        popular: true,
        icon: "mtn",
      },
      {
        id: "airtel_money",
        name: "Airtel Money",
        category: "mobile_money",
        popular: true,
        icon: "airtel",
      },
      {
        id: "visa",
        name: "Visa Card",
        category: "card",
        popular: false,
        icon: "visa",
      },
      {
        id: "mastercard",
        name: "Mastercard",
        category: "card",
        popular: false,
        icon: "mastercard",
      },
      {
        id: "cash_on_delivery",
        name: "Cash on Delivery",
        category: "cod",
        popular: true,
        icon: "cash",
      },
    ];

    // Calculate initial total
    const serviceFee = Math.round(subtotal * 0.025);
    const initialTotal = subtotal + serviceFee;

    res.json({
      success: true,
      checkout: {
        items: orderItems,
        pricing: {
          subtotal,
          serviceFee,
          deliveryFee: 0, // Will be updated when delivery is selected
          total: initialTotal,
          currency: "UGX",
        },
        deliveryOptions,
        paymentMethods,
        savedAddresses: req.buyer.addresses || [],
        isMultiSeller: businessIds.size > 1,
      },
    });
  } catch (error) {
    console.error("Checkout initiate error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// STEP 2: SELECT DELIVERY
// ============================================

/**
 * @route   POST /api/checkout/delivery
 * @desc    Select delivery method and address
 * @access  Private (Buyer)
 */
router.post("/delivery", protectBuyer, async (req, res) => {
  try {
    const {
      deliveryMethod,
      deliveryAddress,
      deliveryInstructions,
      items, // Pass items to recalculate
    } = req.body;

    // Calculate delivery fee
    let deliveryFee = 0;
    let estimatedTime = "";

    if (deliveryMethod !== "pickup") {
      // Get delivery zone for first item's business
      const productIds = items.map((item) => item.productId);
      const product = await Product.findById(productIds[0]);

      if (product) {
        const zone = await DeliveryZone.findOne({
          businessId: product.businessId,
          isActive: true,
        });

        if (zone) {
          const feeResult = zone.calculateDeliveryFee(
            deliveryMethod,
            null,
            items.reduce((sum, item) => sum + item.total, 0)
          );
          deliveryFee = feeResult.fee;
          estimatedTime = zone.estimatedTime;
        }
      }
    }

    // Calculate new total
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const serviceFee = Math.round(subtotal * 0.025);
    const total = subtotal + serviceFee + deliveryFee;

    res.json({
      success: true,
      delivery: {
        method: deliveryMethod,
        address: deliveryAddress,
        instructions: deliveryInstructions,
        fee: deliveryFee,
        estimatedTime,
      },
      pricing: {
        subtotal,
        serviceFee,
        deliveryFee,
        total,
        currency: "UGX",
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// STEP 3: COMPLETE CHECKOUT
// ============================================

/**
 * @route   POST /api/checkout/complete
 * @desc    Complete checkout - create order and initiate payment
 * @access  Private (Buyer)
 */
router.post("/complete", protectBuyer, async (req, res) => {
  try {
    const {
      items,
      delivery,
      paymentMethod,
      phoneNumber,
      useEscrow = false,
    } = req.body;

    // Validate items again
    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No items to checkout",
      });
    }

    // Group items by business for multi-seller support
    const ordersByBusiness = {};
    for (const item of items) {
      const businessId = item.businessId.toString();
      if (!ordersByBusiness[businessId]) {
        ordersByBusiness[businessId] = {
          businessId,
          sellerId: item.sellerId,
          items: [],
          subtotal: 0,
        };
      }
      ordersByBusiness[businessId].items.push(item);
      ordersByBusiness[businessId].subtotal += item.total;
    }

    const createdOrders = [];
    const paymentResults = [];

    // Create order for each business
    for (const [businessId, orderData] of Object.entries(ordersByBusiness)) {
      // Calculate fees for this order
      const subtotal = orderData.subtotal;
      const deliveryFee = delivery.fee / Object.keys(ordersByBusiness).length; // Split delivery fee
      const serviceFee = Math.round(subtotal * 0.025);
      const total = subtotal + deliveryFee + serviceFee;

      // Generate order number
      const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase()}`;

      // Create order
      const order = await Order.create({
        items: orderData.items,
        businessId,
        buyerId: req.buyer._id,
        customerName: req.buyer.fullName || `${req.buyer.firstName} ${req.buyer.lastName}`,
        customerPhone: phoneNumber || req.buyer.phone,
        customerEmail: req.buyer.email,
        orderNumber,
        subtotal,
        shippingCost: deliveryFee,
        tax: 0,
        discount: 0,
        totalPrice: total,
        status: "pending",
        delivery: {
          method: delivery.method,
          status: "pending",
          fee: deliveryFee,
          instructions: delivery.instructions || "",
          estimatedTime: delivery.estimatedTime || "",
        },
        shippingAddress: delivery.address || {},
        payment: {
          method: paymentMethod.includes("money")
            ? "mobile_money"
            : paymentMethod === "cash_on_delivery"
            ? "cash"
            : "card",
          status: "pending",
        },
      });

      createdOrders.push(order);

      // Reduce product stock
      for (const item of orderData.items) {
        await Product.findByIdAndUpdate(item.productId, {
          $inc: { stock: -item.quantity, "stats.totalOrders": 1 },
        });
      }

      // Initialize payment
      const paymentResult = await PaymentService.initializePayment({
        orderId: order._id,
        buyerId: req.buyer._id,
        sellerId: orderData.sellerId,
        businessId,
        method: paymentMethod,
        amount: {
          subtotal,
          deliveryFee,
        },
        currency: "UGX",
        customerEmail: req.buyer.email,
        customerPhone: phoneNumber || req.buyer.phone,
        customerName: req.buyer.fullName || req.buyer.firstName,
        useEscrow,
      });

      paymentResults.push({
        orderId: order._id,
        orderNumber: order.orderNumber,
        ...paymentResult,
      });

      // Notify seller of new order
      const Notification = require("../models/Notification");
      await Notification.notify({
        recipientId: orderData.sellerId,
        recipientType: "User",
        type: "new_order",
        title: "New Order! 🎉",
        message: `You have a new order #${orderNumber} worth ${total.toLocaleString()} UGX`,
        actionType: "order",
        referenceId: order._id,
      });
    }

    // Track buyer activity
    const RecommendationService = require("../services/recommendations");
    for (const item of items) {
      await RecommendationService.trackActivity(
        req.buyer._id,
        item.productId,
        "purchase"
      );
    }

    res.json({
      success: true,
      message: "Order placed successfully!",
      orders: createdOrders.map((order) => ({
        id: order._id,
        orderNumber: order.orderNumber,
        total: order.totalPrice,
        status: order.status,
      })),
      payment: paymentResults[0], // Return first payment result for single-order flow
      allPayments: paymentResults, // For multi-seller orders
    });
  } catch (error) {
    console.error("Checkout complete error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// STEP 4: TRACK ORDER
// ============================================

/**
 * @route   GET /api/checkout/track/:orderId
 * @desc    Get order tracking info
 * @access  Private (Buyer)
 */
router.get("/track/:orderId", protectBuyer, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      buyerId: req.buyer._id,
    })
      .populate("businessId", "name phone address")
      .populate("items.productId", "name images");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const payment = await Payment.findOne({ orderId: order._id }).select(
      "status method amount receipt escrow"
    );

    // Build tracking timeline
    const timeline = [
      {
        status: "placed",
        title: "Order Placed",
        description: "Your order has been received",
        timestamp: order.createdAt,
        completed: true,
      },
    ];

    if (payment?.status === "successful" || payment?.status === "held_in_escrow") {
      timeline.push({
        status: "paid",
        title: "Payment Confirmed",
        description: `Paid via ${payment.method.replace(/_/g, " ")}`,
        timestamp: payment.completedAt,
        completed: true,
      });
    }

    if (order.status === "confirmed" || order.status === "processing") {
      timeline.push({
        status: "confirmed",
        title: "Order Confirmed",
        description: "Seller is preparing your order",
        timestamp: order.statusHistory?.find((h) => h.status === "confirmed")?.updatedAt,
        completed: true,
      });
    }

    if (order.delivery.status === "assigned") {
      timeline.push({
        status: "assigned",
        title: "Rider Assigned",
        description: order.delivery.rider?.name
          ? `${order.delivery.rider.name} will deliver your order`
          : "A rider has been assigned",
        timestamp: order.delivery.trackingHistory?.find((h) => h.status === "assigned")?.timestamp,
        completed: true,
      });
    }

    if (order.delivery.status === "picked_up" || order.delivery.status === "in_transit") {
      timeline.push({
        status: "in_transit",
        title: "On The Way",
        description: "Your order is being delivered",
        timestamp: order.delivery.trackingHistory?.find((h) => h.status === "in_transit")?.timestamp,
        completed: order.delivery.status === "in_transit",
      });
    }

    if (order.status === "delivered") {
      timeline.push({
        status: "delivered",
        title: "Delivered",
        description: "Your order has been delivered",
        timestamp: order.delivery.actualDeliveryTime,
        completed: true,
      });
    }

    res.json({
      success: true,
      order: {
        id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        items: order.items,
        total: order.totalPrice,
        currency: "UGX",
        seller: order.businessId,
        delivery: {
          method: order.delivery.method,
          status: order.delivery.status,
          rider: order.delivery.rider,
          address: order.shippingAddress,
          estimatedTime: order.delivery.estimatedTime,
        },
        payment: payment
          ? {
              status: payment.status,
              method: payment.method,
              receipt: payment.receipt?.number,
              escrow: payment.escrow,
            }
          : null,
        timeline,
        createdAt: order.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// HELPER: VALIDATE PROMO CODE
// ============================================

/**
 * @route   POST /api/checkout/apply-promo
 * @desc    Apply promo code to checkout
 * @access  Private (Buyer)
 */
router.post("/apply-promo", protectBuyer, async (req, res) => {
  try {
    const { code, subtotal } = req.body;

    // TODO: Implement promo code logic
    // For now, return sample response
    const promoCodes = {
      WELCOME10: { type: "percentage", value: 10, maxDiscount: 50000 },
      FIRST50: { type: "fixed", value: 50000 },
      FREESHIP: { type: "free_delivery", value: 0 },
    };

    const promo = promoCodes[code.toUpperCase()];

    if (!promo) {
      return res.status(400).json({
        success: false,
        message: "Invalid promo code",
      });
    }

    let discount = 0;
    let freeDelivery = false;

    if (promo.type === "percentage") {
      discount = Math.min(
        Math.round(subtotal * (promo.value / 100)),
        promo.maxDiscount || Infinity
      );
    } else if (promo.type === "fixed") {
      discount = promo.value;
    } else if (promo.type === "free_delivery") {
      freeDelivery = true;
    }

    res.json({
      success: true,
      promo: {
        code,
        discount,
        freeDelivery,
        message: `Promo applied! You save ${discount.toLocaleString()} UGX`,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
