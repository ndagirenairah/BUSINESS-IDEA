const express = require("express");
const Product = require("../models/Product");
const Business = require("../models/Business");
const Buyer = require("../models/Buyer");
const { protectBuyer } = require("../middleware/auth");

const router = express.Router();

// @route   GET /api/marketplace
// @desc    Get marketplace feed (like Instagram/OLX)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      subcategory,
      search,
      minPrice,
      maxPrice,
      condition,
      city,
      country,
      sort = "newest",
      featured,
    } = req.query;

    // Build query
    let query = { isAvailable: true, status: "approved" };

    // Category filter
    if (category) query.category = category;
    if (subcategory) query.subcategory = subcategory;

    // Search
    if (search) {
      query.$text = { $search: search };
    }

    // Price range
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Condition
    if (condition) query.condition = condition;

    // Location
    if (city) query["location.city"] = { $regex: city, $options: "i" };
    if (country) query["location.country"] = { $regex: country, $options: "i" };

    // Featured only
    if (featured === "true") query.isFeatured = true;

    // Sort options
    let sortOption = {};
    switch (sort) {
      case "newest":
        sortOption = { createdAt: -1 };
        break;
      case "oldest":
        sortOption = { createdAt: 1 };
        break;
      case "price_low":
        sortOption = { price: 1 };
        break;
      case "price_high":
        sortOption = { price: -1 };
        break;
      case "popular":
        sortOption = { "stats.views": -1 };
        break;
      case "rating":
        sortOption = { "rating.average": -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const products = await Product.find(query)
      .populate("businessId", "name phone whatsapp location logo")
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .lean();

    const total = await Product.countDocuments(query);

    // Add discount percentage to each product
    const productsWithDiscount = products.map((product) => ({
      ...product,
      discountPercentage:
        product.originalPrice && product.originalPrice > product.price
          ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
          : 0,
    }));

    res.json({
      products: productsWithDiscount,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        hasMore: page * limit < total,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching marketplace", error: error.message });
  }
});

// @route   GET /api/marketplace/featured
// @desc    Get featured products for home page
// @access  Public
router.get("/featured", async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const featured = await Product.find({
      isAvailable: true,
      status: "approved",
      isFeatured: true,
    })
      .populate("businessId", "name location")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(featured);
  } catch (error) {
    res.status(500).json({ message: "Error fetching featured", error: error.message });
  }
});

// @route   GET /api/marketplace/trending
// @desc    Get trending products (most viewed)
// @access  Public
router.get("/trending", async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const trending = await Product.find({
      isAvailable: true,
      status: "approved",
    })
      .populate("businessId", "name location")
      .sort({ "stats.views": -1 })
      .limit(parseInt(limit));

    res.json(trending);
  } catch (error) {
    res.status(500).json({ message: "Error fetching trending", error: error.message });
  }
});

// @route   GET /api/marketplace/new-arrivals
// @desc    Get newest products
// @access  Public
router.get("/new-arrivals", async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const newArrivals = await Product.find({
      isAvailable: true,
      status: "approved",
    })
      .populate("businessId", "name location")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(newArrivals);
  } catch (error) {
    res.status(500).json({ message: "Error fetching new arrivals", error: error.message });
  }
});

// @route   GET /api/marketplace/categories
// @desc    Get all categories with product counts
// @access  Public
router.get("/categories", async (req, res) => {
  try {
    const categories = await Product.aggregate([
      { $match: { isAvailable: true, status: "approved" } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          subcategories: { $addToSet: "$subcategory" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    res.json(categories);
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories", error: error.message });
  }
});

// @route   GET /api/marketplace/product/:id
// @desc    Get single product with full details
// @access  Public
router.get("/product/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("businessId", "name phone whatsapp email location logo description");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Increment view count
    await product.incrementViews();

    // Get related products (same category)
    const relatedProducts = await Product.find({
      category: product.category,
      _id: { $ne: product._id },
      isAvailable: true,
      status: "approved",
    })
      .populate("businessId", "name")
      .limit(6);

    res.json({
      product,
      relatedProducts,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching product", error: error.message });
  }
});

// @route   POST /api/marketplace/product/:id/view
// @desc    Track product view (for logged in buyers)
// @access  Private (optional)
router.post("/product/:id/view", protectBuyer, async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.buyer._id);
    await buyer.addToRecentlyViewed(req.params.id);

    res.json({ message: "View tracked" });
  } catch (error) {
    res.status(500).json({ message: "Error tracking view", error: error.message });
  }
});

// @route   GET /api/marketplace/seller/:businessId
// @desc    Get seller profile and products
// @access  Public
router.get("/seller/:businessId", async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const business = await Business.findById(req.params.businessId);
    if (!business) {
      return res.status(404).json({ message: "Seller not found" });
    }

    const products = await Product.find({
      businessId: req.params.businessId,
      isAvailable: true,
      status: "approved",
    })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const totalProducts = await Product.countDocuments({
      businessId: req.params.businessId,
      isAvailable: true,
      status: "approved",
    });

    // Get seller stats
    const stats = await Product.aggregate([
      { $match: { businessId: business._id, status: "approved" } },
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          avgRating: { $avg: "$rating.average" },
          totalViews: { $sum: "$stats.views" },
        },
      },
    ]);

    res.json({
      seller: {
        id: business._id,
        name: business.name,
        type: business.type,
        location: business.location,
        logo: business.logo,
        description: business.description,
        phone: business.phone,
        whatsapp: business.whatsapp,
        joinedAt: business.createdAt,
        stats: stats[0] || { totalProducts: 0, avgRating: 0, totalViews: 0 },
      },
      products,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(totalProducts / limit),
        total: totalProducts,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching seller", error: error.message });
  }
});

// @route   GET /api/marketplace/search/suggestions
// @desc    Get search suggestions
// @access  Public
router.get("/search/suggestions", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json([]);
    }

    const suggestions = await Product.find({
      name: { $regex: q, $options: "i" },
      isAvailable: true,
      status: "approved",
    })
      .select("name category")
      .limit(10);

    // Also get categories that match
    const categories = await Product.distinct("category", {
      category: { $regex: q, $options: "i" },
      isAvailable: true,
      status: "approved",
    });

    res.json({
      products: suggestions.map((p) => ({ type: "product", text: p.name, category: p.category })),
      categories: categories.map((c) => ({ type: "category", text: c })),
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching suggestions", error: error.message });
  }
});

module.exports = router;
