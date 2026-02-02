const express = require("express");
const RecommendationService = require("../services/recommendations");
const PushNotificationService = require("../services/pushNotifications");
const Buyer = require("../models/Buyer");
const Product = require("../models/Product");
const { protectBuyer, optionalBuyerAuth } = require("../middleware/auth");

const router = express.Router();

// ========================================
// PERSONALIZED RECOMMENDATIONS
// ========================================

// @route   GET /api/recommendations/for-you
// @desc    Get personalized recommendations for logged in buyer
// @access  Private (Buyer)
router.get("/for-you", protectBuyer, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const recommendations = await RecommendationService.getRecommendationsForBuyer(
      req.buyer._id,
      parseInt(limit)
    );

    res.json({
      message: "Personalized just for you! ✨",
      products: recommendations,
      count: recommendations.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Error getting recommendations", error: error.message });
  }
});

// @route   GET /api/recommendations/suggested
// @desc    Get suggested products based on activity
// @access  Private (Buyer)
router.get("/suggested", protectBuyer, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const suggested = await RecommendationService.getSuggestedForYou(
      req.buyer._id,
      parseInt(limit)
    );

    res.json({
      message: "Suggested for you 💡",
      products: suggested,
      count: suggested.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Error getting suggestions", error: error.message });
  }
});

// @route   GET /api/recommendations/similar/:productId
// @desc    Get similar products
// @access  Public
router.get("/similar/:productId", async (req, res) => {
  try {
    const { limit = 6 } = req.query;
    
    const similar = await RecommendationService.getSimilarProducts(
      req.params.productId,
      parseInt(limit)
    );

    res.json({
      message: "Similar products",
      products: similar,
      count: similar.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Error getting similar products", error: error.message });
  }
});

// @route   GET /api/recommendations/because-you-viewed
// @desc    Get recommendations based on recently viewed
// @access  Private (Buyer)
router.get("/because-you-viewed", protectBuyer, async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.buyer._id).populate("recentlyViewed.product");
    
    if (!buyer.recentlyViewed || buyer.recentlyViewed.length === 0) {
      return res.json({ message: "No viewing history yet", products: [] });
    }

    // Get the most recently viewed product
    const lastViewed = buyer.recentlyViewed[0].product;
    
    if (!lastViewed) {
      return res.json({ message: "No viewing history yet", products: [] });
    }

    const similar = await RecommendationService.getSimilarProducts(lastViewed._id, 6);

    res.json({
      message: `Because you viewed "${lastViewed.name}"`,
      basedOn: {
        id: lastViewed._id,
        name: lastViewed.name,
      },
      products: similar,
    });
  } catch (error) {
    res.status(500).json({ message: "Error getting recommendations", error: error.message });
  }
});

// ========================================
// ACTIVITY TRACKING
// ========================================

// @route   POST /api/recommendations/track/view/:productId
// @desc    Track when buyer views a product
// @access  Private (Buyer)
router.post("/track/view/:productId", protectBuyer, async (req, res) => {
  try {
    await RecommendationService.trackActivity(req.buyer._id, req.params.productId, "view");
    
    // Increment product view count
    await Product.findByIdAndUpdate(req.params.productId, {
      $inc: { "stats.views": 1 },
    });

    res.json({ message: "View tracked" });
  } catch (error) {
    res.status(500).json({ message: "Error tracking view", error: error.message });
  }
});

// @route   POST /api/recommendations/track/search
// @desc    Track buyer search queries
// @access  Private (Buyer)
router.post("/track/search", protectBuyer, async (req, res) => {
  try {
    const { query, category } = req.body;
    
    await req.buyer.trackSearch(query);
    
    // Also track category interest if provided
    if (category) {
      await req.buyer.trackCategoryInterest(category, "search");
    }

    res.json({ message: "Search tracked" });
  } catch (error) {
    res.status(500).json({ message: "Error tracking search", error: error.message });
  }
});

// @route   POST /api/recommendations/track/click/:productId
// @desc    Track when buyer clicks on a product
// @access  Private (Buyer) - but works with optional auth
router.post("/track/click/:productId", optionalBuyerAuth, async (req, res) => {
  try {
    if (req.buyer) {
      await RecommendationService.trackActivity(req.buyer._id, req.params.productId, "click");
    }
    res.json({ message: "Click tracked" });
  } catch (error) {
    res.status(500).json({ message: "Error tracking click", error: error.message });
  }
});

// ========================================
// PUSH NOTIFICATION MANAGEMENT
// ========================================

// @route   POST /api/recommendations/device-token
// @desc    Register device token for push notifications
// @access  Private (Buyer)
router.post("/device-token", protectBuyer, async (req, res) => {
  try {
    const { token, platform } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Device token is required" });
    }

    await PushNotificationService.registerDeviceToken(
      req.buyer._id,
      token,
      platform || "android"
    );

    res.json({ message: "Device registered for notifications! 🔔" });
  } catch (error) {
    res.status(500).json({ message: "Error registering device", error: error.message });
  }
});

// @route   DELETE /api/recommendations/device-token
// @desc    Remove device token (unregister for push)
// @access  Private (Buyer)
router.delete("/device-token", protectBuyer, async (req, res) => {
  try {
    const { token } = req.body;
    
    const buyer = await Buyer.findById(req.buyer._id);
    buyer.deviceTokens = buyer.deviceTokens.filter((t) => t.token !== token);
    await buyer.save();

    res.json({ message: "Device unregistered from notifications" });
  } catch (error) {
    res.status(500).json({ message: "Error unregistering device", error: error.message });
  }
});

// ========================================
// INTERESTS & PREFERENCES
// ========================================

