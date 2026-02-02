const mongoose = require("mongoose");

/**
 * Delivery Zone Model
 * Defines delivery areas, fees, and availability for sellers
 */
const deliveryZoneSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    // Zone name (e.g., "Kampala Central", "Within 5km")
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Zone type
    type: {
      type: String,
      enum: ["radius", "city", "region", "custom"],
      default: "city",
    },
    // For radius-based zones
    radius: {
      center: {
        lat: { type: Number },
        lng: { type: Number },
      },
      distance: { type: Number }, // in km
    },
    // Cities/areas covered
    areas: [
      {
        city: String,
        state: String,
        country: String,
      },
    ],
    // Delivery options available in this zone
    deliveryOptions: {
      safeboda: {
        enabled: { type: Boolean, default: false },
        baseFee: { type: Number, default: 0 },
        perKmFee: { type: Number, default: 0 },
      },
      faras: {
        enabled: { type: Boolean, default: false },
        baseFee: { type: Number, default: 0 },
        perKmFee: { type: Number, default: 0 },
      },
      personal: {
        enabled: { type: Boolean, default: true },
        baseFee: { type: Number, default: 0 },
        perKmFee: { type: Number, default: 0 },
        freeAbove: { type: Number, default: 0 }, // Free delivery above this order amount
      },
      pickup: {
        enabled: { type: Boolean, default: true },
        address: { type: String, default: "" },
        hours: { type: String, default: "9am - 6pm" },
      },
      shipping: {
        enabled: { type: Boolean, default: false },
        baseFee: { type: Number, default: 0 },
        estimatedDays: { type: String, default: "3-5 days" },
      },
    },
    // Estimated delivery time
    estimatedTime: {
      type: String,
      default: "30-60 mins",
    },
    // Minimum order for delivery
    minimumOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Index for quick lookup
deliveryZoneSchema.index({ businessId: 1, isActive: 1 });

// Calculate delivery fee for an order
deliveryZoneSchema.methods.calculateDeliveryFee = function (method, distance, orderTotal) {
  const option = this.deliveryOptions[method];
  if (!option || !option.enabled) {
    return { available: false, fee: 0 };
  }

  // Check if free delivery applies
  if (option.freeAbove && orderTotal >= option.freeAbove) {
    return { available: true, fee: 0, freeDelivery: true };
  }

  // Calculate fee
  let fee = option.baseFee || 0;
  if (option.perKmFee && distance) {
    fee += option.perKmFee * distance;
  }

  return { available: true, fee: Math.round(fee * 100) / 100 };
};

module.exports = mongoose.model("DeliveryZone", deliveryZoneSchema);
