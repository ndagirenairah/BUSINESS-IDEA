const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Buyer = require("../models/Buyer");
const Admin = require("../models/Admin");

// Protect routes - require authentication (Seller/Business)
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in header
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from token
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({ message: "User not found" });
    }

    next();
  } catch (error) {
    res.status(401).json({ message: "Not authorized, token failed" });
  }
};

// Protect routes for Buyers
const protectBuyer = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if this is a buyer token
    if (decoded.type !== "buyer") {
      return res.status(401).json({ message: "Not authorized as buyer" });
    }

    req.buyer = await Buyer.findById(decoded.id).select("-password");

    if (!req.buyer) {
      return res.status(401).json({ message: "Buyer not found" });
    }

    if (!req.buyer.isActive) {
      return res.status(403).json({ message: "Account has been deactivated" });
    }

    next();
  } catch (error) {
    res.status(401).json({ message: "Not authorized, token failed" });
  }
};

// Protect routes for Admins
const protectAdmin = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if this is an admin token
    if (decoded.type !== "admin") {
      return res.status(401).json({ message: "Not authorized as admin" });
    }

    req.admin = await Admin.findById(decoded.id).select("-password");

    if (!req.admin) {
      return res.status(401).json({ message: "Admin not found" });
    }

    if (!req.admin.isActive) {
      return res.status(403).json({ message: "Admin account has been deactivated" });
    }

    next();
  } catch (error) {
    res.status(401).json({ message: "Not authorized, token failed" });
  }
};

// Check if user is owner
const ownerOnly = (req, res, next) => {
  if (req.user && req.user.role === "owner") {
    next();
  } else {
    res.status(403).json({ message: "Access denied. Owners only." });
  }
};

// Optional buyer auth (for features that work with both logged-in and guest users)
const optionalBuyerAuth = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.type === "buyer") {
        req.buyer = await Buyer.findById(decoded.id).select("-password");
      }
    }

    next();
  } catch (error) {
    // Continue without auth
    next();
  }
};

module.exports = { protect, protectBuyer, protectAdmin, ownerOnly, optionalBuyerAuth };
