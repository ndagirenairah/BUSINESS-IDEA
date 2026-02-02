const express = require("express");
const Product = require("../models/Product");
const {
  CATEGORIES,
  CATEGORY_KEYS,
  getCategoriesArray,
  getCategoryByKey,
} = require("../models/Category");

const router = express.Router();

// @route   GET /api/categories
// @desc    Get all categories with icons and subcategories
// @access  Public
router.get("/", async (req, res) => {
  try {
    const { withCounts = "false" } = req.query;

    let categories = getCategoriesArray();

    // Optionally add product counts
    if (withCounts === "true") {
      const counts = await Product.aggregate([
        { $match: { isAvailable: true, status: "approved" } },
        { $group: { _id: { $toLower: "$category" }, count: { $sum: 1 } } },
      ]);

      const countMap = {};
      counts.forEach((c) => {
        countMap[c._id] = c.count;
      });

      categories = categories.map((cat) => ({
        ...cat,
        productCount: countMap[cat.id] || 0,
      }));
    }

    res.json({
      message: "Categories retrieved successfully",
      categories,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching categories", error: error.message });
  }
});

// @route   GET /api/categories/:categoryId
// @desc    Get single category with subcategories
// @access  Public
router.get("/:categoryId", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const category = getCategoryByKey(categoryId);

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Get product count for this category
    const productCount = await Product.countDocuments({
      category: { $regex: new RegExp(`^${categoryId}$`, "i") },
      isAvailable: true,
      status: "approved",
    });

    // Get subcategory counts
    const subcategoryCounts = await Product.aggregate([
      {
        $match: {
          category: { $regex: new RegExp(`^${categoryId}$`, "i") },
          isAvailable: true,
          status: "approved",
        },
      },
      { $group: { _id: "$subcategory", count: { $sum: 1 } } },
    ]);

    const subcategoryCountMap = {};
    subcategoryCounts.forEach((s) => {
      if (s._id) subcategoryCountMap[s._id] = s.count;
    });

    const subcategoriesWithCounts = category.subcategories.map((sub) => ({
      name: sub,
      productCount: subcategoryCountMap[sub] || 0,
    }));

    res.json({
      ...category,
      productCount,
      subcategories: subcategoriesWithCounts,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching category", error: error.message });
  }
});

// @route   GET /api/categories/:categoryId/products
// @desc    Get all products in a category
// @access  Public
router.get("/:categoryId/products", async (req, res) => {
  try {
    const { categoryId } = req.params;
    const {
      page = 1,
      limit = 20,
      subcategory,
      minPrice,
      maxPrice,
      condition,
      sort = "newest",
      city,
    } = req.query;

    // Validate category
    const category = getCategoryByKey(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Build query
    let query = {
      category: { $regex: new RegExp(`^${categoryId}$`, "i") },
      isAvailable: true,
      status: "approved",
    };

    // Filters
    if (subcategory) query.subcategory = subcategory;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }
    if (condition) query.condition = condition;
    if (city) query["location.city"] = { $regex: city, $options: "i" };

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
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({
      category,
      products,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
        hasMore: page * limit < total,
      },
      filters: {
        subcategory,
        minPrice,
        maxPrice,
        condition,
        city,
        sort,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching products", error: error.message });
  }
});

// @route   GET /api/categories/featured/all
// @desc    Get featured products from each category
// @access  Public
router.get("/featured/all", async (req, res) => {
  try {
    const { limit = 4 } = req.query;

    const categories = getCategoriesArray();
    const featuredByCategory = [];

    for (const category of categories) {
      const products = await Product.find({
        category: { $regex: new RegExp(`^${category.id}$`, "i") },
        isAvailable: true,
        status: "approved",
      })
        .populate("businessId", "name location")
        .sort({ "stats.views": -1, createdAt: -1 })
        .limit(parseInt(limit));

      if (products.length > 0) {
        featuredByCategory.push({
          category,
          products,
        });
      }
    }

    res.json(featuredByCategory);
  } catch (error) {
    res.status(500).json({ message: "Error fetching featured", error: error.message });
  }
});

// @route   GET /api/categories/stats/overview
// @desc    Get category statistics for admin/analytics
// @access  Public
router.get("/stats/overview", async (req, res) => {
  try {
    const stats = await Product.aggregate([
      { $match: { isAvailable: true, status: "approved" } },
      {
        $group: {
          _id: { $toLower: "$category" },
          totalProducts: { $sum: 1 },
          totalViews: { $sum: "$stats.views" },
          avgPrice: { $avg: "$price" },
          avgRating: { $avg: "$rating.average" },
        },
      },
      { $sort: { totalProducts: -1 } },
    ]);

    const categories = getCategoriesArray();
    const statsWithInfo = stats.map((stat) => {
      const categoryInfo = categories.find((c) => c.id === stat._id);
      return {
        ...stat,
        name: categoryInfo?.name || stat._id,
        icon: categoryInfo?.icon || "📦",
      };
    });

    res.json(statsWithInfo);
  } catch (error) {
    res.status(500).json({ message: "Error fetching stats", error: error.message });
  }
});

module.exports = router;
