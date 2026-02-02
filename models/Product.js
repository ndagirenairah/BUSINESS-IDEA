const mongoose = require("mongoose");

// Valid categories
const VALID_CATEGORIES = [
  "electronics",
  "fashion",
  "home",
  "beauty",
  "vehicles",
  "books",
  "services",
  "food",
  "others",
];

const productSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    name: {
      type: String,
      required: [true, "Product name is required"],
      trim: true,
    },
    category: {
      type: String,
      required: [true, "Category is required"],
      lowercase: true,
      enum: {
        values: VALID_CATEGORIES,
        message: "Invalid category. Must be one of: " + VALID_CATEGORIES.join(", "),
      },
    },
    subcategory: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0,
    },
    // Original price for showing discounts
    originalPrice: {
      type: Number,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
    },
    stock: {
      type: Number,
      required: [true, "Stock quantity is required"],
      min: 0,
      default: 0,
    },
    description: {
      type: String,
      default: "",
    },
    // Multiple images support
    image: {
      type: String,
      default: "",
    },
    images: [
      {
        url: String,
        alt: String,
      },
    ],
    // Product specifications
    specifications: [
      {
        name: String,
        value: String,
      },
    ],
    // Tags for better search
    tags: [String],
    // Product condition (for second-hand marketplace)
    condition: {
      type: String,
      enum: ["new", "like_new", "good", "fair", "poor"],
      default: "new",
    },
    // Ratings (cached from Reviews)
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
    // Engagement stats
    stats: {
      views: { type: Number, default: 0 },
      wishlistCount: { type: Number, default: 0 },
      inquiries: { type: Number, default: 0 },
    },
    // Location-based
    location: {
      city: { type: String, default: "" },
      country: { type: String, default: "" },
    },
    // Moderation status
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected", "suspended"],
      default: "approved",
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    // Shipping options
    shipping: {
      freeShipping: { type: Boolean, default: false },
      shippingCost: { type: Number, default: 0 },
      deliveryTime: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

// Text index for search
productSchema.index({ name: "text", description: "text", tags: "text" });

// Compound indexes for common queries
productSchema.index({ category: 1, isAvailable: 1, status: 1 });
productSchema.index({ businessId: 1, createdAt: -1 });
productSchema.index({ "location.city": 1, category: 1 });

// Virtual for discount percentage
productSchema.virtual("discountPercentage").get(function () {
  if (this.originalPrice && this.originalPrice > this.price) {
    return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
  }
  return 0;
});

// Increment view count
productSchema.methods.incrementViews = async function () {
  this.stats.views += 1;
  await this.save();
};

module.exports = mongoose.model("Product", productSchema);
