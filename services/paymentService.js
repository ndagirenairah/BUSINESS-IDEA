/**
 * Payment Service
 * Handles integration with Flutterwave, Stripe, and other payment gateways
 * Supports Mobile Money (MTN, Airtel), Cards, Digital Wallets, COD
 */

const Payment = require("../models/Payment");
const Order = require("../models/Order");
const Notification = require("../models/Notification");
const axios = require("axios");

class PaymentService {
  constructor() {
    // Flutterwave configuration
    this.flutterwaveSecretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    this.flutterwavePublicKey = process.env.FLUTTERWAVE_PUBLIC_KEY;
    this.flutterwaveBaseUrl = "https://api.flutterwave.com/v3";

    // Stripe configuration (optional)
    this.stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  }

  /**
   * Get payment method category
   */
  getMethodCategory(method) {
    const categories = {
      mtn_mobile_money: "mobile_money",
      airtel_money: "mobile_money",
      africell_money: "mobile_money",
      visa: "card",
      mastercard: "card",
      flutterwave: "digital_wallet",
      stripe: "digital_wallet",
      paypal: "digital_wallet",
      cash_on_delivery: "cod",
    };
    return categories[method] || "other";
  }

  /**
   * Initialize payment
   */
  async initializePayment({
    orderId,
    buyerId,
    sellerId,
    businessId,
    method,
    amount,
    currency = "UGX",
    customerEmail,
    customerPhone,
    customerName,
    useEscrow = false,
    metadata = {},
  }) {
    try {
      // Calculate fees
      const fees = Payment.calculateFees(amount.subtotal, amount.deliveryFee);

      // Create payment record
      const payment = await Payment.create({
        orderId,
        buyerId,
        sellerId,
        businessId,
        method,
        methodCategory: this.getMethodCategory(method),
        amount: fees,
        currency,
        status: "pending",
        escrow: {
          enabled: useEscrow,
          status: useEscrow ? "none" : "none",
          releaseCondition: useEscrow ? "delivery_confirmed" : "none",
        },
        mobileMoneyDetails:
          this.getMethodCategory(method) === "mobile_money"
            ? { phoneNumber: customerPhone }
            : {},
        metadata,
      });

      // Handle different payment methods
      let paymentResponse;

      if (method === "cash_on_delivery") {
        paymentResponse = await this.handleCOD(payment);
      } else if (this.getMethodCategory(method) === "mobile_money") {
        paymentResponse = await this.initiateMobileMoneyPayment(
          payment,
          customerPhone,
          customerEmail,
          customerName
        );
      } else if (this.getMethodCategory(method) === "card") {
        paymentResponse = await this.initiateCardPayment(
          payment,
          customerEmail,
          customerName
        );
      } else {
        paymentResponse = await this.initiateWalletPayment(
          payment,
          customerEmail,
          customerName
        );
      }

      return {
        success: true,
        payment,
        ...paymentResponse,
      };
    } catch (error) {
      console.error("Payment initialization error:", error);
      throw error;
    }
  }

  /**
   * Handle Cash on Delivery
   */
  async handleCOD(payment) {
    payment.status = "pending";
    payment.gateway.provider = "manual";
    await payment.save();

    return {
      requiresAction: false,
      message: "Cash on Delivery selected. Pay when you receive your order.",
      paymentId: payment._id,
    };
  }

