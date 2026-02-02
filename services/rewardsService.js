/**
 * Rewards/Gamification Service
 * Handles points earning, redemption, and badges
 */

const Reward = require("../models/Reward");
const Notification = require("../models/Notification");

class RewardsService {
  // Points configuration
  static POINTS = {
    // Buyer actions
    PURCHASE: 10,              // Per 1000 UGX spent
    FIRST_PURCHASE: 100,       // First time buyer bonus
    REVIEW: 50,                // Writing a review
    REVIEW_WITH_PHOTO: 75,     // Review with photos
    DAILY_LOGIN: 5,            // Daily login bonus
    REFERRAL_SIGNUP: 200,      // Someone signs up with your code
    REFERRAL_PURCHASE: 100,    // Referred user makes first purchase
    WISHLIST_PURCHASE: 25,     // Buying from wishlist
    COMPLETE_PROFILE: 50,      // Completing profile

    // Seller actions
    FIRST_SALE: 100,           // First sale bonus
    SALE: 5,                   // Per 1000 UGX sold
    FIVE_STAR_REVIEW: 30,      // Receiving 5-star review
    FAST_SHIPPING: 20,         // Shipping within 24 hours
    PRODUCT_LISTING: 10,       // Listing a new product
  };

  // Badge definitions
  static BADGES = {
    // Buyer badges
    FIRST_PURCHASE: {
      id: "first_purchase",
      name: "First Purchase",
      description: "Made your first purchase",
      icon: "🛒",
    },
    LOYAL_CUSTOMER: {
      id: "loyal_customer",
      name: "Loyal Customer",
      description: "Made 10+ purchases",
      icon: "💎",
    },
    SUPER_REVIEWER: {
      id: "super_reviewer",
      name: "Super Reviewer",
      description: "Written 10+ reviews",
      icon: "⭐",
    },
    BIG_SPENDER: {
      id: "big_spender",
      name: "Big Spender",
      description: "Spent over 1,000,000 UGX",
      icon: "💰",
    },
    REFERRAL_MASTER: {
      id: "referral_master",
      name: "Referral Master",
      description: "Referred 5+ friends",
      icon: "🤝",
    },

    // Seller badges
    TOP_SELLER: {
      id: "top_seller",
      name: "Top Seller",
      description: "Completed 50+ orders",
      icon: "🏆",
    },
    FAST_SHIPPER: {
      id: "fast_shipper",
      name: "Fast Shipper",
      description: "Ships within 24 hours consistently",
      icon: "🚀",
    },
    FIVE_STAR_SELLER: {
      id: "five_star_seller",
      name: "Five Star Seller",
      description: "Maintained 4.8+ rating with 20+ reviews",
      icon: "🌟",
    },
  };

  /**
   * Award points to a buyer for purchase
   */
  static async awardPurchasePoints(buyerId, orderTotal, isFirstPurchase = false) {
    try {
      const reward = await Reward.getOrCreate(buyerId, "Buyer");

      // Calculate points (10 points per 1000 UGX)
      const purchasePoints = Math.floor(orderTotal / 1000) * this.POINTS.PURCHASE;
      let totalPoints = purchasePoints;
      let description = `Earned ${purchasePoints} points for purchase`;

      // First purchase bonus
      if (isFirstPurchase) {
        totalPoints += this.POINTS.FIRST_PURCHASE;
        description += ` + ${this.POINTS.FIRST_PURCHASE} first purchase bonus!`;

        // Award first purchase badge
        await reward.addBadge(
          this.BADGES.FIRST_PURCHASE.id,
          this.BADGES.FIRST_PURCHASE.name,
          this.BADGES.FIRST_PURCHASE.description,
          this.BADGES.FIRST_PURCHASE.icon
        );
      }

      // Update stats
      reward.stats.totalPurchases += 1;
      reward.stats.totalSpent += orderTotal;

      // Earn points
      const result = await reward.earnPoints(
        totalPoints,
        "purchase",
        description,
        "Order",
        null
      );

      // Check for badges
      await this.checkBuyerBadges(reward);

      // Notify buyer
      await Notification.notify({
        recipientId: buyerId,
        recipientType: "Buyer",
        type: "points_earned",
        title: `+${totalPoints} Points Earned! 🎉`,
        message: description,
        actionType: "rewards",
      });

      return result;
    } catch (error) {
      console.error("Award purchase points error:", error);
      return null;
    }
  }

  /**
   * Award points for writing a review
   */
  static async awardReviewPoints(buyerId, hasPhotos = false) {
    try {
      const reward = await Reward.getOrCreate(buyerId, "Buyer");

      const points = hasPhotos
        ? this.POINTS.REVIEW_WITH_PHOTO
        : this.POINTS.REVIEW;

      reward.stats.totalReviews += 1;

      const result = await reward.earnPoints(
        points,
        "review",
        `Earned ${points} points for writing a review`,
        "Review",
        null
      );

      // Check for super reviewer badge
      if (reward.stats.totalReviews >= 10) {
        await reward.addBadge(
          this.BADGES.SUPER_REVIEWER.id,
          this.BADGES.SUPER_REVIEWER.name,
          this.BADGES.SUPER_REVIEWER.description,
          this.BADGES.SUPER_REVIEWER.icon
        );
      }

      return result;
    } catch (error) {
      console.error("Award review points error:", error);
      return null;
    }
  }

