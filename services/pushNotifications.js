/**
 * Push Notification Service
 * Handles sending notifications to buyers when new products are posted
 * 
 * This is a base implementation. In production, integrate with:
 * - Firebase Cloud Messaging (FCM) for Android/iOS
 * - Expo Push Notifications for React Native/Expo apps
 * - Web Push for Progressive Web Apps
 */

const Notification = require("../models/Notification");
const Buyer = require("../models/Buyer");
const RecommendationService = require("./recommendations");

class PushNotificationService {
  /**
   * Send push notification to a single device
   * In production, replace with actual FCM/Expo implementation
   */
  static async sendToDevice(deviceToken, payload) {
    // TODO: Implement actual push notification service
    // Example with Firebase Admin SDK:
    // const admin = require('firebase-admin');
    // await admin.messaging().send({
    //   token: deviceToken,
    //   notification: {
    //     title: payload.title,
    //     body: payload.body,
    //   },
    //   data: payload.data,
    // });

    console.log(`📱 Push notification to ${deviceToken}:`, payload.title);
    return { success: true, token: deviceToken };
  }

  /**
   * Send push notification to multiple devices
   */
  static async sendToMultipleDevices(deviceTokens, payload) {
    const results = await Promise.all(
      deviceTokens.map((token) => this.sendToDevice(token, payload))
    );
    return results;
  }

  /**
   * Notify interested buyers when a new product is posted
   */
  static async notifyNewProduct(product, business) {
    try {
      // Find buyers interested in this category
      const interestedBuyers = await RecommendationService.findInterestedBuyers(
        product.category
      );

      console.log(
        `🔔 Found ${interestedBuyers.length} buyers interested in ${product.category}`
      );

      const notifications = [];
      const pushPromises = [];

      for (const buyer of interestedBuyers) {
        // Create in-app notification
        const notification = await Notification.notify({
          recipientId: buyer._id,
          recipientType: "Buyer",
          type: "new_product",
          title: `New in ${product.category}! 🆕`,
          message: `${product.name} is now available for $${product.price}`,
          actionType: "product",
          referenceId: product._id,
        });
        notifications.push(notification);

        // Send push notification to all buyer's devices
        if (buyer.deviceTokens && buyer.deviceTokens.length > 0) {
          const payload = {
            title: `New in ${product.category}! 🆕`,
            body: `${product.name} - $${product.price}`,
            data: {
              type: "new_product",
              productId: product._id.toString(),
              category: product.category,
            },
          };

          buyer.deviceTokens.forEach((device) => {
            pushPromises.push(this.sendToDevice(device.token, payload));
          });
        }
      }

      // Wait for all push notifications to be sent
      await Promise.all(pushPromises);

      return {
        notifiedCount: interestedBuyers.length,
        notifications,
      };
    } catch (error) {
      console.error("Notify new product error:", error);
      return { notifiedCount: 0, notifications: [] };
    }
  }

  /**
   * Notify buyers when a product price drops
   */
  static async notifyPriceDrop(product, oldPrice, newPrice) {
    try {
      // Find buyers who have this product in wishlist
      const buyersWithWishlist = await Buyer.find({
        wishlist: product._id,
        "notifications.push": true,
        "notifications.priceDrops": true,
        isActive: true,
      });

      const discount = Math.round(((oldPrice - newPrice) / oldPrice) * 100);

      const notifications = [];
      const pushPromises = [];

      for (const buyer of buyersWithWishlist) {
        // Create in-app notification
        const notification = await Notification.notify({
          recipientId: buyer._id,
          recipientType: "Buyer",
          type: "price_drop",
          title: `Price Drop! 📉 ${discount}% off`,
          message: `${product.name} is now $${newPrice} (was $${oldPrice})`,
          actionType: "product",
          referenceId: product._id,
        });
        notifications.push(notification);

        // Send push notification
        if (buyer.deviceTokens && buyer.deviceTokens.length > 0) {
          const payload = {
            title: `Price Drop! 📉 ${discount}% off`,
            body: `${product.name} is now $${newPrice}`,
            data: {
              type: "price_drop",
              productId: product._id.toString(),
              oldPrice: oldPrice.toString(),
              newPrice: newPrice.toString(),
            },
          };

          buyer.deviceTokens.forEach((device) => {
            pushPromises.push(this.sendToDevice(device.token, payload));
          });
        }
      }

      await Promise.all(pushPromises);

      return {
        notifiedCount: buyersWithWishlist.length,
        notifications,
      };
    } catch (error) {
      console.error("Notify price drop error:", error);
      return { notifiedCount: 0, notifications: [] };
    }
  }

