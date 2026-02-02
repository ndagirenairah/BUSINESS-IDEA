const express = require("express");
const jwt = require("jsonwebtoken");
const Buyer = require("../models/Buyer");
const Product = require("../models/Product");
const { protectBuyer } = require("../middleware/auth");

const router = express.Router();

// Generate JWT Token
const generateToken = (id, type = "buyer") => {
  return jwt.sign({ id, type }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });
};

// @route   POST /api/buyer/register
// @desc    Register new buyer
// @access  Public
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone, location } = req.body;

    // Check if buyer exists
    const existingBuyer = await Buyer.findOne({ email });
    if (existingBuyer) {
      return res.status(400).json({ message: "Account already exists with this email" });
    }

    // Create buyer
    const buyer = await Buyer.create({
      name,
      email,
      password,
      phone: phone || "",
      location: location || {},
    });

    const token = generateToken(buyer._id, "buyer");

    res.status(201).json({
      message: "Welcome to the marketplace! 🎉",
      token,
      user: {
        id: buyer._id,
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone,
        type: "buyer",
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
});

// @route   POST /api/buyer/login
// @desc    Login buyer
// @access  Public
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const buyer = await Buyer.findOne({ email });
    if (!buyer) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await buyer.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Update last login
    buyer.lastLogin = new Date();
    await buyer.save();

    const token = generateToken(buyer._id, "buyer");

    res.json({
      message: "Welcome back! 🎉",
      token,
      user: {
        id: buyer._id,
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone,
        avatar: buyer.avatar,
        type: "buyer",
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
});

// @route   GET /api/buyer/profile
// @desc    Get buyer profile
// @access  Private
router.get("/profile", protectBuyer, async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.buyer._id)
      .select("-password")
      .populate("wishlist", "name price image")
      .populate("recentlyViewed.product", "name price image");

    res.json(buyer);
  } catch (error) {
    res.status(500).json({ message: "Error fetching profile", error: error.message });
  }
});

// @route   PUT /api/buyer/profile
// @desc    Update buyer profile
// @access  Private
router.put("/profile", protectBuyer, async (req, res) => {
  try {
    const { name, phone, avatar, location, notifications } = req.body;
    const buyer = await Buyer.findById(req.buyer._id);

    if (name) buyer.name = name;
    if (phone) buyer.phone = phone;
    if (avatar) buyer.avatar = avatar;
    if (location) buyer.location = { ...buyer.location, ...location };
    if (notifications) buyer.notifications = { ...buyer.notifications, ...notifications };

    await buyer.save();

    res.json({
      message: "Profile updated! ✅",
      buyer: {
        id: buyer._id,
        name: buyer.name,
        email: buyer.email,
        phone: buyer.phone,
        avatar: buyer.avatar,
        location: buyer.location,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating profile", error: error.message });
  }
});

// @route   POST /api/buyer/wishlist/:productId
// @desc    Add product to wishlist
// @access  Private
router.post("/wishlist/:productId", protectBuyer, async (req, res) => {
  try {
    const { productId } = req.params;
    const buyer = await Buyer.findById(req.buyer._id);

    // Check if already in wishlist
    if (buyer.wishlist.includes(productId)) {
      return res.status(400).json({ message: "Product already in wishlist" });
    }

    buyer.wishlist.push(productId);
    await buyer.save();

    // Update product wishlist count
    await Product.findByIdAndUpdate(productId, { $inc: { "stats.wishlistCount": 1 } });

    res.json({ message: "Added to wishlist! ❤️", wishlist: buyer.wishlist });
  } catch (error) {
    res.status(500).json({ message: "Error adding to wishlist", error: error.message });
  }
});

// @route   DELETE /api/buyer/wishlist/:productId
// @desc    Remove product from wishlist
// @access  Private
router.delete("/wishlist/:productId", protectBuyer, async (req, res) => {
  try {
    const { productId } = req.params;
    const buyer = await Buyer.findById(req.buyer._id);

    buyer.wishlist = buyer.wishlist.filter((id) => id.toString() !== productId);
    await buyer.save();

    // Update product wishlist count
    await Product.findByIdAndUpdate(productId, { $inc: { "stats.wishlistCount": -1 } });

    res.json({ message: "Removed from wishlist", wishlist: buyer.wishlist });
  } catch (error) {
    res.status(500).json({ message: "Error removing from wishlist", error: error.message });
  }
});

// @route   GET /api/buyer/wishlist
// @desc    Get buyer's wishlist
// @access  Private
router.get("/wishlist", protectBuyer, async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.buyer._id).populate({
      path: "wishlist",
      populate: { path: "businessId", select: "name location" },
    });

    res.json(buyer.wishlist);
  } catch (error) {
    res.status(500).json({ message: "Error fetching wishlist", error: error.message });
  }
});

// @route   GET /api/buyer/recently-viewed
// @desc    Get recently viewed products
// @access  Private
router.get("/recently-viewed", protectBuyer, async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.buyer._id).populate({
      path: "recentlyViewed.product",
      populate: { path: "businessId", select: "name" },
    });

    res.json(buyer.recentlyViewed);
  } catch (error) {
    res.status(500).json({ message: "Error fetching recently viewed", error: error.message });
  }
});

// @route   PUT /api/buyer/change-password
// @desc    Change password
// @access  Private
router.put("/change-password", protectBuyer, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const buyer = await Buyer.findById(req.buyer._id);

    const isMatch = await buyer.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    buyer.password = newPassword;
    await buyer.save();

    res.json({ message: "Password changed successfully! 🔐" });
  } catch (error) {
    res.status(500).json({ message: "Error changing password", error: error.message });
  }
});

module.exports = router;
