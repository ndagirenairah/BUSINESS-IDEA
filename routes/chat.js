const express = require("express");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Notification = require("../models/Notification");
const { protect, protectBuyer, optionalBuyerAuth } = require("../middleware/auth");

const router = express.Router();

// @route   POST /api/chat/start
// @desc    Start a new conversation (customer/buyer with business)
// @access  Public (optional buyer auth)
router.post("/start", optionalBuyerAuth, async (req, res) => {
  try {
    const { businessId, productId, customerName, customerPhone, customerEmail, initialMessage } = req.body;

    // Check if conversation already exists
    let conversation;
    
    if (req.buyer) {
      // Check by buyer ID first
      conversation = await Conversation.findOne({
        businessId,
        buyerId: req.buyer._id,
      });
    }
    
    if (!conversation) {
      // Check by phone number
      conversation = await Conversation.findOne({
        businessId,
        customerPhone: req.buyer?.phone || customerPhone,
      });
    }

    if (!conversation) {
      // Create new conversation
      conversation = await Conversation.create({
        businessId,
        buyerId: req.buyer?._id,
        productId,
        customerName: req.buyer?.name || customerName,
        customerPhone: req.buyer?.phone || customerPhone,
        customerEmail: req.buyer?.email || customerEmail,
        lastMessage: initialMessage || "Started a conversation",
        unreadBusiness: 1,
      });
    } else {
      // Update conversation if linking to buyer account
      if (req.buyer && !conversation.buyerId) {
        conversation.buyerId = req.buyer._id;
        await conversation.save();
      }
    }

    // If there's an initial message, save it
    if (initialMessage) {
      await Message.create({
        conversationId: conversation._id,
        senderId: req.buyer?._id || conversation._id,
        senderName: req.buyer?.name || customerName,
        senderType: "customer",
        message: initialMessage,
      });

      // Notify business
      await Notification.notify({
        recipientId: businessId,
        recipientType: "Business",
        type: "new_message",
        title: "New Message! 💬",
        message: `${req.buyer?.name || customerName}: ${initialMessage.substring(0, 50)}...`,
        actionType: "chat",
        referenceId: conversation._id,
      });
    }

    res.status(201).json({
      message: "Conversation started! 💬",
      conversation,
    });
  } catch (error) {
    res.status(500).json({ message: "Error starting conversation", error: error.message });
  }
});

// @route   GET /api/chat/conversations
// @desc    Get all conversations for a business
// @access  Private
router.get("/conversations", protect, async (req, res) => {
  try {
    const conversations = await Conversation.find({ businessId: req.user.businessId })
      .populate("productId", "name image price")
      .sort({ lastMessageAt: -1 });

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: "Error fetching conversations", error: error.message });
  }
});

// @route   GET /api/chat/messages/:conversationId
// @desc    Get all messages in a conversation
// @access  Public (can be accessed by customer too)
router.get("/messages/:conversationId", async (req, res) => {
  try {
    const messages = await Message.find({ conversationId: req.params.conversationId })
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: "Error fetching messages", error: error.message });
  }
});

// @route   POST /api/chat/message
// @desc    Send a message
// @access  Public
router.post("/message", async (req, res) => {
  try {
    const { conversationId, senderId, senderName, senderType, message } = req.body;

    const newMessage = await Message.create({
      conversationId,
      senderId,
      senderName,
      senderType,
      message,
    });

    // Update conversation with unread counts
    const conversation = await Conversation.findById(conversationId);
    const updateData = {
      lastMessage: message,
      lastMessageAt: new Date(),
    };
    
    if (senderType === "customer") {
      updateData.unreadBusiness = (conversation.unreadBusiness || 0) + 1;
    } else {
      updateData.unreadCustomer = (conversation.unreadCustomer || 0) + 1;
    }
    
    await Conversation.findByIdAndUpdate(conversationId, updateData);

    res.status(201).json({
      message: "Message sent! ✅",
      data: newMessage,
    });
  } catch (error) {
    res.status(500).json({ message: "Error sending message", error: error.message });
  }
});

// @route   PUT /api/chat/read/:conversationId
// @desc    Mark messages as read (seller)
// @access  Private
router.put("/read/:conversationId", protect, async (req, res) => {
  try {
    await Message.updateMany(
      { conversationId: req.params.conversationId, isRead: false, senderType: "customer" },
      { isRead: true }
    );

    await Conversation.findByIdAndUpdate(req.params.conversationId, { unreadBusiness: 0 });

    res.json({ message: "Messages marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error updating messages", error: error.message });
  }
});

// @route   GET /api/chat/buyer/conversations
// @desc    Get all conversations for a buyer
// @access  Private (Buyer)
router.get("/buyer/conversations", protectBuyer, async (req, res) => {
  try {
    const conversations = await Conversation.find({ 
      buyerId: req.buyer._id,
      archivedByCustomer: false,
    })
      .populate("businessId", "name logo")
      .populate("productId", "name image price")
      .sort({ lastMessageAt: -1 });

    res.json(conversations);
  } catch (error) {
    res.status(500).json({ message: "Error fetching conversations", error: error.message });
  }
});

// @route   PUT /api/chat/buyer/read/:conversationId
// @desc    Mark messages as read (buyer)
// @access  Private (Buyer)
router.put("/buyer/read/:conversationId", protectBuyer, async (req, res) => {
  try {
    await Message.updateMany(
      { conversationId: req.params.conversationId, isRead: false, senderType: "business" },
      { isRead: true }
    );

    await Conversation.findByIdAndUpdate(req.params.conversationId, { unreadCustomer: 0 });

    res.json({ message: "Messages marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error updating messages", error: error.message });
  }
});

module.exports = router;
