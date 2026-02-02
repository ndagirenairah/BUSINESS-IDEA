const express = require("express");
const Business = require("../models/Business");
const { protect, ownerOnly } = require("../middleware/auth");
const upload = require("../middleware/upload");

const router = express.Router();

// @route   GET /api/business
// @desc    Get all businesses (public - for customers)
// @access  Public
router.get("/", async (req, res) => {
  try {
    const { type, search } = req.query;
    let query = { isActive: true };

    if (type) query.type = type;
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const businesses = await Business.find(query)
      .select("name type location logo")
      .sort({ createdAt: -1 });

    res.json(businesses);
  } catch (error) {
    res.status(500).json({ message: "Error fetching businesses", error: error.message });
  }
});

// @route   GET /api/business/:id
// @desc    Get single business details
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.json(business);
  } catch (error) {
    res.status(500).json({ message: "Error fetching business", error: error.message });
  }
});

// @route   PUT /api/business/update
// @desc    Update business details
// @access  Private (Owner only)
router.put("/update", protect, ownerOnly, upload.single("logo"), async (req, res) => {
  try {
    const business = await Business.findById(req.user.businessId);

    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    const { name, type, phone, whatsapp, location, description } = req.body;

    business.name = name || business.name;
    business.type = type || business.type;
    business.phone = phone || business.phone;
    business.whatsapp = whatsapp || business.whatsapp;
    business.location = location || business.location;
    business.description = description || business.description;

    if (req.file) {
      business.logo = `/uploads/${req.file.filename}`;
    }

    await business.save();

    res.json({
      message: "Business updated! ✅",
      business,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating business", error: error.message });
  }
});

module.exports = router;