  /**
   * Initialize Mobile Money Payment via Flutterwave
   */
  async initiateMobileMoneyPayment(payment, phone, email, name) {
    try {
      // Format phone number for Uganda (remove leading 0, add 256)
      let formattedPhone = phone.replace(/^0/, "256").replace(/\s/g, "");
      if (!formattedPhone.startsWith("256")) {
        formattedPhone = "256" + formattedPhone;
      }

      // Determine network
      const network = this.detectMobileNetwork(phone);

      const payload = {
        tx_ref: `TX-${payment._id}-${Date.now()}`,
        amount: payment.amount.total,
        currency: payment.currency,
        email: email || "customer@marketplace.ug",
        phone_number: formattedPhone,
        fullname: name,
        network: network, // MTN, AIRTEL
        redirect_url: `${process.env.APP_URL}/api/payments/callback`,
        meta: {
          payment_id: payment._id.toString(),
          order_id: payment.orderId.toString(),
        },
      };

      // Call Flutterwave Mobile Money charge API
      const response = await axios.post(
        `${this.flutterwaveBaseUrl}/charges?type=mobile_money_uganda`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.status === "success") {
        payment.gateway.transactionRef = payload.tx_ref;
        payment.gateway.flutterwaveRef = response.data.data?.flw_ref || "";
        payment.gateway.provider = "flutterwave";
        payment.status = "processing";
        payment.mobileMoneyDetails = {
          phoneNumber: formattedPhone,
          network: network,
        };
        await payment.save();

        return {
          requiresAction: true,
          actionType: "mobile_money_approval",
          message:
            "Please approve the payment on your mobile phone. Check your phone for a prompt.",
          transactionRef: payload.tx_ref,
          paymentId: payment._id,
        };
      } else {
        throw new Error(response.data.message || "Payment initiation failed");
      }
    } catch (error) {
      console.error("Mobile Money error:", error.response?.data || error);

      // For development/testing, simulate success
      if (process.env.NODE_ENV === "development") {
        return this.simulatePaymentSuccess(payment);
      }

      throw error;
    }
  }

  /**
   * Initialize Card Payment via Flutterwave
   */
  async initiateCardPayment(payment, email, name) {
    try {
      const payload = {
        tx_ref: `TX-${payment._id}-${Date.now()}`,
        amount: payment.amount.total,
        currency: payment.currency,
        redirect_url: `${process.env.APP_URL}/api/payments/callback`,
        customer: {
          email: email,
          name: name,
        },
        customizations: {
          title: "Marketplace Payment",
          description: `Payment for order`,
          logo: `${process.env.APP_URL}/logo.png`,
        },
        meta: {
          payment_id: payment._id.toString(),
          order_id: payment.orderId.toString(),
        },
      };

      // Call Flutterwave Standard API (hosted payment page)
      const response = await axios.post(
        `${this.flutterwaveBaseUrl}/payments`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.status === "success") {
        payment.gateway.transactionRef = payload.tx_ref;
        payment.gateway.provider = "flutterwave";
        payment.status = "processing";
        await payment.save();

        return {
          requiresAction: true,
          actionType: "redirect",
          redirectUrl: response.data.data.link,
          message: "Redirecting to payment page...",
          paymentId: payment._id,
        };
      } else {
        throw new Error(response.data.message || "Payment initiation failed");
      }
    } catch (error) {
      console.error("Card payment error:", error.response?.data || error);

      if (process.env.NODE_ENV === "development") {
        return this.simulatePaymentSuccess(payment);
      }

      throw error;
    }
  }

  /**
   * Initialize Digital Wallet Payment
   */
  async initiateWalletPayment(payment, email, name) {
    // Similar to card payment - uses Flutterwave hosted page
    return this.initiateCardPayment(payment, email, name);
  }

  /**
   * Verify payment status
   */
  async verifyPayment(transactionId, transactionRef) {
    try {
      const response = await axios.get(
        `${this.flutterwaveBaseUrl}/transactions/${transactionId}/verify`,
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("Payment verification error:", error);
      throw error;
    }
  }

  /**
   * Handle payment webhook/callback from Flutterwave
   */
  async handleWebhook(payload) {
    try {
      const { event, data } = payload;

      if (event === "charge.completed") {
        const payment = await Payment.findOne({
          "gateway.transactionRef": data.tx_ref,
        });

        if (!payment) {
          console.error("Payment not found for tx_ref:", data.tx_ref);
          return { success: false, message: "Payment not found" };
        }

        if (data.status === "successful") {
          await this.markPaymentSuccessful(payment, data);
        } else {
          await this.markPaymentFailed(payment, data.processor_response);
        }

        return { success: true };
      }

      return { success: true, message: "Event not handled" };
    } catch (error) {
      console.error("Webhook handling error:", error);
      throw error;
    }
  }

  /**
   * Mark payment as successful
   */
  async markPaymentSuccessful(payment, gatewayData = {}) {
    payment.status = "successful";
    payment.completedAt = new Date();
    payment.gateway.transactionId = gatewayData.id?.toString() || "";
    payment.gateway.chargeResponseCode = gatewayData.processor_response || "00";
    payment.gateway.chargeResponseMessage = "Payment successful";

    if (gatewayData.card) {
      payment.cardDetails = {
        lastFourDigits: gatewayData.card.last_4digits,
        cardType: gatewayData.card.type,
        expiryMonth: gatewayData.card.expiry?.split("/")[0],
        expiryYear: gatewayData.card.expiry?.split("/")[1],
        bank: gatewayData.card.issuer,
      };
    }

    // Handle escrow
    if (payment.escrow.enabled) {
      payment.escrow.status = "held";
      payment.escrow.heldAt = new Date();
      payment.status = "held_in_escrow";
      // Auto-release after 7 days if delivery not confirmed
      payment.escrow.autoReleaseDate = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000
      );
    }

    payment.statusHistory.push({
      status: "successful",
      note: "Payment completed successfully",
      timestamp: new Date(),
    });

    await payment.save();

    // Update order payment status
    await Order.findByIdAndUpdate(payment.orderId, {
      "payment.status": "paid",
      "payment.transactionId": payment.gateway.transactionId,
      "payment.paidAt": new Date(),
    });

    // Send notifications
    await this.sendPaymentNotifications(payment, "successful");

    return payment;
  }

