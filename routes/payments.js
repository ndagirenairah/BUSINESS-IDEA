const express = require("express");
const router = express.Router();
const Payment = require("../models/Payment");
const Order = require("../models/Order");
const PaymentService = require("../services/paymentService");
const { protect, protectBuyer, protectAdmin } = require("../middleware/auth");

// ============================================
// BUYER PAYMENT ROUTES
// ============================================

/**
 * @route   GET /api/payments/methods
 * @desc    Get available payment methods
 * @access  Public
 */
router.get("/methods", (req, res) => {
  const paymentMethods = {
    mobile_money: [
      {
        id: "mtn_mobile_money",
        name: "MTN Mobile Money",
        icon: "mtn-logo",
        description: "Pay with your MTN MoMo account",
        popular: true,
      },
      {
        id: "airtel_money",
        name: "Airtel Money",
        icon: "airtel-logo",
        description: "Pay with your Airtel Money account",
        popular: true,
      },
      {
        id: "africell_money",
        name: "Africell Money",
        icon: "africell-logo",
        description: "Pay with your Africell Money account",
        popular: false,
      },
    ],
    card: [
      {
        id: "visa",
        name: "Visa",
        icon: "visa-logo",
        description: "Pay with Visa debit/credit card",
        popular: true,
      },
      {
        id: "mastercard",
        name: "Mastercard",
        icon: "mastercard-logo",
        description: "Pay with Mastercard",
        popular: true,
      },
    ],
    digital_wallet: [
      {
        id: "flutterwave",
        name: "Flutterwave",
        icon: "flutterwave-logo",
        description: "Pay via Flutterwave",
        popular: false,
      },
      {
        id: "paypal",
        name: "PayPal",
        icon: "paypal-logo",
        description: "Pay with PayPal",
        popular: false,
      },
    ],
    cod: [
      {
        id: "cash_on_delivery",
        name: "Cash on Delivery",
        icon: "cash-icon",
        description: "Pay when you receive your order",
        popular: true,
      },
    ],
  };

  res.json({
    success: true,
    paymentMethods,
    recommended: ["mtn_mobile_money", "airtel_money", "cash_on_delivery"],
  });
});

/**
 * @route   POST /api/payments/calculate
 * @desc    Calculate payment total with fees
 * @access  Public
 */
