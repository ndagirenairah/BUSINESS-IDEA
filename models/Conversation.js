const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    businessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      required: true,
    },
    // Can be linked to a registered buyer
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Buyer",
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    // For guest users or display name
    customerName: {
      type: String,
      required: true,
    },
    customerPhone: {
      type: String,
      required: true,
    },
    customerEmail: {
      type: String,
      default: "",
    },
    lastMessage: {
      type: String,
      default: "",
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    // Unread count for each party
    unreadBusiness: {
      type: Number,
      default: 0,
    },
    unreadCustomer: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Archive status
    archivedByBusiness: {
      type: Boolean,
      default: false,
    },
    archivedByCustomer: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Index for efficient queries
conversationSchema.index({ businessId: 1, lastMessageAt: -1 });
conversationSchema.index({ buyerId: 1, lastMessageAt: -1 });
conversationSchema.index({ customerPhone: 1, businessId: 1 });

module.exports = mongoose.model("Conversation", conversationSchema);
