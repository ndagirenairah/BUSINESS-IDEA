const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const buyerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
    },
    phone: {
      type: String,
      default: "",
    },
    avatar: {
      type: String,
      default: "",
    },
    location: {
      city: { type: String, default: "" },
      country: { type: String, default: "" },
      address: { type: String, default: "" },
    },
    // Wishlist - array of product IDs
    wishlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    // Recently viewed products
    recentlyViewed: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        viewedAt: { type: Date, default: Date.now },
      },
    ],
    // ========== SMART INTERESTS TRACKING ==========
    // Categories buyer is interested in (learned from activity)
    interestedCategories: [
      {
        category: { type: String },
        score: { type: Number, default: 1 }, // Higher = more interested
        lastInteraction: { type: Date, default: Date.now },
      },
    ],
    // Search history for recommendations
    searchHistory: [
      {
        query: String,
        searchedAt: { type: Date, default: Date.now },
      },
    ],
    // Price range preferences (learned)
    pricePreferences: {
      minPrice: { type: Number, default: 0 },
      maxPrice: { type: Number, default: 10000 },
      avgPrice: { type: Number, default: 0 },
    },
    // Followed sellers
    followedSellers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Business",
      },
    ],
    // ========== PUSH NOTIFICATIONS ==========
    // Device tokens for push notifications
    deviceTokens: [
      {
        token: { type: String, required: true },
        platform: { type: String, enum: ["ios", "android", "web"], default: "android" },
        addedAt: { type: Date, default: Date.now },
      },
    ],
    // Notification preferences
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false },
      // Specific notification types
      newProducts: { type: Boolean, default: true },
      priceDrops: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      orderUpdates: { type: Boolean, default: true },
      promotions: { type: Boolean, default: false },
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Hash password before saving
buyerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
buyerSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Add to recently viewed (keep last 20)
buyerSchema.methods.addToRecentlyViewed = async function (productId) {
  // Remove if already exists
  this.recentlyViewed = this.recentlyViewed.filter(
    (item) => item.product.toString() !== productId.toString()
  );
  // Add to beginning
  this.recentlyViewed.unshift({ product: productId, viewedAt: new Date() });
  // Keep only last 20
  if (this.recentlyViewed.length > 20) {
    this.recentlyViewed = this.recentlyViewed.slice(0, 20);
  }
  await this.save();
};

// ========== SMART INTEREST TRACKING METHODS ==========

// Track category interest when buyer views/interacts with products
buyerSchema.methods.trackCategoryInterest = async function (category, action = "view") {
  // Weight different actions differently
  const weights = {
    view: 1,
    wishlist: 3,
    purchase: 5,
    search: 2,
    click: 1,
  };
  const weight = weights[action] || 1;

  // Find existing category interest
  const existingIndex = this.interestedCategories.findIndex(
    (item) => item.category === category.toLowerCase()
  );

  if (existingIndex >= 0) {
    // Update existing
    this.interestedCategories[existingIndex].score += weight;
    this.interestedCategories[existingIndex].lastInteraction = new Date();
  } else {
    // Add new interest
    this.interestedCategories.push({
      category: category.toLowerCase(),
      score: weight,
      lastInteraction: new Date(),
    });
  }

  // Keep only top 10 categories, sorted by score
  this.interestedCategories.sort((a, b) => b.score - a.score);
  if (this.interestedCategories.length > 10) {
    this.interestedCategories = this.interestedCategories.slice(0, 10);
  }

  await this.save();
};

// Get top interested categories
buyerSchema.methods.getTopCategories = function (limit = 5) {
  return this.interestedCategories
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.category);
};

// Track search query
buyerSchema.methods.trackSearch = async function (query) {
  this.searchHistory.unshift({ query, searchedAt: new Date() });
  // Keep only last 50 searches
  if (this.searchHistory.length > 50) {
    this.searchHistory = this.searchHistory.slice(0, 50);
  }
  await this.save();
};

// Update price preferences based on viewed/purchased products
buyerSchema.methods.updatePricePreferences = async function (price) {
  const viewed = this.recentlyViewed.length || 1;
  // Calculate running average
  this.pricePreferences.avgPrice =
    (this.pricePreferences.avgPrice * (viewed - 1) + price) / viewed;

  // Update min/max if needed
  if (price < this.pricePreferences.minPrice || this.pricePreferences.minPrice === 0) {
    this.pricePreferences.minPrice = price * 0.5; // 50% below lowest viewed
  }
  if (price > this.pricePreferences.maxPrice) {
    this.pricePreferences.maxPrice = price * 1.5; // 50% above highest viewed
  }

  await this.save();
};

// Add device token for push notifications
buyerSchema.methods.addDeviceToken = async function (token, platform = "android") {
  // Remove existing token if present
  this.deviceTokens = this.deviceTokens.filter((t) => t.token !== token);
  // Add new token
  this.deviceTokens.push({ token, platform, addedAt: new Date() });
  // Keep only last 5 devices
  if (this.deviceTokens.length > 5) {
    this.deviceTokens = this.deviceTokens.slice(-5);
  }
  await this.save();
};

// Check if buyer is interested in a category
buyerSchema.methods.isInterestedIn = function (category) {
  const interest = this.interestedCategories.find(
    (item) => item.category === category.toLowerCase()
  );
  return interest && interest.score >= 2;
};

module.exports = mongoose.model("Buyer", buyerSchema);
