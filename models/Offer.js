const mongoose = require("mongoose");

/**
 * Offer/Negotiation Model
 * Allows buyers to propose prices and negotiate with sellers
 */
const offerSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Buyer",
      required: true,
    },
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

    // Original product price
    originalPrice: {
      type: Number,
      required: true,
    },

    // Offer details
    offerPrice: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },

    // Offer message from buyer
    message: {
      type: String,
      default: "",
      maxlength: 500,
    },

    // Status
    status: {
      type: String,
      enum: [
        "pending",      // Waiting for seller response
        "accepted",     // Seller accepted
        "rejected",     // Seller rejected
        "countered",    // Seller made counter offer
        "expired",      // Offer expired
        "withdrawn",    // Buyer withdrew
        "completed",    // Order placed with this offer
      ],
      default: "pending",
    },

    // Counter offer from seller
    counterOffer: {
      price: { type: Number },
      message: { type: String },
      createdAt: { type: Date },
    },

    // Negotiation history
    history: [
      {
        action: {
          type: String,
          enum: ["offer", "counter", "accept", "reject", "withdraw", "expire"],
        },
        price: Number,
        message: String,
        by: {
          type: String,
          enum: ["buyer", "seller"],
        },
        timestamp: { type: Date, default: Date.now },
      },
    ],

    // Expiration
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },

    // If accepted, reference to the order
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },

    // Response timestamps
    respondedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

// Indexes
offerSchema.index({ productId: 1, status: 1 });
offerSchema.index({ buyerId: 1, status: 1 });
offerSchema.index({ sellerId: 1, status: 1 });
offerSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Calculate discount percentage
offerSchema.virtual("discountPercent").get(function () {
  return Math.round(
    ((this.originalPrice - this.offerPrice) / this.originalPrice) * 100
  );
});

// Add to negotiation history
offerSchema.methods.addHistory = function (action, price, message, by) {
  this.history.push({ action, price, message, by, timestamp: new Date() });
};

// Accept offer
offerSchema.methods.accept = async function () {
  this.status = "accepted";
  this.respondedAt = new Date();
  this.addHistory("accept", this.offerPrice, "Offer accepted", "seller");
  await this.save();
  return this;
};

// Reject offer
offerSchema.methods.reject = async function (message = "") {
  this.status = "rejected";
  this.respondedAt = new Date();
  this.addHistory("reject", this.offerPrice, message || "Offer rejected", "seller");
  await this.save();
  return this;
};

// Counter offer
offerSchema.methods.counter = async function (newPrice, message = "") {
  this.status = "countered";
  this.counterOffer = {
    price: newPrice,
    message,
    createdAt: new Date(),
  };
  this.respondedAt = new Date();
  // Extend expiration by 24 hours
  this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  this.addHistory("counter", newPrice, message, "seller");
  await this.save();
  return this;
};

// Buyer accepts counter offer
offerSchema.methods.acceptCounter = async function () {
  if (this.status !== "countered") {
    throw new Error("No counter offer to accept");
  }
  this.offerPrice = this.counterOffer.price;
  this.status = "accepted";
  this.addHistory("accept", this.counterOffer.price, "Counter offer accepted", "buyer");
  await this.save();
  return this;
};

// Withdraw offer
offerSchema.methods.withdraw = async function () {
  this.status = "withdrawn";
  this.addHistory("withdraw", this.offerPrice, "Offer withdrawn", "buyer");
  await this.save();
  return this;
};

// Mark as completed (order placed)
offerSchema.methods.complete = async function (orderId) {
  this.status = "completed";
  this.orderId = orderId;
  this.completedAt = new Date();
  await this.save();
  return this;
};

module.exports = mongoose.model("Offer", offerSchema);
