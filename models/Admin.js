const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const adminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
    },
    role: {
      type: String,
      enum: ["super_admin", "moderator", "support"],
      default: "moderator",
    },
    permissions: {
      manageUsers: { type: Boolean, default: false },
      manageSellers: { type: Boolean, default: false },
      manageProducts: { type: Boolean, default: true },
      viewAnalytics: { type: Boolean, default: true },
      sendNotifications: { type: Boolean, default: false },
      manageAdmins: { type: Boolean, default: false },
    },
    avatar: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    // Activity log
    activityLog: [
      {
        action: String,
        target: String,
        targetId: mongoose.Schema.Types.ObjectId,
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Hash password before saving
adminSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
adminSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Log activity
adminSchema.methods.logActivity = async function (action, target, targetId) {
  this.activityLog.push({ action, target, targetId, timestamp: new Date() });
  // Keep only last 100 activities
  if (this.activityLog.length > 100) {
    this.activityLog = this.activityLog.slice(-100);
  }
  await this.save();
};

// Set super admin permissions
adminSchema.methods.setSuperAdmin = function () {
  this.role = "super_admin";
  this.permissions = {
    manageUsers: true,
    manageSellers: true,
    manageProducts: true,
    viewAnalytics: true,
    sendNotifications: true,
    manageAdmins: true,
  };
};

module.exports = mongoose.model("Admin", adminSchema);