router.post("/calculate", (req, res) => {
  try {
    const { subtotal, deliveryFee = 0 } = req.body;

    const fees = Payment.calculateFees(subtotal, deliveryFee);

    res.json({
      success: true,
      breakdown: {
        subtotal: fees.subtotal,
        deliveryFee: fees.deliveryFee,
        serviceFee: fees.serviceFee,
        tax: fees.tax,
        total: fees.total,
      },
      currency: "UGX",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/payments/initiate
 * @desc    Initiate a payment for an order
 * @access  Private (Buyer)
 */
router.post("/initiate", protectBuyer, async (req, res) => {
  try {
    const {
      orderId,
      method,
      phoneNumber,
      useEscrow = false,
    } = req.body;

    // Get order
    const order = await Order.findOne({
      _id: orderId,
      buyerId: req.buyer._id,
    }).populate("businessId", "owner name");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.payment.status === "paid") {
      return res.status(400).json({
        success: false,
        message: "Order is already paid",
      });
    }

    // Initialize payment
    const result = await PaymentService.initializePayment({
      orderId: order._id,
      buyerId: req.buyer._id,
      sellerId: order.businessId.owner,
      businessId: order.businessId._id,
      method,
      amount: {
        subtotal: order.subtotal,
        deliveryFee: order.delivery?.fee || order.shippingCost || 0,
      },
      currency: "UGX",
      customerEmail: req.buyer.email,
      customerPhone: phoneNumber || req.buyer.phone,
      customerName: req.buyer.fullName || req.buyer.firstName,
      useEscrow,
      metadata: {
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      },
    });

    // Update order with payment method
    order.payment.method = method.includes("money")
      ? "mobile_money"
      : method === "cash_on_delivery"
      ? "cash"
      : "card";
    await order.save();

    res.json({
      success: true,
      message: result.message,
      paymentId: result.paymentId,
      requiresAction: result.requiresAction,
      actionType: result.actionType,
      redirectUrl: result.redirectUrl,
      transactionRef: result.transactionRef,
    });
  } catch (error) {
    console.error("Payment initiation error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/payments/status/:paymentId
 * @desc    Get payment status
 * @access  Private (Buyer)
 */
router.get("/status/:paymentId", protectBuyer, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      buyerId: req.buyer._id,
    }).select("status method amount receipt gateway.chargeResponseMessage createdAt completedAt");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    res.json({
      success: true,
      payment: {
        id: payment._id,
        status: payment.status,
        method: payment.method,
        amount: payment.amount,
        receipt: payment.receipt,
        message: payment.gateway.chargeResponseMessage,
        createdAt: payment.createdAt,
        completedAt: payment.completedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/payments/verify/:paymentId
 * @desc    Verify payment status (poll after mobile money)
 * @access  Private (Buyer)
 */
router.post("/verify/:paymentId", protectBuyer, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      buyerId: req.buyer._id,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    // If already successful, return
    if (payment.status === "successful" || payment.status === "held_in_escrow") {
      return res.json({
        success: true,
        status: payment.status,
        receiptNumber: payment.receipt.number,
      });
    }

    // Verify with gateway if still processing
    if (payment.status === "processing" && payment.gateway.transactionId) {
      const verification = await PaymentService.verifyPayment(
        payment.gateway.transactionId,
        payment.gateway.transactionRef
      );

      if (verification.data?.status === "successful") {
        await PaymentService.markPaymentSuccessful(payment, verification.data);
        return res.json({
          success: true,
          status: "successful",
          receiptNumber: payment.receipt.number,
        });
      }
    }

    res.json({
      success: true,
      status: payment.status,
      message: "Payment is still being processed",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/payments/history
 * @desc    Get buyer's payment history
 * @access  Private (Buyer)
 */
router.get("/history", protectBuyer, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const query = { buyerId: req.buyer._id };
    if (status) query.status = status;

    const payments = await Payment.find(query)
      .populate("orderId", "orderNumber items")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select("amount method status receipt createdAt orderId");

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      count: payments.length,
      total,
      pages: Math.ceil(total / limit),
      payments,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/payments/receipt/:paymentId
 * @desc    Get payment receipt
 * @access  Private (Buyer)
 */
router.get("/receipt/:paymentId", protectBuyer, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      buyerId: req.buyer._id,
      status: { $in: ["successful", "held_in_escrow", "released"] },
    })
      .populate("orderId", "orderNumber items shippingAddress delivery")
      .populate("businessId", "name address phone");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Receipt not found",
      });
    }

    res.json({
      success: true,
      receipt: {
        receiptNumber: payment.receipt.number,
        date: payment.completedAt,
        paymentMethod: payment.method,
        amount: payment.amount,
        currency: payment.currency,
        order: payment.orderId,
        seller: payment.businessId,
        status: payment.status,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/payments/confirm-delivery/:paymentId
 * @desc    Buyer confirms delivery to release escrow
 * @access  Private (Buyer)
 */
router.post("/confirm-delivery/:paymentId", protectBuyer, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      buyerId: req.buyer._id,
      status: "held_in_escrow",
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found or not in escrow",
      });
    }

    await PaymentService.releaseEscrow(payment._id, "delivery_confirmed");

    res.json({
      success: true,
      message: "Delivery confirmed. Payment released to seller.",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// WEBHOOK / CALLBACK ROUTES
// ============================================

/**
 * @route   POST /api/payments/webhook
 * @desc    Handle Flutterwave webhook
 * @access  Public (verified by signature)
 */
router.post("/webhook", async (req, res) => {
  try {
    // Verify webhook signature
    const secretHash = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    const signature = req.headers["verif-hash"];

    if (secretHash && signature !== secretHash) {
      return res.status(401).json({ success: false, message: "Invalid signature" });
    }

    await PaymentService.handleWebhook(req.body);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/payments/callback
 * @desc    Handle payment redirect callback
 * @access  Public
 */
router.get("/callback", async (req, res) => {
  try {
    const { status, tx_ref, transaction_id } = req.query;

    if (status === "successful" && transaction_id) {
      // Verify and update payment
      const payment = await Payment.findOne({
        "gateway.transactionRef": tx_ref,
      });

      if (payment && payment.status === "processing") {
        const verification = await PaymentService.verifyPayment(transaction_id);
        if (verification.data?.status === "successful") {
          await PaymentService.markPaymentSuccessful(payment, verification.data);
        }
      }

      // Redirect to success page
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment/success?ref=${tx_ref}`
      );
    } else {
      // Redirect to failure page
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment/failed?ref=${tx_ref}`
      );
    }
  } catch (error) {
    console.error("Callback error:", error);
    res.redirect(`${process.env.FRONTEND_URL}/payment/failed`);
  }
});

// ============================================
// SELLER PAYMENT ROUTES
// ============================================

/**
 * @route   GET /api/payments/seller/analytics
 * @desc    Get seller payment analytics
 * @access  Private (Seller)
 */
router.get("/seller/analytics", protect, async (req, res) => {
  try {
    const { start, end } = req.query;

    const analytics = await PaymentService.getSellerAnalytics(req.user._id, {
      start,
      end,
    });

    res.json({
      success: true,
      analytics,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/payments/seller/transactions
 * @desc    Get seller's received payments
 * @access  Private (Seller)
 */
router.get("/seller/transactions", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, method } = req.query;

    const query = { sellerId: req.user._id };
    if (status) query.status = status;
    if (method) query.methodCategory = method;

    const payments = await Payment.find(query)
      .populate("orderId", "orderNumber customerName")
      .populate("buyerId", "firstName lastName")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .select("amount method methodCategory status receipt createdAt escrow");

    const total = await Payment.countDocuments(query);

    res.json({
      success: true,
      count: payments.length,
      total,
      pages: Math.ceil(total / limit),
      payments,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/payments/seller/cod-received/:paymentId
 * @desc    Mark COD payment as received
 * @access  Private (Seller)
 */
router.post("/seller/cod-received/:paymentId", protect, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      _id: req.params.paymentId,
      sellerId: req.user._id,
      method: "cash_on_delivery",
      status: "pending",
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "COD payment not found",
      });
    }

    await PaymentService.markPaymentSuccessful(payment, {
      processor_response: "COD_COLLECTED",
    });

    res.json({
      success: true,
      message: "Cash on Delivery payment marked as received",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// ADMIN PAYMENT ROUTES
// ============================================

/**
 * @route   GET /api/payments/admin/overview
 * @desc    Get platform-wide payment overview
 * @access  Private (Admin)
 */
router.get("/admin/overview", protectAdmin, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalPayments,
      successfulToday,
      revenueToday,
      revenueThisMonth,
      pendingEscrow,
      methodStats,
    ] = await Promise.all([
      Payment.countDocuments({}),
      Payment.countDocuments({
        status: "successful",
        completedAt: { $gte: today },
      }),
      Payment.aggregate([
        { $match: { status: "successful", completedAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: "$amount.total" } } },
      ]),
      Payment.aggregate([
        { $match: { status: "successful", completedAt: { $gte: thisMonth } } },
        { $group: { _id: null, total: { $sum: "$amount.total" } } },
      ]),
      Payment.aggregate([
        { $match: { "escrow.status": "held" } },
        { $group: { _id: null, total: { $sum: "$amount.total" }, count: { $sum: 1 } } },
      ]),
      Payment.aggregate([
        { $match: { status: "successful" } },
        {
          $group: {
            _id: "$methodCategory",
            count: { $sum: 1 },
            total: { $sum: "$amount.total" },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      overview: {
        totalPayments,
        successfulToday,
        revenueToday: revenueToday[0]?.total || 0,
        revenueThisMonth: revenueThisMonth[0]?.total || 0,
        pendingEscrow: {
          count: pendingEscrow[0]?.count || 0,
          amount: pendingEscrow[0]?.total || 0,
        },
        methodStats,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/payments/admin/refund/:paymentId
 * @desc    Process refund (admin)
 * @access  Private (Admin)
 */
router.post("/admin/refund/:paymentId", protectAdmin, async (req, res) => {
  try {
    const { amount, reason } = req.body;

    const result = await PaymentService.processRefund(
      req.params.paymentId,
      amount,
      reason
    );

    res.json({
      success: true,
      message: "Refund processed",
      payment: result.payment,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/payments/admin/release-escrow/:paymentId
 * @desc    Manually release escrow (admin)
 * @access  Private (Admin)
 */
router.post("/admin/release-escrow/:paymentId", protectAdmin, async (req, res) => {
  try {
    const { reason } = req.body;

    const result = await PaymentService.releaseEscrow(
      req.params.paymentId,
      reason || "admin_release"
    );

    res.json({
      success: true,
      message: "Escrow released",
      payment: result.payment,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
