const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    // Order can have multiple items
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        productName: String,
        productImage: String,
        quantity: { type: Number, min: 1, default: 1 },
        price: { type: Number, required: true },
        total: { type: Number, required: true },
      },
    ],
    // Single product order (backward compatible)
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    // Can be a registered buyer or guest
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Buyer",
    },
    // Customer info (for guests or override)
    customerName: {
      type: String,
      required: [true, "Customer name is required"],
    },
    customerPhone: {
      type: String,
      required: [true, "Customer phone is required"],
    },
    customerEmail: {
      type: String,
      default: "",
    },
    // ========== DELIVERY OPTIONS ==========
    delivery: {
      // Delivery method chosen by buyer
      method: {
        type: String,
        enum: ["safeboda", "faras", "personal", "pickup", "other_rider", "shipping"],
        default: "personal",
      },
      // Delivery status
      status: {
        type: String,
        enum: [
          "pending",           // Waiting for seller to arrange
          "assigned",          // Rider assigned
          "picked_up",         // Rider picked up from seller
          "in_transit",        // On the way
          "arrived",           // Arrived at destination
          "delivered",         // Successfully delivered
          "failed",            // Delivery failed
          "returned",          // Returned to seller
        ],
        default: "pending",
      },
      // Rider/Courier info
      rider: {
        name: { type: String, default: "" },
        phone: { type: String, default: "" },
        vehicleType: { type: String, enum: ["bike", "car", "truck", "bicycle", "walking"], default: "bike" },
        vehiclePlate: { type: String, default: "" },
        photo: { type: String, default: "" },
        rating: { type: Number, default: 0 },
      },
      // Third-party service info
      serviceProvider: {
        name: { type: String, default: "" },          // SafeBoda, Faras, etc.
        orderId: { type: String, default: "" },       // Their order reference
        trackingUrl: { type: String, default: "" },   // Their tracking link
      },
      // Delivery fee
      fee: { type: Number, default: 0 },
      // Estimated time
      estimatedTime: { type: String, default: "" },   // e.g., "30-45 mins"
      estimatedArrival: { type: Date },
      actualDeliveryTime: { type: Date },
      // Distance
      distance: {
        value: { type: Number, default: 0 },          // in km
        text: { type: String, default: "" },          // e.g., "5.2 km"
      },
      // Special instructions
      instructions: { type: String, default: "" },
      // For pickup option
      pickupLocation: {
        address: { type: String, default: "" },
        landmark: { type: String, default: "" },
        coordinates: {
          lat: { type: Number },
          lng: { type: Number },
        },
      },
      // Delivery tracking history
      trackingHistory: [
        {
          status: String,
          location: String,
          timestamp: { type: Date, default: Date.now },
          note: String,
        },
      ],
    },
    // Delivery address (expanded)
    shippingAddress: {
      fullName: { type: String, default: "" },
      phone: { type: String, default: "" },
      street: { type: String, default: "" },
      apartment: { type: String, default: "" },
      landmark: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      country: { type: String, default: "" },
      zipCode: { type: String, default: "" },
      coordinates: {
        lat: { type: Number },
        lng: { type: Number },
      },
      isDefault: { type: Boolean, default: false },
    },
    // Order totals
    subtotal: {
      type: Number,
      required: true,
    },
    shippingCost: {
      type: Number,
      default: 0,
    },
    tax: {
      type: Number,
      default: 0,
    },
    discount: {
      type: Number,
      default: 0,
    },
    totalPrice: {
      type: Number,
      required: true,
    },
    // For backward compatibility
    quantity: {
      type: Number,
      min: 1,
      default: 1,
    },
    // Order status with more states
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "completed",
        "cancelled",
        "refunded",
      ],
      default: "pending",
    },
    // Payment info
    payment: {
      method: {
        type: String,
        enum: ["cash", "card", "bank_transfer", "mobile_money", "paypal", "other"],
        default: "cash",
      },
      status: {
        type: String,
        enum: ["pending", "paid", "failed", "refunded"],
        default: "pending",
      },
      transactionId: String,
      paidAt: Date,
    },
    // Tracking info
    tracking: {
      number: String,
      carrier: String,
      url: String,
      estimatedDelivery: Date,
    },
    notes: {
      type: String,
      default: "",
    },
    // Seller notes (internal)
    sellerNotes: {
      type: String,
      default: "",
    },
    // Status history
    statusHistory: [
      {
        status: String,
        note: String,
        updatedBy: mongoose.Schema.Types.ObjectId,
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Index for common queries
orderSchema.index({ businessId: 1, status: 1, createdAt: -1 });
orderSchema.index({ buyerId: 1, createdAt: -1 });
orderSchema.index({ "payment.status": 1 });
orderSchema.index({ "delivery.status": 1 });

// Add status to history
orderSchema.methods.updateStatus = async function (newStatus, note, updatedBy) {
  this.statusHistory.push({
    status: newStatus,
    note: note || "",
    updatedBy,
    updatedAt: new Date(),
  });
  this.status = newStatus;
  await this.save();
};

// Update delivery status with tracking
orderSchema.methods.updateDeliveryStatus = async function (newStatus, location, note) {
  this.delivery.status = newStatus;
  this.delivery.trackingHistory.push({
    status: newStatus,
    location: location || "",
    timestamp: new Date(),
    note: note || "",
  });

  // Update main order status based on delivery
  if (newStatus === "delivered") {
    this.status = "delivered";
    this.delivery.actualDeliveryTime = new Date();
  } else if (newStatus === "in_transit") {
    this.status = "shipped";
  } else if (newStatus === "picked_up") {
    this.status = "processing";
  }

  await this.save();
};

// Assign rider to order
orderSchema.methods.assignRider = async function (riderInfo) {
  this.delivery.rider = {
    name: riderInfo.name,
    phone: riderInfo.phone,
    vehicleType: riderInfo.vehicleType || "bike",
    vehiclePlate: riderInfo.vehiclePlate || "",
    photo: riderInfo.photo || "",
    rating: riderInfo.rating || 0,
  };
  this.delivery.status = "assigned";
  this.delivery.trackingHistory.push({
    status: "assigned",
    note: `Rider ${riderInfo.name} assigned`,
    timestamp: new Date(),
  });
  await this.save();
};

// Add delivery tracking update
orderSchema.methods.addDeliveryUpdate = function (status, note, location) {
  this.delivery.trackingHistory.push({
    status,
    note: note || "",
    location: location || "",
    timestamp: new Date(),
  });
};

module.exports = mongoose.model("Order", orderSchema);
