const express = require("express");
const Notification = require("../models/Notification");
const { protect, protectBuyer } = require("../middleware/auth");

const router = express.Router();

// @route   GET /api/notifications
// @desc    Get notifications for current user (seller)
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    
    let query = {
      recipientId: req.user.businessId,
      recipientType: "Business",
    };

    if (unreadOnly === "true") {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      ...query,
      isRead: false,
    });

    res.json({
      notifications,
      unreadCount,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching notifications", error: error.message });
  }
});

// @route   GET /api/notifications/buyer
// @desc    Get notifications for buyer
// @access  Private (Buyer)
router.get("/buyer", protectBuyer, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    
    let query = {
      recipientId: req.buyer._id,
      recipientType: "Buyer",
    };

    if (unreadOnly === "true") {
      query.isRead = false;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);
    const unreadCount = await Notification.countDocuments({
      ...query,
      isRead: false,
    });

    res.json({
      notifications,
      unreadCount,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching notifications", error: error.message });
  }
});

// @route   PUT /api/notifications/:id/read
// @desc    Mark notification as read
// @access  Private
router.put("/:id/read", async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    await notification.markAsRead();

    res.json({ message: "Marked as read", notification });
  } catch (error) {
    res.status(500).json({ message: "Error updating notification", error: error.message });
  }
});

// @route   PUT /api/notifications/read-all
// @desc    Mark all notifications as read (seller)
// @access  Private
router.put("/read-all", protect, async (req, res) => {
  try {
    await Notification.updateMany(
      {
        recipientId: req.user.businessId,
        recipientType: "Business",
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error updating notifications", error: error.message });
  }
});

// @route   PUT /api/notifications/buyer/read-all
// @desc    Mark all notifications as read (buyer)
// @access  Private (Buyer)
router.put("/buyer/read-all", protectBuyer, async (req, res) => {
  try {
    await Notification.updateMany(
      {
        recipientId: req.buyer._id,
        recipientType: "Buyer",
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error updating notifications", error: error.message });
  }
});

// @route   DELETE /api/notifications/:id
// @desc    Delete a notification
// @access  Private
router.delete("/:id", async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: "Notification deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting notification", error: error.message });
  }
});

module.exports = router;
