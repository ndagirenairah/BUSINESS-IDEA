const express = require("express");
const Product = require("../models/Product");
const Business = require("../models/Business");
const { protect } = require("../middleware/auth");
const upload = require("../middleware/upload");

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
router.post("/", protect, upload.single("image"), async (req, res) => {
  try {
    const { name, category, price, stock, description } = req.body;

    const product = await Product.create({
      businessId: req.user.businessId,
      name,
      category,
      price,
      stock,
      description,
      image: req.file ? `/uploads/${req.file.filename}` : "",
    });

    res.status(201).json({
      message: "Product added successfully! 🎉",
      product,
    });
  } catch (error) {
    res.status(500).json({ message: "Error creating product", error: error.message });
  }
});

// @route   PUT /api/products/:id
// @desc    Update product
// @access  Private
router.put("/:id", protect, upload.single("image"), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if product belongs to user's business
    if (product.businessId.toString() !== req.user.businessId.toString()) {
      return res.status(403).json({ message: "Not authorized to edit this product" });
    }

    const { name, category, price, stock, description, isAvailable } = req.body;

    product.name = name || product.name;
    product.category = category || product.category;
    product.price = price || product.price;
    product.stock = stock !== undefined ? stock : product.stock;
    product.description = description || product.description;
    product.isAvailable = isAvailable !== undefined ? isAvailable : product.isAvailable;

    if (req.file) {
      product.image = `/uploads/${req.file.filename}`;
    }

    await product.save();

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
