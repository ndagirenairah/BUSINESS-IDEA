const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Business = require("../models/Business");
const { protect } = require("../middleware/auth");

const router = express.Router();

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// @route   POST /api/auth/register
// @desc    Register new business & owner
// @access  Public
router.post("/register", async (req, res) => {
  try {
    const { businessName, businessType, name, email, password, phone, whatsapp, location } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    // Create business first
    const business = await Business.create({
      name: businessName,
      type: businessType,
      email,
      phone,
      whatsapp: whatsapp || phone,
      location,
    });

    // Create owner user
    const user = await User.create({
      businessId: business._id,
      name,
      email,
      password,
      role: "owner",
    });

    // Generate token
    const token = generateToken(user._id);

    res.status(201).json({
      message: "Registration successful! 🎉",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        businessId: business._id,
        businessName: business.name,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Registration failed", error: error.message });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Get business info
    const business = await Business.findById(user.businessId);

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: "Login successful! 🎉",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        businessId: user.businessId,
        businessName: business?.name,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Login failed", error: error.message });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get("/me", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    const business = await Business.findById(user.businessId);

    res.json({
      user,
      business,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching profile", error: error.message });
  }
});

// @route   POST /api/auth/add-staff
// @desc    Add staff member (owner only)
// @access  Private
router.post("/add-staff", protect, async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Only owners can add staff" });
    }

    const { name, email, password } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists with this email" });
    }

    // Create staff user
    const staff = await User.create({
      businessId: req.user.businessId,
      name,
      email,
      password,
      role: "staff",
    });

    res.status(201).json({
      message: "Staff member added! 🎉",
      staff: {
        id: staff._id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to add staff", error: error.message });
  }
});

module.exports = router;