  /**
   * Notify buyers when product is back in stock
   */
  static async notifyBackInStock(product) {
    try {
      // Find buyers who have this product in wishlist
      const buyersWithWishlist = await Buyer.find({
        wishlist: product._id,
        "notifications.push": true,
        isActive: true,
      });

      const notifications = [];
      const pushPromises = [];

      for (const buyer of buyersWithWishlist) {
        const notification = await Notification.notify({
          recipientId: buyer._id,
          recipientType: "Buyer",
          type: "back_in_stock",
          title: "Back in Stock! 🎉",
          message: `${product.name} is available again`,
          actionType: "product",
          referenceId: product._id,
        });
        notifications.push(notification);

        if (buyer.deviceTokens && buyer.deviceTokens.length > 0) {
          const payload = {
            title: "Back in Stock! 🎉",
            body: `${product.name} is available again`,
            data: {
              type: "back_in_stock",
              productId: product._id.toString(),
            },
          };

          buyer.deviceTokens.forEach((device) => {
            pushPromises.push(this.sendToDevice(device.token, payload));
          });
        }
      }

      await Promise.all(pushPromises);

      return {
        notifiedCount: buyersWithWishlist.length,
        notifications,
      };
    } catch (error) {
      console.error("Notify back in stock error:", error);
      return { notifiedCount: 0, notifications: [] };
    }
  }

  /**
   * Notify seller when buyer shows interest
   */
  static async notifySellerOfInterest(businessId, buyerName, product, action) {
    try {
      const actionMessages = {
        wishlist: `${buyerName} added your product to wishlist`,
        inquiry: `${buyerName} is interested in your product`,
        view: `${buyerName} viewed your product`,
      };

      await Notification.notify({
        recipientId: businessId,
        recipientType: "Business",
        type: "new_inquiry",
        title: "New Interest! 👀",
        message: actionMessages[action] || `Interest in ${product.name}`,
        actionType: "product",
        referenceId: product._id,
      });

      return true;
    } catch (error) {
      console.error("Notify seller error:", error);
      return false;
    }
  }

  /**
   * Register device token for push notifications
   */
  static async registerDeviceToken(buyerId, token, platform = "android") {
    try {
      const buyer = await Buyer.findById(buyerId);
      if (!buyer) return false;

      await buyer.addDeviceToken(token, platform);
      return true;
    } catch (error) {
      console.error("Register device token error:", error);
      return false;
    }
  }

  /**
   * Send bulk notification to all buyers
   */
  static async sendBulkNotification(title, message, data = {}) {
    try {
      const buyers = await Buyer.find({
        "notifications.push": true,
        "notifications.promotions": true,
        isActive: true,
        "deviceTokens.0": { $exists: true }, // Has at least one device token
      });

      const pushPromises = [];

      for (const buyer of buyers) {
        // Create in-app notification
        await Notification.notify({
          recipientId: buyer._id,
          recipientType: "Buyer",
          type: "promotion",
          title,
          message,
          actionType: data.actionType || "none",
          referenceId: data.referenceId,
        });

        // Send push notification
        buyer.deviceTokens.forEach((device) => {
          pushPromises.push(
            this.sendToDevice(device.token, { title, body: message, data })
          );
        });
      }

      await Promise.all(pushPromises);

      return { notifiedCount: buyers.length };
    } catch (error) {
      console.error("Bulk notification error:", error);
      return { notifiedCount: 0 };
    }
  }

  // ============================================
  // DELIVERY NOTIFICATIONS
  // ============================================

