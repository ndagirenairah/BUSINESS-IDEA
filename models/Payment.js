const mongoose = require("mongoose");

/**
 * Payment Model
 * Handles all payment transactions for the marketplace
 * Supports: Mobile Money (MTN, Airtel), Cards, Digital Wallets, COD
 */
const paymentSchema = new mongoose.Schema(
  {
    // Reference to the order
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    // Buyer who made the payment
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Buyer",
      required: true,
    },
    // Seller receiving payment
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },

    // Payment method details
    method: {
      type: String,
      enum: [
        "mtn_mobile_money",
        "airtel_money",
        "africell_money",
        "visa",
        "mastercard",
        "flutterwave",
        "stripe",
        "paypal",
        "cash_on_delivery",
      ],
      required: true,
    },
    methodCategory: {
      type: String,
      enum: ["mobile_money", "card", "digital_wallet", "cod"],
      required: true,
    },

    // Payment gateway info
    gateway: {
      provider: {
        type: String,
        enum: ["flutterwave", "stripe", "paypal", "direct", "manual"],
        default: "flutterwave",
      },
      transactionId: { type: String, default: "" },
      transactionRef: { type: String, default: "" },
      flutterwaveRef: { type: String, default: "" },
      chargeResponseCode: { type: String, default: "" },
      chargeResponseMessage: { type: String, default: "" },
    },

    // Amounts
    amount: {
      subtotal: { type: Number, required: true },
      deliveryFee: { type: Number, default: 0 },
      serviceFee: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      total: { type: Number, required: true },
    },
    currency: {
      type: String,
      default: "UGX", // Ugandan Shilling
    },

    // Payment status
    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "successful",
        "failed",
        "cancelled",
        "refunded",
        "partially_refunded",
        "held_in_escrow",
        "released",
      ],
      default: "pending",
    },

    // Escrow functionality
    escrow: {
      enabled: { type: Boolean, default: false },
      status: {
        type: String,
        enum: ["none", "held", "released", "refunded", "disputed"],
        default: "none",
      },
      heldAt: { type: Date },
      releasedAt: { type: Date },
      releaseCondition: {
        type: String,
        enum: ["delivery_confirmed", "time_elapsed", "manual", "none"],
        default: "delivery_confirmed",
      },
      autoReleaseDate: { type: Date },
    },

    // Split payment (seller + delivery service)
    splits: [
      {
        recipientType: {
          type: String,
          enum: ["seller", "delivery", "platform", "rider"],
        },
        recipientId: mongoose.Schema.Types.ObjectId,
        amount: Number,
        percentage: Number,
        status: {
          type: String,
          enum: ["pending", "paid", "failed"],
          default: "pending",
        },
        paidAt: Date,
      },
    ],

    // Mobile Money specific
    mobileMoneyDetails: {
      phoneNumber: { type: String, default: "" },
      network: { type: String, default: "" },
      accountName: { type: String, default: "" },
    },

    // Card specific (DO NOT store full card details - only last 4 digits)
    cardDetails: {
      lastFourDigits: { type: String, default: "" },
      cardType: { type: String, default: "" },
      expiryMonth: { type: String, default: "" },
      expiryYear: { type: String, default: "" },
      bank: { type: String, default: "" },
    },

    // Refund info
    refund: {
      amount: { type: Number, default: 0 },
      reason: { type: String, default: "" },
      refundedAt: { type: Date },
      refundTransactionId: { type: String, default: "" },
    },

    // Receipt
    receipt: {
      number: { type: String, default: "" },
      url: { type: String, default: "" },
      sentAt: { type: Date },
      sentVia: [{ type: String, enum: ["email", "sms", "in_app"] }],
    },

    // Timestamps for tracking
    initiatedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    failedAt: { type: Date },
    failureReason: { type: String, default: "" },

    // Metadata
    metadata: {
      ipAddress: { type: String, default: "" },
      userAgent: { type: String, default: "" },
      deviceId: { type: String, default: "" },
    },

    // Status history
    statusHistory: [
      {
        status: String,
        note: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Indexes
paymentSchema.index({ orderId: 1 });
paymentSchema.index({ buyerId: 1, createdAt: -1 });
paymentSchema.index({ sellerId: 1, createdAt: -1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ "gateway.transactionId": 1 });
paymentSchema.index({ "receipt.number": 1 });

// Generate receipt number
paymentSchema.pre("save", function (next) {
  if (!this.receipt.number) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.receipt.number = `RCP-${timestamp}-${random}`;
  }
  next();
});

// Add status to history
paymentSchema.methods.updateStatus = async function (newStatus, note = "") {
  this.statusHistory.push({
    status: newStatus,
    note,
    timestamp: new Date(),
  });
  this.status = newStatus;

  if (newStatus === "successful") {
    this.completedAt = new Date();
  } else if (newStatus === "failed") {
    this.failedAt = new Date();
    this.failureReason = note;
  }

  await this.save();
  return this;
};

// Process escrow release
paymentSchema.methods.releaseEscrow = async function (reason = "manual") {
  if (this.escrow.status !== "held") {
    throw new Error("Payment is not held in escrow");
  }

  this.escrow.status = "released";
  this.escrow.releasedAt = new Date();
  this.status = "released";

  this.statusHistory.push({
    status: "escrow_released",
    note: `Escrow released: ${reason}`,
    timestamp: new Date(),
  });

  await this.save();
  return this;
};

// Process refund
paymentSchema.methods.processRefund = async function (amount, reason, transactionId) {
  this.refund = {
    amount,
    reason,
    refundedAt: new Date(),
    refundTransactionId: transactionId,
  };

  if (amount >= this.amount.total) {
    this.status = "refunded";
  } else {
    this.status = "partially_refunded";
  }

  this.statusHistory.push({
    status: this.status,
    note: `Refund of ${amount} ${this.currency}: ${reason}`,
    timestamp: new Date(),
  });

  await this.save();
  return this;
};

// Calculate platform fee
paymentSchema.statics.calculateFees = function (subtotal, deliveryFee = 0) {
  const serviceFee = Math.round(subtotal * 0.025); // 2.5% platform fee
  const tax = 0; // VAT if applicable
  const total = subtotal + deliveryFee + serviceFee + tax;

  return {
    subtotal,
    deliveryFee,
    serviceFee,
    tax,
    total,
  };
};

module.exports = mongoose.model("Payment", paymentSchema);
