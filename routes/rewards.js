const express = require("express");
const router = express.Router();
const Reward = require("../models/Reward");
const RewardsService = require("../services/rewardsService");
const { protect, protectBuyer, protectAdmin } = require("../middleware/auth");

// ============================================
// BUYER REWARDS ROUTES
// ============================================

/**
 * @route   GET /api/rewards/my-rewards
 * @desc    Get buyer's rewards summary
 * @access  Private (Buyer)
 */
router.get("/my-rewards", protectBuyer, async (req, res) => {
  try {
    const reward = await Reward.getOrCreate(req.buyer._id, "Buyer");

    // Level benefits
    const levelBenefits = {
      bronze: { discount: 0, freeShipping: false, prioritySupport: false },
      silver: { discount: 2, freeShipping: false, prioritySupport: false },
      gold: { discount: 5, freeShipping: true, prioritySupport: false },
      platinum: { discount: 8, freeShipping: true, prioritySupport: true },
      diamond: { discount: 12, freeShipping: true, prioritySupport: true },
    };

    res.json({
      success: true,
      rewards: {
        points: reward.points,
        level: {
          ...reward.level,
          benefits: levelBenefits[reward.level.current],
        },
        badges: reward.badges,
        referralCode: reward.referral.code,
        referredCount: reward.referral.referredUsers.length,
        stats: reward.stats,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/rewards/history
 * @desc    Get points history
 * @access  Private (Buyer)
 */
router.get("/history", protectBuyer, async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;

    const reward = await Reward.findOne({
      userId: req.buyer._id,
      userType: "Buyer",
    });

    if (!reward) {
      return res.json({ success: true, history: [], total: 0 });
    }

    let history = reward.history;
    if (type) {
      history = history.filter((h) => h.type === type);
    }

    // Sort by timestamp descending
    history.sort((a, b) => b.timestamp - a.timestamp);

    // Paginate
    const start = (page - 1) * limit;
    const paginatedHistory = history.slice(start, start + Number(limit));

    res.json({
      success: true,
      count: paginatedHistory.length,
      total: history.length,
      pages: Math.ceil(history.length / limit),
      history: paginatedHistory,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/rewards/daily-bonus
 * @desc    Claim daily login bonus
 * @access  Private (Buyer)
 */
router.post("/daily-bonus", protectBuyer, async (req, res) => {
  try {
    const result = await RewardsService.awardDailyLogin(
      req.buyer._id,
      "Buyer"
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: `+${result.points} points! ${result.streak} day streak 🔥`,
      ...result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/rewards/redeem
 * @desc    Redeem points for discount
 * @access  Private (Buyer)
 */
router.post("/redeem", protectBuyer, async (req, res) => {
  try {
    const { points } = req.body;

    if (!points || points < 100) {
      return res.status(400).json({
        success: false,
        message: "Minimum 100 points required for redemption",
      });
    }

    const result = await RewardsService.redeemForDiscount(
      req.buyer._id,
      "Buyer",
      points
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      message: `Redeemed ${result.pointsRedeemed} points for ${result.discountValue.toLocaleString()} UGX discount!`,
      discountCode: `REWARD-${Date.now().toString(36).toUpperCase()}`,
      discountValue: result.discountValue,
      newBalance: result.newBalance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/rewards/leaderboard
 * @desc    Get buyer leaderboard
 * @access  Public
 */
router.get("/leaderboard", async (req, res) => {
  try {
    const { type = "Buyer", limit = 10 } = req.query;

    const leaderboard = await RewardsService.getLeaderboard(type, Number(limit));

    res.json({
      success: true,
      leaderboard,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/rewards/referral/validate
 * @desc    Validate a referral code
 * @access  Public
 */
router.post("/referral/validate", async (req, res) => {
  try {
    const { code } = req.body;

    const referrer = await Reward.findOne({
      "referral.code": code.toUpperCase(),
    }).populate("userId", "firstName lastName businessName");

    if (!referrer) {
      return res.status(400).json({
        success: false,
        message: "Invalid referral code",
      });
    }

    res.json({
      success: true,
      message: "Valid referral code!",
      referredBy:
        referrer.userId.firstName ||
        referrer.userId.businessName ||
        "A friend",
      bonus: "50 points welcome bonus",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/rewards/badges
 * @desc    Get available badges
 * @access  Public
 */
router.get("/badges", (req, res) => {
  const allBadges = Object.values(RewardsService.BADGES).map((badge) => ({
    id: badge.id,
    name: badge.name,
    description: badge.description,
    icon: badge.icon,
  }));

  res.json({
    success: true,
    badges: allBadges,
  });
});

// ============================================
// SELLER REWARDS ROUTES
// ============================================

/**
 * @route   GET /api/rewards/seller
 * @desc    Get seller's rewards
 * @access  Private (Seller)
 */
router.get("/seller", protect, async (req, res) => {
  try {
    const reward = await Reward.getOrCreate(req.user._id, "User");

    res.json({
      success: true,
      rewards: {
        points: reward.points,
        level: reward.level,
        badges: reward.badges,
        referralCode: reward.referral.code,
        referredCount: reward.referral.referredUsers.length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// ADMIN REWARDS ROUTES
// ============================================

/**
 * @route   GET /api/rewards/admin/overview
 * @desc    Get rewards system overview
 * @access  Private (Admin)
 */
router.get("/admin/overview", protectAdmin, async (req, res) => {
  try {
    const [
      totalRewardAccounts,
      totalPointsIssued,
      totalPointsRedeemed,
      levelDistribution,
      topEarners,
    ] = await Promise.all([
      Reward.countDocuments({}),
      Reward.aggregate([
        { $group: { _id: null, total: { $sum: "$points.total" } } },
      ]),
      Reward.aggregate([
        { $group: { _id: null, total: { $sum: "$points.redeemed" } } },
      ]),
      Reward.aggregate([
        { $group: { _id: "$level.current", count: { $sum: 1 } } },
      ]),
      Reward.find({})
        .sort({ "points.total": -1 })
        .limit(5)
        .populate("userId", "firstName lastName email businessName"),
    ]);

    res.json({
      success: true,
      overview: {
        totalRewardAccounts,
        totalPointsIssued: totalPointsIssued[0]?.total || 0,
        totalPointsRedeemed: totalPointsRedeemed[0]?.total || 0,
        levelDistribution: levelDistribution.reduce((acc, l) => {
          acc[l._id] = l.count;
          return acc;
        }, {}),
        topEarners: topEarners.map((r) => ({
          user: r.userId,
          points: r.points.total,
          level: r.level.current,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/rewards/admin/bonus
 * @desc    Award bonus points (admin)
 * @access  Private (Admin)
 */
router.post("/admin/bonus", protectAdmin, async (req, res) => {
  try {
    const { userId, userType, points, reason } = req.body;

    const reward = await Reward.getOrCreate(userId, userType);

    await reward.earnPoints(
      points,
      "bonus",
      reason || "Admin bonus",
      null,
      null
    );

    res.json({
      success: true,
      message: `Awarded ${points} bonus points`,
      newBalance: reward.points.available,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