  /**
   * Notify buyer of delivery status updates
   */
  static async notifyDeliveryUpdate(order, status, extraInfo = {}) {
    try {
      const buyer = await Buyer.findById(order.buyerId);
      if (!buyer) return false;

      const statusMessages = {
        assigned: {
          title: "Rider Assigned! 🚴",
          message: `${extraInfo.riderName || "A rider"} will deliver your order`,
        },
        picked_up: {
          title: "Order Picked Up! 📦",
          message: "Your order has been picked up and is on the way",
        },
        in_transit: {
          title: "On The Way! 🚀",
          message: `Your order is ${extraInfo.eta || "on the way"}`,
        },
        arrived: {
          title: "Rider Arrived! 📍",
          message: "Your rider has arrived at your location",
        },
        delivered: {
          title: "Order Delivered! ✅",
          message: "Your order has been delivered successfully",
        },
        failed: {
          title: "Delivery Issue ⚠️",
          message: extraInfo.reason || "There was an issue with your delivery",
        },
      };

      const { title, message } = statusMessages[status] || {
        title: "Delivery Update",
        message: `Your delivery status: ${status}`,
      };

      // Create in-app notification
      await Notification.notify({
        recipientId: buyer._id,
        recipientType: "Buyer",
        type: "delivery_update",
        title,
        message,
        actionType: "order",
        referenceId: order._id,
      });

      // Send push notification
      if (buyer.deviceTokens && buyer.deviceTokens.length > 0) {
        const payload = {
          title,
          body: message,
          data: {
            type: "delivery_update",
            orderId: order._id.toString(),
            status,
            ...extraInfo,
          },
        };

        const pushPromises = buyer.deviceTokens.map((device) =>
          this.sendToDevice(device.token, payload)
        );
        await Promise.all(pushPromises);
      }

      return true;
    } catch (error) {
      console.error("Delivery notification error:", error);
      return false;
    }
  }

  /**
   * Notify rider of new delivery assignment
   */
  static async notifyRiderAssignment(rider, order) {
    try {
      const Rider = require("../models/Rider");
      
      if (!rider.deviceToken) return false;

      const payload = {
        title: "New Delivery Request! 🔔",
        body: `Order #${order.orderNumber || order._id.toString().slice(-6)} needs delivery`,
        data: {
          type: "new_delivery",
          orderId: order._id.toString(),
          pickupAddress: order.delivery?.pickupLocation?.address || "",
          deliveryAddress: `${order.shippingAddress?.street || ""}, ${order.shippingAddress?.city || ""}`,
        },
      };

      await this.sendToDevice(rider.deviceToken, payload);
      return true;
    } catch (error) {
      console.error("Rider notification error:", error);
      return false;
    }
  }

  /**
   * Notify seller when rider picks up order
   */
  static async notifySellerPickup(order, riderName) {
    try {
      await Notification.notify({
        recipientId: order.businessId,
        recipientType: "Business",
        type: "order_picked_up",
        title: "Order Picked Up! 📦",
        message: `Order #${order.orderNumber || order._id.toString().slice(-6)} picked up by ${riderName}`,
        actionType: "order",
        referenceId: order._id,
      });

      return true;
    } catch (error) {
      console.error("Seller pickup notification error:", error);
      return false;
    }
  }

  /**
   * Notify buyer with rider contact info
   */
  static async sendRiderContactInfo(order) {
    try {
      const buyer = await Buyer.findById(order.buyerId);
      if (!buyer) return false;

      const rider = order.delivery?.rider;
      if (!rider) return false;

      const message = `Your rider: ${rider.name}\nPhone: ${rider.phone}\nVehicle: ${rider.vehicleType} ${rider.vehiclePlate || ""}`;

      await Notification.notify({
        recipientId: buyer._id,
        recipientType: "Buyer",
        type: "rider_info",
        title: "Rider Contact Info 📞",
        message,
        actionType: "order",
        referenceId: order._id,
      });

      // Send push notification
      if (buyer.deviceTokens && buyer.deviceTokens.length > 0) {
        const payload = {
          title: "Rider Contact Info 📞",
          body: `Your rider ${rider.name} is on the way. Call: ${rider.phone}`,
          data: {
            type: "rider_info",
            orderId: order._id.toString(),
            riderName: rider.name,
            riderPhone: rider.phone,
          },
        };

        const pushPromises = buyer.deviceTokens.map((device) =>
          this.sendToDevice(device.token, payload)
        );
        await Promise.all(pushPromises);
      }

      return true;
    } catch (error) {
      console.error("Rider contact notification error:", error);
      return false;
    }
  }
}

module.exports = PushNotificationService;
