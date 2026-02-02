const express = require("express");
const Review = require("../models/Review");
const Product = require("../models/Product");
const Order = require("../models/Order");
const Notification = require("../models/Notification");
const { protectBuyer, protect } = require("../middleware/auth");
const upload = require("../middleware/upload");

const router = express.Router();

// @route   POST /api/reviews/:productId
// @desc    Create a review for a product
// @access  Private (Buyer)
router.post("/:productId", protectBuyer, upload.array("images", 5), async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, title, comment } = req.body;

    // Get product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Check if buyer already reviewed
    const existingReview = await Review.findOne({
      productId,
      buyerId: req.buyer._id,
    });
    if (existingReview) {
      return res.status(400).json({ message: "You have already reviewed this product" });
    }

    // Check if this is a verified purchase
    const hasPurchased = await Order.findOne({
      buyerId: req.buyer._id,
      "items.productId": productId,
      status: { $in: ["delivered", "completed"] },
    });

    // Create review
    const review = await Review.create({
      productId,
      buyerId: req.buyer._id,
      businessId: product.businessId,
      rating,
      title,
      comment,
      images: req.files ? req.files.map((f) => `/uploads/${f.filename}`) : [],
      isVerifiedPurchase: !!hasPurchased,
    });

    // Update product rating
    const ratingData = await Review.calculateAverageRating(product._id);
    product.rating = ratingData;
    await product.save();

    // Notify seller
    await Notification.notify({
      recipientId: product.businessId,
      recipientType: "Business",
      type: "new_review",
      title: "New Review! ⭐",
      message: `${req.buyer.name} left a ${rating}-star review on "${product.name}"`,
      actionType: "product",
      referenceId: product._id,
    });

    res.status(201).json({
      message: "Review submitted! ⭐",
      review,
    });
  } catch (error) {
    res.status(500).json({ message: "Error creating review", error: error.message });
  }
});

// @route   GET /api/reviews/product/:productId
// @desc    Get all reviews for a product
// @access  Public
router.get("/product/:productId", async (req, res) => {
  try {
    const { page = 1, limit = 10, sort = "newest" } = req.query;

    let sortOption = {};
    switch (sort) {
      case "newest":
        sortOption = { createdAt: -1 };
        break;
      case "oldest":
        sortOption = { createdAt: 1 };
        break;
      case "highest":
        sortOption = { rating: -1 };
        break;
      case "lowest":
        sortOption = { rating: 1 };
        break;
      case "helpful":
        sortOption = { helpfulVotes: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const reviews = await Review.find({
      productId: req.params.productId,
      status: "approved",
    })
      .populate("buyerId", "name avatar")
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Review.countDocuments({
      productId: req.params.productId,
      status: "approved",
    });

    // Get rating distribution
    const ratingDistribution = await Review.aggregate([
      { $match: { productId: require("mongoose").Types.ObjectId(req.params.productId), status: "approved" } },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]);

    // Calculate stats
    const stats = await Review.calculateAverageRating(require("mongoose").Types.ObjectId(req.params.productId));

    res.json({
      reviews,
      stats,
      ratingDistribution,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching reviews", error: error.message });
  }
});

// @route   PUT /api/reviews/:reviewId
// @desc    Update a review
// @access  Private (Buyer - owner only)
router.put("/:reviewId", protectBuyer, async (req, res) => {
  try {
    const { rating, title, comment } = req.body;

    const review = await Review.findById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (review.buyerId.toString() !== req.buyer._id.toString()) {
      return res.status(403).json({ message: "Not authorized to edit this review" });
    }

    review.rating = rating || review.rating;
    review.title = title || review.title;
    review.comment = comment || review.comment;
    await review.save();

    // Update product rating
    const ratingData = await Review.calculateAverageRating(review.productId);
    await Product.findByIdAndUpdate(review.productId, { rating: ratingData });

    res.json({ message: "Review updated! ✅", review });
  } catch (error) {
    res.status(500).json({ message: "Error updating review", error: error.message });
  }
});

// @route   DELETE /api/reviews/:reviewId
// @desc    Delete a review
// @access  Private (Buyer - owner only)
router.delete("/:reviewId", protectBuyer, async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (review.buyerId.toString() !== req.buyer._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this review" });
    }

    const productId = review.productId;
    await review.deleteOne();

    // Update product rating
    const ratingData = await Review.calculateAverageRating(productId);
    await Product.findByIdAndUpdate(productId, { rating: ratingData });

    res.json({ message: "Review deleted! 🗑️" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting review", error: error.message });
  }
});

// @route   POST /api/reviews/:reviewId/helpful
// @desc    Mark review as helpful
// @access  Private (Buyer)
router.post("/:reviewId/helpful", protectBuyer, async (req, res) => {
  try {
    const review = await Review.findById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Check if already voted
    if (review.votedBy.includes(req.buyer._id)) {
      return res.status(400).json({ message: "You already voted for this review" });
    }

    review.helpfulVotes += 1;
    review.votedBy.push(req.buyer._id);
    await review.save();

    res.json({ message: "Thanks for your feedback! 👍", helpfulVotes: review.helpfulVotes });
  } catch (error) {
    res.status(500).json({ message: "Error voting", error: error.message });
  }
});

// @route   POST /api/reviews/:reviewId/reply
// @desc    Seller reply to a review
// @access  Private (Seller)
router.post("/:reviewId/reply", protect, async (req, res) => {
  try {
    const { message } = req.body;

    const review = await Review.findById(req.params.reviewId);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Check if user's business owns the product
    if (review.businessId.toString() !== req.user.businessId.toString()) {
      return res.status(403).json({ message: "Not authorized to reply to this review" });
    }

    review.sellerReply = {
      message,
      repliedAt: new Date(),
    };
    await review.save();

    // Notify buyer
    await Notification.notify({
      recipientId: review.buyerId,
      recipientType: "Buyer",
      type: "review_reply",
      title: "Seller Replied to Your Review",
      message: `The seller responded to your review`,
      actionType: "product",
      referenceId: review.productId,
    });

    res.json({ message: "Reply posted! 💬", review });
  } catch (error) {
    res.status(500).json({ message: "Error posting reply", error: error.message });
  }
});

// @route   GET /api/reviews/my-reviews
// @desc    Get buyer's reviews
// @access  Private (Buyer)
router.get("/my-reviews", protectBuyer, async (req, res) => {
  try {
    const reviews = await Review.find({ buyerId: req.buyer._id })
      .populate("productId", "name image price")
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: "Error fetching reviews", error: error.message });
  }
});

module.exports = router;
