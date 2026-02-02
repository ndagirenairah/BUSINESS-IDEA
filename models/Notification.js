const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    // Who receives the notification
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "recipientType",
    },
    recipientType: {
      type: String,
      enum: ["Buyer", "User", "Business", "Admin"],
      required: true,
    },
    // Notification details
    type: {
      type: String,
      enum: [
        "new_message",
        "order_update",
        "new_order",
        "price_drop",
        "back_in_stock",
        "new_review",
        "review_reply",
        "account",
        "promotion",
        "system",
        "new_product",      // When seller posts new product
        "new_inquiry",      // When buyer shows interest
        "followed_seller",  // When followed seller posts
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    // Optional link/action
    actionUrl: {
      type: String,
      default: "",
    },
    actionType: {
      type: String,
      enum: ["product", "order", "chat", "profile", "external", "none"],
      default: "none",
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    // Status
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    // For push notifications
    pushSent: {
      type: Boolean,
      default: false,
    },
    pushSentAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

// Static method to create notification
notificationSchema.statics.notify = async function (data) {
  const notification = await this.create(data);
  // Here you could add push notification logic (Firebase, Expo, etc.)
  return notification;
};

// Mark as read
notificationSchema.methods.markAsRead = async function () {
  this.isRead = true;
  this.readAt = new Date();
  await this.save();
};

module.exports = mongoose.model("Notification", notificationSchema);