  /**
   * Mark payment as failed
   */
  async markPaymentFailed(payment, reason = "Payment failed") {
    payment.status = "failed";
    payment.failedAt = new Date();
    payment.failureReason = reason;

    payment.statusHistory.push({
      status: "failed",
      note: reason,
      timestamp: new Date(),
    });

    await payment.save();

    // Send failure notification
    await this.sendPaymentNotifications(payment, "failed");

    return payment;
  }

  /**
   * Send payment notifications
   */
  async sendPaymentNotifications(payment, status) {
    try {
      const Buyer = require("../models/Buyer");
      const buyer = await Buyer.findById(payment.buyerId);

      if (status === "successful") {
        // Notify buyer
        await Notification.notify({
          recipientId: payment.buyerId,
          recipientType: "Buyer",
          type: "payment_success",
          title: "Payment Successful! ✅",
          message: `Your payment of ${payment.amount.total.toLocaleString()} ${payment.currency} was successful. Receipt: ${payment.receipt.number}`,
          actionType: "order",
          referenceId: payment.orderId,
        });

        // Notify seller
        await Notification.notify({
          recipientId: payment.sellerId,
          recipientType: "User",
          type: "payment_received",
          title: "Payment Received! 💰",
          message: `You received a payment of ${payment.amount.subtotal.toLocaleString()} ${payment.currency}`,
          actionType: "order",
          referenceId: payment.orderId,
        });

        // Send push notification to buyer
        if (buyer?.deviceTokens?.length > 0) {
          const PushNotificationService = require("./pushNotifications");
          for (const device of buyer.deviceTokens) {
            await PushNotificationService.sendToDevice(device.token, {
              title: "Payment Successful! ✅",
              body: `Your order is being processed. Receipt: ${payment.receipt.number}`,
              data: {
                type: "payment_success",
                orderId: payment.orderId.toString(),
                receiptNumber: payment.receipt.number,
              },
            });
          }
        }
      } else if (status === "failed") {
        await Notification.notify({
          recipientId: payment.buyerId,
          recipientType: "Buyer",
          type: "payment_failed",
          title: "Payment Failed ❌",
          message: `Your payment could not be processed. ${payment.failureReason}. Please try again.`,
          actionType: "order",
          referenceId: payment.orderId,
        });
      }
    } catch (error) {
      console.error("Payment notification error:", error);
    }
  }

