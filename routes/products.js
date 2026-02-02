const express = require("express");
const Product = require("../models/Product");
const Business = require("../models/Business");
const { protect } = require("../middleware/auth");
const upload = require("../middleware/upload");
const PushNotificationService = require("../services/pushNotifications");

const router = express.Router();

// @route   GET /api/products
// @desc    Get all products (public - for customers)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const { category, search, businessId } = req.query;
    let query = { isAvailable: true };

    if (category) query.category = category;
    if (businessId) query.businessId = businessId;
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const products = await Product.find(query)
      .populate("businessId", "name phone whatsapp location")
      .sort({ createdAt: -1 });

    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Error fetching products", error: error.message });
  }
});

// @route   GET /api/products/my-products
// @desc    Get products for logged in business
// @access  Private
router.get("/my-products", protect, async (req, res) => {
  try {
    const products = await Product.find({ businessId: req.user.businessId }).sort({ createdAt: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Error fetching products", error: error.message });
  }
});

// @route   GET /api/products/:id
// @desc    Get single product
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate(
      "businessId",
      "name phone whatsapp location email"
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Error fetching product", error: error.message });
  }
});

// @route   POST /api/products
// @desc    Create new product
// @access  Private
router.post("/", protect, upload.array("images", 5), async (req, res) => {
  try {
    const { 
      name, 
      category, 
      subcategory,
      price, 
      originalPrice,
      stock, 
      description,
      condition,
      tags,
      specifications,
      location,
      shipping,
    } = req.body;

    // Get business for location
    const business = await Business.findById(req.user.businessId);

    // Handle multiple images
    let images = [];
    let mainImage = "";
    
    if (req.files && req.files.length > 0) {
      images = req.files.map((file, index) => ({
        url: `/uploads/${file.filename}`,
        alt: `${name} image ${index + 1}`,
      }));
      mainImage = `/uploads/${req.files[0].filename}`;
    }

    // Parse tags if sent as string
    let parsedTags = [];
    if (tags) {
      parsedTags = typeof tags === "string" ? tags.split(",").map((t) => t.trim()) : tags;
    }

    // Parse specifications if sent as string
    let parsedSpecs = [];
    if (specifications) {
      parsedSpecs = typeof specifications === "string" ? JSON.parse(specifications) : specifications;
    }

    const product = await Product.create({
      businessId: req.user.businessId,
      name,
      category: category.toLowerCase(),
      subcategory,
      price,
      originalPrice,
      stock,
      description,
      image: mainImage,
      images,
      condition: condition || "new",
      tags: parsedTags,
      specifications: parsedSpecs,
      location: location || {
        city: business?.location || "",
        country: "",
      },
      shipping: shipping ? (typeof shipping === "string" ? JSON.parse(shipping) : shipping) : {},
    });

    // 🔔 Notify interested buyers about new product!
    const notificationResult = await PushNotificationService.notifyNewProduct(product, business);
    console.log(`✅ Product created. Notified ${notificationResult.notifiedCount} interested buyers.`);

    res.status(201).json({
      message: "Product added successfully! 🎉",
      product,
      notifiedBuyers: notificationResult.notifiedCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Error creating product", error: error.message });
  }
});

// @route   PUT /api/products/:id
// @desc    Update product
// @access  Private
router.put("/:id", protect, upload.array("images", 5), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if product belongs to user's business
    if (product.businessId.toString() !== req.user.businessId.toString()) {
      return res.status(403).json({ message: "Not authorized to edit this product" });
    }

    const { 
      name, 
      category, 
      subcategory,
      price, 
      originalPrice,
      stock, 
      description, 
      isAvailable,
      condition,
      tags,
      specifications,
      location,
      shipping,
    } = req.body;

    // Track old price for price drop notification
    const oldPrice = product.price;
    const oldStock = product.stock;

    // Update fields
    if (name) product.name = name;
    if (category) product.category = category.toLowerCase();
    if (subcategory !== undefined) product.subcategory = subcategory;
    if (price !== undefined) product.price = price;
    if (originalPrice !== undefined) product.originalPrice = originalPrice;
    if (stock !== undefined) product.stock = stock;
    if (description !== undefined) product.description = description;
    if (isAvailable !== undefined) product.isAvailable = isAvailable;
    if (condition) product.condition = condition;
    
    // Handle tags
    if (tags) {
      product.tags = typeof tags === "string" ? tags.split(",").map((t) => t.trim()) : tags;
    }
    
    // Handle specifications
    if (specifications) {
      product.specifications = typeof specifications === "string" 
        ? JSON.parse(specifications) 
        : specifications;
    }
    
    // Handle location
    if (location) {
      product.location = typeof location === "string" ? JSON.parse(location) : location;
    }
    
    // Handle shipping
    if (shipping) {
      product.shipping = typeof shipping === "string" ? JSON.parse(shipping) : shipping;
    }

    // Handle multiple images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map((file, index) => ({
        url: `/uploads/${file.filename}`,
        alt: `${product.name} image ${index + 1}`,
      }));
      product.images = [...product.images, ...newImages];
      if (!product.image) {
        product.image = `/uploads/${req.files[0].filename}`;
      }
    }

    await product.save();

    // 🔔 Check for price drop and notify wishlist buyers
    if (price && price < oldPrice) {
      const priceDropResult = await PushNotificationService.notifyPriceDrop(
        product,
        oldPrice,
        price
      );
      console.log(`💰 Price drop! Notified ${priceDropResult.notifiedCount} buyers.`);
    }

    // 🔔 Check if back in stock
    if (oldStock === 0 && stock > 0) {
      const backInStockResult = await PushNotificationService.notifyBackInStock(product);
      console.log(`📦 Back in stock! Notified ${backInStockResult.notifiedCount} buyers.`);
    }

    res.json({
      message: "Product updated! ✅",
      product,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating product", error: error.message });
  }
});

// @route   DELETE /api/products/:id
// @desc    Delete product
// @access  Private
router.delete("/:id", protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if product belongs to user's business
    if (product.businessId.toString() !== req.user.businessId.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this product" });
    }

    await product.deleteOne();

    res.json({ message: "Product deleted! 🗑️" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting product", error: error.message });
  }
});

module.exports = router;
