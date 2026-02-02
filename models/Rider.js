const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

/**
 * Rider Model (Optional)
 * For marketplaces that want to manage their own delivery riders
 */
const riderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      unique: true,
      sparse: true, // Allow null/undefined
      lowercase: true,
    },
    phone: {
      type: String,
      required: [true, "Phone is required"],
      unique: true,
    },
    password: {
      type: String,
      minlength: 6,
    },
    // Profile
    avatar: {
      type: String,
      default: "",
    },
    idNumber: {
      type: String,
      default: "",
    },
    idPhoto: {
      type: String,
      default: "",
    },
    // Vehicle info
    vehicle: {
      type: {
        type: String,
        enum: ["bike", "car", "truck", "bicycle", "walking"],
        default: "bike",
      },
      make: { type: String, default: "" },
      model: { type: String, default: "" },
      plateNumber: { type: String, default: "" },
      color: { type: String, default: "" },
      photo: { type: String, default: "" },
    },
    // Current location (for real-time tracking)
    currentLocation: {
      lat: { type: Number },
      lng: { type: Number },
      updatedAt: { type: Date },
    },
    // Availability
    status: {
      type: String,
      enum: ["available", "busy", "offline"],
      default: "offline",
    },
    // Current order being delivered
    currentOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
    },
    // Service area (cities they cover)
    serviceAreas: [
      {
        city: String,
        state: String,
      },
    ],
    // Stats
    stats: {
      totalDeliveries: { type: Number, default: 0 },
      completedDeliveries: { type: Number, default: 0 },
      cancelledDeliveries: { type: Number, default: 0 },
      totalEarnings: { type: Number, default: 0 },
      averageRating: { type: Number, default: 0 },
      totalRatings: { type: Number, default: 0 },
    },
    // Ratings from buyers
    ratings: [
      {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
        buyerId: { type: mongoose.Schema.Types.ObjectId, ref: "Buyer" },
        rating: { type: Number, min: 1, max: 5 },
        comment: String,
        createdAt: { type: Date, default: Date.now },
      },
    ],
    // For push notifications
    deviceToken: {
      type: String,
      default: "",
    },
    // Verification status
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Working hours
    workingHours: {
      start: { type: String, default: "08:00" },
      end: { type: String, default: "22:00" },
    },
  },
  { timestamps: true }
);

// Hash password
riderSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
riderSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Update location
riderSchema.methods.updateLocation = async function (lat, lng) {
  this.currentLocation = {
    lat,
    lng,
    updatedAt: new Date(),
  };
  await this.save();
};

// Complete delivery
riderSchema.methods.completeDelivery = async function (orderId, earnings = 0) {
  this.stats.totalDeliveries += 1;
  this.stats.completedDeliveries += 1;
  this.stats.totalEarnings += earnings;
  this.currentOrder = null;
  this.status = "available";
  await this.save();
};

// Add rating
riderSchema.methods.addRating = async function (orderId, buyerId, rating, comment) {
  this.ratings.push({ orderId, buyerId, rating, comment });
  this.stats.totalRatings += 1;
  
  // Recalculate average
  const sum = this.ratings.reduce((acc, r) => acc + r.rating, 0);
  this.stats.averageRating = Math.round((sum / this.ratings.length) * 10) / 10;
  
  await this.save();
};

module.exports = mongoose.model("Rider", riderSchema);
