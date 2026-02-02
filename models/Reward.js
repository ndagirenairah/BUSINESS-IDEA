const mongoose = require("mongoose");

/**
 * Rewards/Gamification Model
 * Points system for buyers and sellers
 */
const rewardSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "userType",
    },
    userType: {
      type: String,
      enum: ["Buyer", "User"], // User = Seller
      required: true,
    },

    // Points balance
    points: {
      total: { type: Number, default: 0 },       // All-time earned
      available: { type: Number, default: 0 },   // Current balance
      redeemed: { type: Number, default: 0 },    // Total redeemed
      expired: { type: Number, default: 0 },     // Total expired
    },

    // Level/Tier
    level: {
      current: {
        type: String,
        enum: ["bronze", "silver", "gold", "platinum", "diamond"],
        default: "bronze",
      },
      progress: { type: Number, default: 0 }, // Progress to next level (0-100)
    },

    // Badges earned
    badges: [
      {
        badgeId: String,
        name: String,
        description: String,
        icon: String,
        earnedAt: { type: Date, default: Date.now },
      },
    ],

    // Points history
    history: [
      {
        type: {
          type: String,
          enum: [
            "earned",
            "redeemed",
            "expired",
            "bonus",
            "referral",
            "adjustment",
          ],
        },
        action: String,          // e.g., "purchase", "review", "referral"
        points: Number,          // Positive for earned, negative for redeemed
        description: String,
        referenceType: String,   // "Order", "Review", "Referral"
        referenceId: mongoose.Schema.Types.ObjectId,
        timestamp: { type: Date, default: Date.now },
        expiresAt: Date,
      },
    ],

    // Referral tracking
    referral: {
      code: { type: String, unique: true, sparse: true },
      referredBy: { type: mongoose.Schema.Types.ObjectId },
      referredUsers: [{ type: mongoose.Schema.Types.ObjectId }],
      totalReferralPoints: { type: Number, default: 0 },
    },

    // Stats
    stats: {
      totalPurchases: { type: Number, default: 0 },
      totalSpent: { type: Number, default: 0 },
      totalReviews: { type: Number, default: 0 },
      consecutiveDays: { type: Number, default: 0 },
      lastActiveDate: { type: Date },
    },
  },
  { timestamps: true }
);

// Indexes
rewardSchema.index({ userId: 1, userType: 1 }, { unique: true });
rewardSchema.index({ "referral.code": 1 });
rewardSchema.index({ "level.current": 1 });

// Generate referral code
rewardSchema.pre("save", function (next) {
  if (!this.referral.code) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.referral.code = code;
  }
  next();
});

// Level thresholds
const LEVEL_THRESHOLDS = {
  bronze: 0,
  silver: 500,
  gold: 2000,
  platinum: 5000,
  diamond: 10000,
};

// Calculate level from total points
rewardSchema.methods.calculateLevel = function () {
  const total = this.points.total;

  if (total >= LEVEL_THRESHOLDS.diamond) {
    this.level.current = "diamond";
    this.level.progress = 100;
  } else if (total >= LEVEL_THRESHOLDS.platinum) {
    this.level.current = "platinum";
    this.level.progress = Math.round(
      ((total - LEVEL_THRESHOLDS.platinum) /
        (LEVEL_THRESHOLDS.diamond - LEVEL_THRESHOLDS.platinum)) *
        100
    );
  } else if (total >= LEVEL_THRESHOLDS.gold) {
    this.level.current = "gold";
    this.level.progress = Math.round(
      ((total - LEVEL_THRESHOLDS.gold) /
        (LEVEL_THRESHOLDS.platinum - LEVEL_THRESHOLDS.gold)) *
        100
    );
  } else if (total >= LEVEL_THRESHOLDS.silver) {
    this.level.current = "silver";
    this.level.progress = Math.round(
      ((total - LEVEL_THRESHOLDS.silver) /
        (LEVEL_THRESHOLDS.gold - LEVEL_THRESHOLDS.silver)) *
        100
    );
  } else {
    this.level.current = "bronze";
    this.level.progress = Math.round(
      (total / LEVEL_THRESHOLDS.silver) * 100
    );
  }
};

// Earn points
rewardSchema.methods.earnPoints = async function (
  points,
  action,
  description,
  referenceType = null,
  referenceId = null
) {
  this.points.total += points;
  this.points.available += points;

  this.history.push({
    type: "earned",
    action,
    points,
    description,
    referenceType,
    referenceId,
    timestamp: new Date(),
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
  });

  this.calculateLevel();
  await this.save();

  return {
    earned: points,
    newBalance: this.points.available,
    level: this.level.current,
  };
};

// Redeem points
rewardSchema.methods.redeemPoints = async function (points, description) {
  if (points > this.points.available) {
    throw new Error("Insufficient points");
  }

  this.points.available -= points;
  this.points.redeemed += points;

  this.history.push({
    type: "redeemed",
    action: "redeem",
    points: -points,
    description,
    timestamp: new Date(),
  });

  await this.save();

  return {
    redeemed: points,
    newBalance: this.points.available,
  };
};

// Add badge
rewardSchema.methods.addBadge = async function (badgeId, name, description, icon) {
  // Check if already has badge
  if (this.badges.some((b) => b.badgeId === badgeId)) {
    return false;
  }

  this.badges.push({
    badgeId,
    name,
    description,
    icon,
    earnedAt: new Date(),
  });

  await this.save();
  return true;
};

// Static: Get or create reward account
rewardSchema.statics.getOrCreate = async function (userId, userType) {
  let reward = await this.findOne({ userId, userType });

  if (!reward) {
    reward = await this.create({ userId, userType });
  }

  return reward;
};

module.exports = mongoose.model("Reward", rewardSchema);
