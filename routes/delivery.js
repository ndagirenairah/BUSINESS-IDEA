const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const DeliveryZone = require("../models/DeliveryZone");
const Rider = require("../models/Rider");
const { protect, protectBuyer, protectAdmin } = require("../middleware/auth");

// ============================================
// DELIVERY OPTIONS (Buyer facing)
// ============================================

/**
 * @route   GET /api/delivery/options/:businessId
 * @desc    Get delivery options for a business
 * @access  Public
 */
router.get("/options/:businessId", async (req, res) => {
  try {
    const zones = await DeliveryZone.find({
      businessId: req.params.businessId,
      isActive: true,
    });

    // Compile available delivery methods
    const deliveryMethods = {
      safeboda: { available: false, fee: 0, description: "Fast delivery by SafeBoda" },
      faras: { available: false, fee: 0, description: "Delivery by Faras" },
      personal: { available: false, fee: 0, description: "Personal delivery by seller" },
      pickup: { available: false, fee: 0, description: "Pick up from seller" },
      shipping: { available: false, fee: 0, description: "Ship to your location" },
    };

    zones.forEach((zone) => {
      const options = zone.deliveryOptions;
      for (const [method, config] of Object.entries(options)) {
        if (config.enabled) {
          deliveryMethods[method] = {
            available: true,
            baseFee: config.baseFee || 0,
            perKmFee: config.perKmFee || 0,
            freeAbove: config.freeAbove || null,
            estimatedTime: zone.estimatedTime,
            pickupAddress: method === "pickup" ? config.address : null,
            pickupHours: method === "pickup" ? config.hours : null,
          };
        }
      }
    });

    res.json({
      success: true,
      deliveryMethods,
      zones,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/delivery/calculate-fee
 * @desc    Calculate delivery fee based on method, distance, and order total
 * @access  Public
 */
router.post("/calculate-fee", async (req, res) => {
  try {
    const { businessId, method, distance, orderTotal, buyerLocation } = req.body;

    const zone = await DeliveryZone.findOne({
      businessId,
      isActive: true,
    });

    if (!zone) {
      return res.status(404).json({
        success: false,
        message: "Delivery not available for this business",
      });
    }

    const result = zone.calculateDeliveryFee(method, distance, orderTotal);

    if (!result.available) {
      return res.status(400).json({
        success: false,
        message: `${method} delivery not available`,
      });
    }

    res.json({
      success: true,
      method,
      fee: result.fee,
      freeDelivery: result.freeDelivery || false,
      estimatedTime: zone.estimatedTime,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/delivery/select
 * @desc    Select delivery method for an order
 * @access  Private (Buyer)
 */
router.post("/select", protectBuyer, async (req, res) => {
  try {
    const { orderId, method, deliveryAddress, instructions, scheduledDate } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      buyer: req.buyer._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Update delivery details
    order.delivery.method = method;
    order.delivery.instructions = instructions || "";
    order.delivery.scheduledDate = scheduledDate;

    if (deliveryAddress && method !== "pickup") {
      order.shippingAddress = {
        ...order.shippingAddress,
        ...deliveryAddress,
      };
    }

    // Get delivery zone to calculate fee
    const zone = await DeliveryZone.findOne({
      businessId: order.businessId,
      isActive: true,
    });

    if (zone) {
      const feeResult = zone.calculateDeliveryFee(method, null, order.totalAmount);
      order.delivery.fee = feeResult.fee;
    }

    await order.save();

    res.json({
      success: true,
      message: "Delivery method selected",
      delivery: order.delivery,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// DELIVERY TRACKING (Buyer facing)
// ============================================

/**
 * @route   GET /api/delivery/track/:orderId
 * @desc    Get delivery tracking info
 * @access  Private (Buyer)
 */
router.get("/track/:orderId", protectBuyer, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.orderId,
      buyer: req.buyer._id,
    })
      .select("delivery orderNumber status shippingAddress")
      .populate("delivery.riderId", "name phone avatar vehicle currentLocation stats.averageRating");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.json({
      success: true,
      tracking: {
        orderNumber: order.orderNumber,
        orderStatus: order.status,
        delivery: order.delivery,
        destination: order.shippingAddress,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// SELLER DELIVERY MANAGEMENT
// ============================================

/**
 * @route   POST /api/delivery/zones
 * @desc    Create a delivery zone for seller
 * @access  Private (Seller)
 */
router.post("/zones", protect, async (req, res) => {
  try {
    const { name, type, radius, areas, deliveryOptions, estimatedTime, minimumOrder } = req.body;

    // Get seller's business
    const Business = require("../models/Business");
    const business = await Business.findOne({ owner: req.user._id });

    if (!business) {
      return res.status(400).json({
        success: false,
        message: "You need a business to set delivery zones",
      });
    }

    const zone = await DeliveryZone.create({
      businessId: business._id,
      name,
      type,
      radius,
      areas,
      deliveryOptions,
      estimatedTime,
      minimumOrder,
    });

    res.status(201).json({
      success: true,
      message: "Delivery zone created",
      zone,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/delivery/zones
 * @desc    Get seller's delivery zones
 * @access  Private (Seller)
 */
router.get("/zones", protect, async (req, res) => {
  try {
    const Business = require("../models/Business");
    const business = await Business.findOne({ owner: req.user._id });

    if (!business) {
      return res.json({ success: true, zones: [] });
    }

    const zones = await DeliveryZone.find({ businessId: business._id });

    res.json({
      success: true,
      zones,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   PUT /api/delivery/zones/:zoneId
 * @desc    Update a delivery zone
 * @access  Private (Seller)
 */
router.put("/zones/:zoneId", protect, async (req, res) => {
  try {
    const Business = require("../models/Business");
    const business = await Business.findOne({ owner: req.user._id });

    const zone = await DeliveryZone.findOneAndUpdate(
      {
        _id: req.params.zoneId,
        businessId: business._id,
      },
      req.body,
      { new: true, runValidators: true }
    );

    if (!zone) {
      return res.status(404).json({
        success: false,
        message: "Delivery zone not found",
      });
    }

    res.json({
      success: true,
      message: "Delivery zone updated",
      zone,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   DELETE /api/delivery/zones/:zoneId
 * @desc    Delete a delivery zone
 * @access  Private (Seller)
 */
router.delete("/zones/:zoneId", protect, async (req, res) => {
  try {
    const Business = require("../models/Business");
    const business = await Business.findOne({ owner: req.user._id });

    const zone = await DeliveryZone.findOneAndDelete({
      _id: req.params.zoneId,
      businessId: business._id,
    });

    if (!zone) {
      return res.status(404).json({
        success: false,
        message: "Delivery zone not found",
      });
    }

    res.json({
      success: true,
      message: "Delivery zone deleted",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/delivery/assign-rider
 * @desc    Assign a rider to an order
 * @access  Private (Seller)
 */
router.post("/assign-rider", protect, async (req, res) => {
  try {
    const { orderId, riderId, riderInfo } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      seller: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // If using platform rider
    if (riderId) {
      const rider = await Rider.findById(riderId);
      if (!rider) {
        return res.status(404).json({
          success: false,
          message: "Rider not found",
        });
      }

      order.delivery.riderId = riderId;
      order.delivery.rider = {
        name: rider.name,
        phone: rider.phone,
        vehicleType: rider.vehicle.type,
        vehiclePlate: rider.vehicle.plateNumber,
        photo: rider.avatar,
        rating: rider.stats.averageRating,
      };

      // Update rider status
      rider.status = "busy";
      rider.currentOrder = orderId;
      await rider.save();
    } else if (riderInfo) {
      // Manual rider assignment (SafeBoda, Faras, etc.)
      order.delivery.rider = riderInfo;
    }

    order.delivery.status = "assigned";
    order.delivery.assignedAt = new Date();
    order.addDeliveryUpdate("assigned", "Rider assigned to your order");

    await order.save();

    // TODO: Send notification to buyer
    // TODO: Send notification to rider

    res.json({
      success: true,
      message: "Rider assigned successfully",
      delivery: order.delivery,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   PUT /api/delivery/status/:orderId
 * @desc    Update delivery status
 * @access  Private (Seller/Rider)
 */
router.put("/status/:orderId", protect, async (req, res) => {
  try {
    const { status, note, location, proofImage } = req.body;

    const order = await Order.findOne({
      _id: req.params.orderId,
      seller: req.user._id,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Update delivery status
    order.delivery.status = status;

    if (status === "picked_up") {
      order.delivery.pickedUpAt = new Date();
    } else if (status === "delivered") {
      order.delivery.deliveredAt = new Date();
      order.delivery.proofOfDelivery = proofImage;
      order.status = "delivered";
    }

    if (location) {
      order.delivery.currentLocation = location;
    }

    order.addDeliveryUpdate(status, note || `Delivery ${status}`);

    await order.save();

    // TODO: Send push notification to buyer

    res.json({
      success: true,
      message: `Delivery status updated to ${status}`,
      delivery: order.delivery,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// RIDER ROUTES (For platforms with own riders)
// ============================================

/**
 * @route   POST /api/delivery/riders/register
 * @desc    Register as a rider
 * @access  Public
 */
router.post("/riders/register", async (req, res) => {
  try {
    const { name, email, phone, password, vehicle, serviceAreas } = req.body;

    // Check if rider exists
    const existingRider = await Rider.findOne({ phone });
    if (existingRider) {
      return res.status(400).json({
        success: false,
        message: "Phone number already registered",
      });
    }

    const rider = await Rider.create({
      name,
      email,
      phone,
      password,
      vehicle,
      serviceAreas,
    });

    res.status(201).json({
      success: true,
      message: "Rider registered successfully. Awaiting verification.",
      rider: {
        id: rider._id,
        name: rider.name,
        phone: rider.phone,
        isVerified: rider.isVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/delivery/riders/available
 * @desc    Get available riders in an area
 * @access  Private (Seller/Admin)
 */
router.get("/riders/available", protect, async (req, res) => {
  try {
    const { city, lat, lng, maxDistance = 10 } = req.query;

    let query = {
      status: "available",
      isActive: true,
      isVerified: true,
    };

    if (city) {
      query["serviceAreas.city"] = new RegExp(city, "i");
    }

    const riders = await Rider.find(query)
      .select("name phone avatar vehicle currentLocation stats.averageRating stats.completedDeliveries")
      .sort({ "stats.averageRating": -1 });

    res.json({
      success: true,
      count: riders.length,
      riders,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   PUT /api/delivery/riders/location
 * @desc    Update rider's current location
 * @access  Private (Rider - would need rider auth)
 */
router.put("/riders/location", async (req, res) => {
  try {
    const { riderId, lat, lng } = req.body;

    const rider = await Rider.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    await rider.updateLocation(lat, lng);

    res.json({
      success: true,
      message: "Location updated",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   PUT /api/delivery/riders/status
 * @desc    Update rider availability status
 * @access  Private (Rider)
 */
router.put("/riders/status", async (req, res) => {
  try {
    const { riderId, status } = req.body;

    const rider = await Rider.findByIdAndUpdate(
      riderId,
      { status },
      { new: true }
    );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    res.json({
      success: true,
      message: `Status updated to ${status}`,
      status: rider.status,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/delivery/riders/rate
 * @desc    Rate a rider after delivery
 * @access  Private (Buyer)
 */
router.post("/riders/rate", protectBuyer, async (req, res) => {
  try {
    const { orderId, rating, comment } = req.body;

    const order = await Order.findOne({
      _id: orderId,
      buyer: req.buyer._id,
      "delivery.status": "delivered",
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found or not delivered yet",
      });
    }

    if (!order.delivery.riderId) {
      return res.status(400).json({
        success: false,
        message: "This order had no platform rider to rate",
      });
    }

    const rider = await Rider.findById(order.delivery.riderId);
    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    await rider.addRating(orderId, req.buyer._id, rating, comment);

    res.json({
      success: true,
      message: "Thank you for rating the rider!",
      newRating: rider.stats.averageRating,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ============================================
// ADMIN DELIVERY MANAGEMENT
// ============================================

/**
 * @route   GET /api/delivery/admin/overview
 * @desc    Get delivery overview stats
 * @access  Private (Admin)
 */
router.get("/admin/overview", protectAdmin, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Delivery stats
    const [
      totalDeliveries,
      pendingDeliveries,
      inTransit,
      deliveredToday,
      failedDeliveries,
      activeRiders,
    ] = await Promise.all([
      Order.countDocuments({ "delivery.method": { $exists: true, $ne: null } }),
      Order.countDocuments({ "delivery.status": "pending" }),
      Order.countDocuments({ "delivery.status": "in_transit" }),
      Order.countDocuments({
        "delivery.status": "delivered",
        "delivery.deliveredAt": { $gte: today },
      }),
      Order.countDocuments({ "delivery.status": "failed" }),
      Rider.countDocuments({ status: "available", isActive: true }),
    ]);

    // Delivery methods breakdown
    const methodBreakdown = await Order.aggregate([
      { $match: { "delivery.method": { $exists: true } } },
      { $group: { _id: "$delivery.method", count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      stats: {
        totalDeliveries,
        pendingDeliveries,
        inTransit,
        deliveredToday,
        failedDeliveries,
        activeRiders,
        methodBreakdown,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/delivery/admin/riders
 * @desc    Get all riders for admin
 * @access  Private (Admin)
 */
router.get("/admin/riders", protectAdmin, async (req, res) => {
  try {
    const { status, verified, page = 1, limit = 20 } = req.query;

    let query = {};
    if (status) query.status = status;
    if (verified !== undefined) query.isVerified = verified === "true";

    const riders = await Rider.find(query)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .sort({ createdAt: -1 });

    const total = await Rider.countDocuments(query);

    res.json({
      success: true,
      count: riders.length,
      total,
      pages: Math.ceil(total / limit),
      riders,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   PUT /api/delivery/admin/riders/:riderId/verify
 * @desc    Verify a rider
 * @access  Private (Admin)
 */
router.put("/admin/riders/:riderId/verify", protectAdmin, async (req, res) => {
  try {
    const rider = await Rider.findByIdAndUpdate(
      req.params.riderId,
      { isVerified: true },
      { new: true }
    );

    if (!rider) {
      return res.status(404).json({
        success: false,
        message: "Rider not found",
      });
    }

    res.json({
      success: true,
      message: "Rider verified successfully",
      rider,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
