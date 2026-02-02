const express = require("express");
const router = express.Router();
const Offer = require("../models/Offer");
const Product = require("../models/Product");
const Notification = require("../models/Notification");
const { protect, protectBuyer } = require("../middleware/auth");

// ============================================
// BUYER OFFER ROUTES
// ============================================

/**
 * @route   POST /api/offers
 * @desc    Make an offer on a product
 * @access  Private (Buyer)
 */
router.post("/", protectBuyer, async (req, res) => {
  try {
    const { productId, offerPrice, quantity = 1, message } = req.body;

    // Get product
    const product = await Product.findById(productId).populate(
      "businessId",
      "owner name"
    );

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (!product.isActive) {
      return res.status(400).json({
        success: false,
        message: "Product is not available",
      });
    }

    // Validate offer price (must be at least 50% of original)
    const minOffer = product.price * 0.5;
    if (offerPrice < minOffer) {
      return res.status(400).json({
        success: false,
        message: `Offer must be at least ${minOffer.toLocaleString()} UGX (50% of price)`,
      });
    }

    // Check if buyer has pending offer on this product
    const existingOffer = await Offer.findOne({
      productId,
      buyerId: req.buyer._id,
      status: { $in: ["pending", "countered"] },
    });

    if (existingOffer) {
      return res.status(400).json({
        success: false,
        message: "You already have a pending offer on this product",
        existingOffer: existingOffer._id,
      });
    }

    // Create offer
    const offer = await Offer.create({
      productId,
      buyerId: req.buyer._id,
      sellerId: product.businessId.owner,
      businessId: product.businessId._id,
      originalPrice: product.price,
      offerPrice,
      quantity,
      message,
      history: [
        {
          action: "offer",
          price: offerPrice,
          message,
          by: "buyer",
          timestamp: new Date(),
        },
      ],
    });

    // Notify seller
    await Notification.notify({
      recipientId: product.businessId.owner,
      recipientType: "User",
      type: "new_offer",
      title: "New Offer! 💰",
      message: `${req.buyer.firstName || "A buyer"} offered ${offerPrice.toLocaleString()} UGX for ${product.name}`,
      actionType: "offer",
      referenceId: offer._id,
    });

    res.status(201).json({
      success: true,
      message: "Offer sent successfully",
      offer: {
        id: offer._id,
        productId: offer.productId,
        originalPrice: offer.originalPrice,
        offerPrice: offer.offerPrice,
        discountPercent: Math.round(
          ((offer.originalPrice - offer.offerPrice) / offer.originalPrice) * 100
        ),
        status: offer.status,
        expiresAt: offer.expiresAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/offers/my-offers
 * @desc    Get buyer's offers
 * @access  Private (Buyer)
 */
router.get("/my-offers", protectBuyer, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = { buyerId: req.buyer._id };
    if (status) query.status = status;

    const offers = await Offer.find(query)
      .populate("productId", "name price images")
      .populate("businessId", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Offer.countDocuments(query);

    res.json({
      success: true,
      count: offers.length,
      total,
      pages: Math.ceil(total / limit),
      offers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/offers/:offerId/accept-counter
 * @desc    Buyer accepts seller's counter offer
 * @access  Private (Buyer)
 */
router.post("/:offerId/accept-counter", protectBuyer, async (req, res) => {
  try {
    const offer = await Offer.findOne({
      _id: req.params.offerId,
      buyerId: req.buyer._id,
      status: "countered",
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Counter offer not found",
      });
    }

    await offer.acceptCounter();

    // Notify seller
    await Notification.notify({
      recipientId: offer.sellerId,
      recipientType: "User",
      type: "offer_accepted",
      title: "Counter Offer Accepted! ✅",
      message: `Your counter offer of ${offer.offerPrice.toLocaleString()} UGX was accepted`,
      actionType: "offer",
      referenceId: offer._id,
    });

    res.json({
      success: true,
      message: "Counter offer accepted! You can now place your order.",
      offer,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/offers/:offerId/withdraw
 * @desc    Buyer withdraws their offer
 * @access  Private (Buyer)
 */
router.post("/:offerId/withdraw", protectBuyer, async (req, res) => {
  try {
    const offer = await Offer.findOne({
      _id: req.params.offerId,
      buyerId: req.buyer._id,
      status: { $in: ["pending", "countered"] },
    });

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found or cannot be withdrawn",
      });
    }

    await offer.withdraw();

    res.json({
      success: true,
      message: "Offer withdrawn",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// SELLER OFFER ROUTES
// ============================================

/**
 * @route   GET /api/offers/seller
 * @desc    Get offers received by seller
 * @access  Private (Seller)
 */
router.get("/seller", protect, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = { sellerId: req.user._id };
    if (status) query.status = status;

    const offers = await Offer.find(query)
      .populate("productId", "name price images stock")
      .populate("buyerId", "firstName lastName email phone")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Offer.countDocuments(query);

    // Get stats
    const stats = await Offer.aggregate([
      { $match: { sellerId: req.user._id } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      count: offers.length,
      total,
      pages: Math.ceil(total / limit),
      stats: stats.reduce((acc, s) => {
        acc[s._id] = s.count;
        return acc;
      }, {}),
      offers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/offers/:offerId/accept
 * @desc    Seller accepts an offer
 * @access  Private (Seller)
 */
router.post("/:offerId/accept", protect, async (req, res) => {
  try {
    const offer = await Offer.findOne({
      _id: req.params.offerId,
      sellerId: req.user._id,
      status: "pending",
    }).populate("productId", "name");

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    await offer.accept();

    // Notify buyer
    await Notification.notify({
      recipientId: offer.buyerId,
      recipientType: "Buyer",
      type: "offer_accepted",
      title: "Offer Accepted! 🎉",
      message: `Your offer of ${offer.offerPrice.toLocaleString()} UGX for ${offer.productId.name} was accepted!`,
      actionType: "offer",
      referenceId: offer._id,
    });

    res.json({
      success: true,
      message: "Offer accepted",
      offer,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/offers/:offerId/reject
 * @desc    Seller rejects an offer
 * @access  Private (Seller)
 */
router.post("/:offerId/reject", protect, async (req, res) => {
  try {
    const { message } = req.body;

    const offer = await Offer.findOne({
      _id: req.params.offerId,
      sellerId: req.user._id,
      status: "pending",
    }).populate("productId", "name");

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    await offer.reject(message);

    // Notify buyer
    await Notification.notify({
      recipientId: offer.buyerId,
      recipientType: "Buyer",
      type: "offer_rejected",
      title: "Offer Declined",
      message: `Your offer for ${offer.productId.name} was declined. ${message || ""}`,
      actionType: "product",
      referenceId: offer.productId._id,
    });

    res.json({
      success: true,
      message: "Offer rejected",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/offers/:offerId/counter
 * @desc    Seller makes a counter offer
 * @access  Private (Seller)
 */
router.post("/:offerId/counter", protect, async (req, res) => {
  try {
    const { counterPrice, message } = req.body;

    const offer = await Offer.findOne({
      _id: req.params.offerId,
      sellerId: req.user._id,
      status: "pending",
    }).populate("productId", "name");

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found",
      });
    }

    if (counterPrice >= offer.originalPrice) {
      return res.status(400).json({
        success: false,
        message: "Counter offer must be less than original price",
      });
    }

    await offer.counter(counterPrice, message);

    // Notify buyer
    await Notification.notify({
      recipientId: offer.buyerId,
      recipientType: "Buyer",
      type: "counter_offer",
      title: "Counter Offer Received! 🤝",
      message: `Seller countered with ${counterPrice.toLocaleString()} UGX for ${offer.productId.name}`,
      actionType: "offer",
      referenceId: offer._id,
    });

    res.json({
      success: true,
      message: "Counter offer sent",
      offer,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/offers/product/:productId
 * @desc    Get all offers for a product (seller only)
 * @access  Private (Seller)
 */
router.get("/product/:productId", protect, async (req, res) => {
  try {
    // Verify seller owns this product
    const product = await Product.findOne({
      _id: req.params.productId,
    }).populate("businessId", "owner");

    if (!product || product.businessId.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized",
      });
    }

    const offers = await Offer.find({
      productId: req.params.productId,
      status: { $in: ["pending", "countered", "accepted"] },
    })
      .populate("buyerId", "firstName lastName")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: offers.length,
      offers,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