  /**
   * Process referral
   */
  static async processReferral(referralCode, newUserId, newUserType) {
    try {
      // Find referrer by code
      const referrerReward = await Reward.findOne({
        "referral.code": referralCode,
      });

      if (!referrerReward) {
        return { success: false, message: "Invalid referral code" };
      }

      // Update referrer
      referrerReward.referral.referredUsers.push(newUserId);

      await referrerReward.earnPoints(
        this.POINTS.REFERRAL_SIGNUP,
        "referral",
        "Earned points for referring a new user",
        newUserType,
        newUserId
      );

      referrerReward.referral.totalReferralPoints += this.POINTS.REFERRAL_SIGNUP;

      // Check for referral master badge
      if (referrerReward.referral.referredUsers.length >= 5) {
        await referrerReward.addBadge(
          this.BADGES.REFERRAL_MASTER.id,
          this.BADGES.REFERRAL_MASTER.name,
          this.BADGES.REFERRAL_MASTER.description,
          this.BADGES.REFERRAL_MASTER.icon
        );
      }

      await referrerReward.save();

      // Update new user's reward account
      const newUserReward = await Reward.getOrCreate(newUserId, newUserType);
      newUserReward.referral.referredBy = referrerReward.userId;

      // Give bonus to new user too
      await newUserReward.earnPoints(
        50,
        "referral_bonus",
        "Welcome bonus for using a referral code",
        null,
        null
      );

      // Notify referrer
      await Notification.notify({
        recipientId: referrerReward.userId,
        recipientType: referrerReward.userType,
        type: "referral_success",
        title: "Referral Bonus! 🎁",
        message: `Someone joined using your code! +${this.POINTS.REFERRAL_SIGNUP} points`,
        actionType: "rewards",
      });

      return { success: true, referrerReward, newUserReward };
    } catch (error) {
      console.error("Process referral error:", error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Award daily login bonus
   */
  static async awardDailyLogin(userId, userType) {
    try {
      const reward = await Reward.getOrCreate(userId, userType);

      const today = new Date().toDateString();
      const lastActive = reward.stats.lastActiveDate?.toDateString();

      if (lastActive === today) {
        return { success: false, message: "Already claimed today" };
      }

      // Check for consecutive days
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();
      if (lastActive === yesterday) {
        reward.stats.consecutiveDays += 1;
      } else {
        reward.stats.consecutiveDays = 1;
      }

      reward.stats.lastActiveDate = new Date();

      // Bonus for consecutive days
      let bonusPoints = this.POINTS.DAILY_LOGIN;
      if (reward.stats.consecutiveDays >= 7) {
        bonusPoints += 10; // Week streak bonus
      }
      if (reward.stats.consecutiveDays >= 30) {
        bonusPoints += 25; // Month streak bonus
      }

      await reward.earnPoints(
        bonusPoints,
        "daily_login",
        `Daily login bonus (${reward.stats.consecutiveDays} day streak)`,
        null,
        null
      );

      return {
        success: true,
        points: bonusPoints,
        streak: reward.stats.consecutiveDays,
        newBalance: reward.points.available,
      };
    } catch (error) {
      console.error("Daily login error:", error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Award seller points for sale
   */
  static async awardSalePoints(sellerId, orderTotal, isFirstSale = false) {
    try {
      const reward = await Reward.getOrCreate(sellerId, "User");

      const salePoints = Math.floor(orderTotal / 1000) * this.POINTS.SALE;
      let totalPoints = salePoints;

      if (isFirstSale) {
        totalPoints += this.POINTS.FIRST_SALE;
      }

      await reward.earnPoints(
        totalPoints,
        "sale",
        `Earned ${totalPoints} points for sale`,
        "Order",
        null
      );

      return { success: true, points: totalPoints };
    } catch (error) {
      console.error("Award sale points error:", error);
      return null;
    }
  }

  /**
   * Redeem points for discount
   */
  static async redeemForDiscount(userId, userType, points) {
    try {
      const reward = await Reward.getOrCreate(userId, userType);

      // 100 points = 1000 UGX discount
      const discountValue = Math.floor(points / 100) * 1000;

      await reward.redeemPoints(
        points,
        `Redeemed for ${discountValue} UGX discount`
      );

      return {
        success: true,
        pointsRedeemed: points,
        discountValue,
        newBalance: reward.points.available,
      };
    } catch (error) {
      console.error("Redeem points error:", error);
      return { success: false, message: error.message };
    }
  }

  /**
   * Check and award buyer badges
   */
  static async checkBuyerBadges(reward) {
    // Loyal customer (10+ purchases)
    if (reward.stats.totalPurchases >= 10) {
      await reward.addBadge(
        this.BADGES.LOYAL_CUSTOMER.id,
        this.BADGES.LOYAL_CUSTOMER.name,
        this.BADGES.LOYAL_CUSTOMER.description,
        this.BADGES.LOYAL_CUSTOMER.icon
      );
    }

    // Big spender (1M+ UGX)
    if (reward.stats.totalSpent >= 1000000) {
      await reward.addBadge(
        this.BADGES.BIG_SPENDER.id,
        this.BADGES.BIG_SPENDER.name,
        this.BADGES.BIG_SPENDER.description,
        this.BADGES.BIG_SPENDER.icon
      );
    }
  }

  /**
   * Get leaderboard
   */
  static async getLeaderboard(userType = "Buyer", limit = 10) {
    try {
      const leaderboard = await Reward.find({ userType })
        .sort({ "points.total": -1 })
        .limit(limit)
        .populate("userId", "firstName lastName fullName businessName name")
        .select("userId points.total level badges");

      return leaderboard.map((r, index) => ({
        rank: index + 1,
        user: r.userId,
        points: r.points.total,
        level: r.level.current,
        badges: r.badges.length,
      }));
    } catch (error) {
      console.error("Leaderboard error:", error);
      return [];
    }
  }
}

module.exports = RewardsService;
