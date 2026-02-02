/**
 * Smart Recommendation Service
 * Learns buyer interests and provides personalized product recommendations
 */

const Product = require("../models/Product");
const Buyer = require("../models/Buyer");

class RecommendationService {
  /**
   * Get personalized recommendations for a buyer
   */
  static async getRecommendationsForBuyer(buyerId, limit = 10) {
    try {
      const buyer = await Buyer.findById(buyerId);
      if (!buyer) return [];

      // Get buyer's top interested categories
      const topCategories = buyer.getTopCategories(5);

      // Get recently viewed product IDs to exclude
      const recentlyViewedIds = buyer.recentlyViewed.map((item) => item.product);
      const wishlistIds = buyer.wishlist;

      // Build recommendation query
      let recommendations = [];

      // 1. Products from interested categories
      if (topCategories.length > 0) {
        const categoryProducts = await Product.find({
          category: { $in: topCategories },
          _id: { $nin: [...recentlyViewedIds, ...wishlistIds] },
          isAvailable: true,
          status: "approved",
        })
          .populate("businessId", "name location")
          .sort({ "stats.views": -1, createdAt: -1 })
          .limit(limit);

        recommendations.push(...categoryProducts);
      }

      // 2. Products in buyer's price range
      if (recommendations.length < limit) {
        const priceProducts = await Product.find({
          price: {
            $gte: buyer.pricePreferences.minPrice,
            $lte: buyer.pricePreferences.maxPrice,
          },
          _id: { $nin: [...recentlyViewedIds, ...wishlistIds, ...recommendations.map((p) => p._id)] },
          isAvailable: true,
          status: "approved",
        })
          .populate("businessId", "name location")
          .sort({ createdAt: -1 })
          .limit(limit - recommendations.length);

        recommendations.push(...priceProducts);
      }

      // 3. Products from followed sellers
      if (recommendations.length < limit && buyer.followedSellers.length > 0) {
        const sellerProducts = await Product.find({
          businessId: { $in: buyer.followedSellers },
          _id: { $nin: [...recentlyViewedIds, ...wishlistIds, ...recommendations.map((p) => p._id)] },
          isAvailable: true,
          status: "approved",
        })
          .populate("businessId", "name location")
          .sort({ createdAt: -1 })
          .limit(limit - recommendations.length);

        recommendations.push(...sellerProducts);
      }

      // 4. Trending products as fallback
      if (recommendations.length < limit) {
        const trendingProducts = await Product.find({
          _id: { $nin: [...recentlyViewedIds, ...wishlistIds, ...recommendations.map((p) => p._id)] },
          isAvailable: true,
          status: "approved",
        })
          .populate("businessId", "name location")
          .sort({ "stats.views": -1 })
          .limit(limit - recommendations.length);

        recommendations.push(...trendingProducts);
      }

      return recommendations.slice(0, limit);
    } catch (error) {
      console.error("Recommendation error:", error);
      return [];
    }
  }

  /**
   * Get "Because you viewed..." recommendations
   */
  static async getSimilarProducts(productId, limit = 6) {
    try {
      const product = await Product.findById(productId);
      if (!product) return [];

      // Find similar products
      const similar = await Product.find({
        category: product.category,
        _id: { $ne: productId },
        isAvailable: true,
        status: "approved",
        // Similar price range (50% lower to 50% higher)
        price: { $gte: product.price * 0.5, $lte: product.price * 1.5 },
      })
        .populate("businessId", "name location")
        .sort({ "rating.average": -1, "stats.views": -1 })
        .limit(limit);

      return similar;
    } catch (error) {
      console.error("Similar products error:", error);
      return [];
    }
  }

  /**
   * Get "Suggested for You" based on all buyer activity
   */
  static async getSuggestedForYou(buyerId, limit = 10) {
    try {
      const buyer = await Buyer.findById(buyerId).populate("recentlyViewed.product", "category tags");
      if (!buyer) return [];

      // Extract tags and categories from recently viewed
      const tags = new Set();
      const categories = new Set();

      buyer.recentlyViewed.forEach((item) => {
        if (item.product) {
          categories.add(item.product.category);
          if (item.product.tags) {
            item.product.tags.forEach((tag) => tags.add(tag));
          }
        }
      });

      // Find products matching tags or categories
      const query = {
        isAvailable: true,
        status: "approved",
        _id: { $nin: buyer.recentlyViewed.map((i) => i.product?._id).filter(Boolean) },
      };

      if (tags.size > 0 || categories.size > 0) {
        query.$or = [];
        if (tags.size > 0) {
          query.$or.push({ tags: { $in: Array.from(tags) } });
        }
        if (categories.size > 0) {
          query.$or.push({ category: { $in: Array.from(categories) } });
        }
      }

      const suggested = await Product.find(query)
        .populate("businessId", "name location")
        .sort({ createdAt: -1, "stats.views": -1 })
        .limit(limit);

      return suggested;
    } catch (error) {
      console.error("Suggested products error:", error);
      return [];
    }
  }

  /**
   * Find buyers interested in a category (for notifications)
   */
  static async findInterestedBuyers(category, excludeBuyerId = null) {
    try {
      const query = {
        "interestedCategories.category": category.toLowerCase(),
        "notifications.push": true,
        "notifications.newProducts": true,
        isActive: true,
      };

      if (excludeBuyerId) {
        query._id = { $ne: excludeBuyerId };
      }

      const buyers = await Buyer.find(query).select("_id name deviceTokens notifications");

      // Filter to buyers with high enough interest score
      return buyers.filter((buyer) => {
        const interest = buyer.interestedCategories?.find(
          (i) => i.category === category.toLowerCase()
        );
        return interest && interest.score >= 2;
      });
    } catch (error) {
      console.error("Find interested buyers error:", error);
      return [];
    }
  }

  /**
   * Track buyer activity for learning
   */
  static async trackActivity(buyerId, productId, action = "view") {
    try {
      const buyer = await Buyer.findById(buyerId);
      const product = await Product.findById(productId);

      if (!buyer || !product) return;

      // Track category interest
      await buyer.trackCategoryInterest(product.category, action);

      // Track price preferences
      await buyer.updatePricePreferences(product.price);

      // Add to recently viewed if action is view
      if (action === "view") {
        await buyer.addToRecentlyViewed(productId);
      }

      return true;
    } catch (error) {
      console.error("Track activity error:", error);
      return false;
    }
  }
}

module.exports = RecommendationService;