  /**
   * Process refund
   */
  async processRefund(paymentId, amount, reason) {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      if (payment.method === "cash_on_delivery") {
        // Manual refund for COD
        await payment.processRefund(amount, reason, "MANUAL-REFUND");
        return { success: true, message: "Refund marked for manual processing" };
      }

      // Process refund via Flutterwave
      const response = await axios.post(
        `${this.flutterwaveBaseUrl}/transactions/${payment.gateway.transactionId}/refund`,
        { amount },
        {
          headers: {
            Authorization: `Bearer ${this.flutterwaveSecretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.status === "success") {
        await payment.processRefund(
          amount,
          reason,
          response.data.data.id?.toString()
        );

        // Notify buyer
        await Notification.notify({
          recipientId: payment.buyerId,
          recipientType: "Buyer",
          type: "refund_processed",
          title: "Refund Processed! 💸",
          message: `A refund of ${amount.toLocaleString()} ${payment.currency} has been processed.`,
          actionType: "order",
          referenceId: payment.orderId,
        });

        return { success: true, payment };
      } else {
        throw new Error(response.data.message || "Refund failed");
      }
    } catch (error) {
      console.error("Refund error:", error);
      throw error;
    }
  }

  /**
   * Release escrow payment
   */
  async releaseEscrow(paymentId, reason = "delivery_confirmed") {
    try {
      const payment = await Payment.findById(paymentId);
      if (!payment) {
        throw new Error("Payment not found");
      }

      await payment.releaseEscrow(reason);

      // Notify seller that funds are released
      await Notification.notify({
        recipientId: payment.sellerId,
        recipientType: "User",
        type: "escrow_released",
        title: "Funds Released! 💰",
        message: `${payment.amount.subtotal.toLocaleString()} ${payment.currency} has been released to your account.`,
        actionType: "order",
        referenceId: payment.orderId,
      });

      return { success: true, payment };
    } catch (error) {
      console.error("Escrow release error:", error);
      throw error;
    }
  }

  /**
   * Detect mobile network from phone number
   */
  detectMobileNetwork(phone) {
    const cleanPhone = phone.replace(/\D/g, "");
    const prefix = cleanPhone.slice(-9, -6); // Get network prefix

    // Uganda mobile prefixes
    const mtnPrefixes = ["77", "78", "76"];
    const airtelPrefixes = ["70", "75", "74"];
    const africellPrefixes = ["79"];

    if (mtnPrefixes.some((p) => prefix.startsWith(p))) return "MTN";
    if (airtelPrefixes.some((p) => prefix.startsWith(p))) return "AIRTEL";
    if (africellPrefixes.some((p) => prefix.startsWith(p))) return "AFRICELL";

    return "MTN"; // Default to MTN
  }

  /**
   * Simulate payment success for development
   */
  async simulatePaymentSuccess(payment) {
    payment.status = "successful";
    payment.completedAt = new Date();
    payment.gateway.transactionId = `SIM-${Date.now()}`;
    payment.gateway.provider = "manual";

    if (payment.escrow.enabled) {
      payment.escrow.status = "held";
      payment.status = "held_in_escrow";
    }

    payment.statusHistory.push({
      status: "successful",
      note: "Simulated payment (development mode)",
      timestamp: new Date(),
    });

    await payment.save();

    // Update order
    await Order.findByIdAndUpdate(payment.orderId, {
      "payment.status": "paid",
      "payment.paidAt": new Date(),
    });

    return {
      requiresAction: false,
      message: "Payment processed successfully (dev mode)",
      paymentId: payment._id,
      receiptNumber: payment.receipt.number,
    };
  }

  /**
   * Get payment analytics for seller
   */
  async getSellerAnalytics(sellerId, dateRange = {}) {
    const query = { sellerId };

    if (dateRange.start) {
      query.createdAt = { $gte: new Date(dateRange.start) };
    }
    if (dateRange.end) {
      query.createdAt = { ...query.createdAt, $lte: new Date(dateRange.end) };
    }

    const [
      totalPayments,
      successfulPayments,
      totalRevenue,
      methodBreakdown,
      recentPayments,
    ] = await Promise.all([
      Payment.countDocuments({ ...query }),
      Payment.countDocuments({ ...query, status: "successful" }),
      Payment.aggregate([
        { $match: { ...query, status: { $in: ["successful", "released"] } } },
        { $group: { _id: null, total: { $sum: "$amount.subtotal" } } },
      ]),
      Payment.aggregate([
        { $match: { ...query, status: "successful" } },
        {
          $group: {
            _id: "$methodCategory",
            count: { $sum: 1 },
            total: { $sum: "$amount.total" },
          },
        },
      ]),
      Payment.find({ ...query })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate("orderId", "orderNumber")
        .select("amount method status createdAt receipt.number"),
    ]);

    return {
      totalPayments,
      successfulPayments,
      failedPayments: totalPayments - successfulPayments,
      totalRevenue: totalRevenue[0]?.total || 0,
      methodBreakdown,
      recentPayments,
    };
  }
}

module.exports = new PaymentService();