// @route   GET /api/recommendations/my-interests
// @desc    Get buyer's tracked interests
// @access  Private (Buyer)
router.get("/my-interests", protectBuyer, async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.buyer._id);

    res.json({
      categories: buyer.interestedCategories,
      topCategories: buyer.getTopCategories(5),
      pricePreferences: buyer.pricePreferences,
      searchHistory: buyer.searchHistory.slice(0, 10),
      followedSellers: buyer.followedSellers,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching interests", error: error.message });
  }
});

// @route   PUT /api/recommendations/notification-preferences
// @desc    Update notification preferences
// @access  Private (Buyer)
router.put("/notification-preferences", protectBuyer, async (req, res) => {
  try {
    const { newProducts, priceDrops, messages, orderUpdates, promotions } = req.body;
    
    const buyer = await Buyer.findById(req.buyer._id);
    
    if (newProducts !== undefined) buyer.notifications.newProducts = newProducts;
    if (priceDrops !== undefined) buyer.notifications.priceDrops = priceDrops;
    if (messages !== undefined) buyer.notifications.messages = messages;
    if (orderUpdates !== undefined) buyer.notifications.orderUpdates = orderUpdates;
    if (promotions !== undefined) buyer.notifications.promotions = promotions;
    
    await buyer.save();

    res.json({
      message: "Notification preferences updated! ✅",
      notifications: buyer.notifications,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating preferences", error: error.message });
  }
});

// @route   POST /api/recommendations/follow-seller/:businessId
// @desc    Follow a seller for updates
// @access  Private (Buyer)
router.post("/follow-seller/:businessId", protectBuyer, async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.buyer._id);
    
    if (buyer.followedSellers.includes(req.params.businessId)) {
      return res.status(400).json({ message: "Already following this seller" });
    }
    
    buyer.followedSellers.push(req.params.businessId);
    await buyer.save();

    res.json({ message: "Now following seller! 🔔", followedSellers: buyer.followedSellers });
  } catch (error) {
    res.status(500).json({ message: "Error following seller", error: error.message });
  }
});

// @route   DELETE /api/recommendations/follow-seller/:businessId
// @desc    Unfollow a seller
// @access  Private (Buyer)
router.delete("/follow-seller/:businessId", protectBuyer, async (req, res) => {
  try {
    const buyer = await Buyer.findById(req.buyer._id);
    
    buyer.followedSellers = buyer.followedSellers.filter(
      (id) => id.toString() !== req.params.businessId
    );
    await buyer.save();

    res.json({ message: "Unfollowed seller", followedSellers: buyer.followedSellers });
  } catch (error) {
    res.status(500).json({ message: "Error unfollowing seller", error: error.message });
  }
});

// ========================================
// HOME FEED SECTIONS
// ========================================

// @route   GET /api/recommendations/home-feed
// @desc    Get complete home feed with all sections
// @access  Private (Buyer) - optional auth for guests
router.get("/home-feed", optionalBuyerAuth, async (req, res) => {
  try {
    const sections = [];

    // 1. Personalized recommendations (for logged in buyers)
    if (req.buyer) {
      const forYou = await RecommendationService.getRecommendationsForBuyer(req.buyer._id, 6);
      if (forYou.length > 0) {
        sections.push({
          id: "for-you",
          title: "Recommended for You ✨",
          type: "personalized",
          products: forYou,
        });
      }
    }

    // 2. Featured products
    const featured = await Product.find({
      isAvailable: true,
      status: "approved",
      isFeatured: true,
    })
      .populate("businessId", "name location")
      .sort({ createdAt: -1 })
      .limit(6);

    if (featured.length > 0) {
      sections.push({
        id: "featured",
        title: "Featured Products ⭐",
        type: "featured",
        products: featured,
      });
    }

    // 3. New arrivals
    const newArrivals = await Product.find({
      isAvailable: true,
      status: "approved",
    })
      .populate("businessId", "name location")
      .sort({ createdAt: -1 })
      .limit(6);

    sections.push({
      id: "new-arrivals",
      title: "New Arrivals 🆕",
      type: "new",
      products: newArrivals,
    });

    // 4. Trending (most viewed)
    const trending = await Product.find({
      isAvailable: true,
      status: "approved",
    })
      .populate("businessId", "name location")
      .sort({ "stats.views": -1 })
      .limit(6);

    sections.push({
      id: "trending",
      title: "Trending Now 🔥",
      type: "trending",
      products: trending,
    });

    // 5. Because you viewed (for logged in buyers)
    if (req.buyer) {
      const buyer = await Buyer.findById(req.buyer._id).populate("recentlyViewed.product");
      if (buyer.recentlyViewed && buyer.recentlyViewed.length > 0 && buyer.recentlyViewed[0].product) {
        const lastViewed = buyer.recentlyViewed[0].product;
        const similar = await RecommendationService.getSimilarProducts(lastViewed._id, 6);
        
        if (similar.length > 0) {
          sections.push({
            id: "because-you-viewed",
            title: `Because you viewed "${lastViewed.name}"`,
            type: "similar",
            basedOn: lastViewed._id,
            products: similar,
          });
        }
      }
    }

    // 6. On sale (products with discount)
    const onSale = await Product.find({
      isAvailable: true,
      status: "approved",
      originalPrice: { $exists: true, $gt: 0 },
      $expr: { $lt: ["$price", "$originalPrice"] },
    })
      .populate("businessId", "name location")
      .sort({ createdAt: -1 })
      .limit(6);

    if (onSale.length > 0) {
      sections.push({
        id: "on-sale",
        title: "On Sale 💰",
        type: "sale",
        products: onSale,
      });
    }

    res.json({
      message: "Home feed loaded",
      sections,
      timestamp: new Date(),
    });
  } catch (error) {
    res.status(500).json({ message: "Error loading home feed", error: error.message });
  }
});

module.exports = router;
