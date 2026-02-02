import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { orderService, deliveryService, paymentService } from '../../services/api';
import { formatPrice, getPhoneNetwork, isValidUgandaPhone } from '../../utils/helpers';

const DELIVERY_OPTIONS = [
  {
    id: 'safeboda',
    name: 'SafeBoda',
    icon: 'bicycle',
    description: 'Fast delivery via SafeBoda rider',
    estimatedTime: '30-60 mins',
  },
  {
    id: 'faras',
    name: 'Faras',
    icon: 'car',
    description: 'Standard delivery via Faras',
    estimatedTime: '1-2 hours',
  },
  {
    id: 'personal',
    name: 'Personal Delivery',
    icon: 'person',
    description: 'Seller delivers personally',
    estimatedTime: '1-3 hours',
  },
  {
    id: 'pickup',
    name: 'Self Pickup',
    icon: 'storefront',
    description: 'Pick up from seller location',
    estimatedTime: 'Your convenience',
    fee: 0,
  },
];

const PAYMENT_METHODS = [
  {
    id: 'mtn_money',
    name: 'MTN Mobile Money',
    icon: 'phone-portrait',
    color: '#FFCC00',
  },
  {
    id: 'airtel_money',
    name: 'Airtel Money',
    icon: 'phone-portrait',
    color: '#FF0000',
  },
  {
    id: 'card',
    name: 'Card Payment',
    icon: 'card',
    color: '#4A90A4',
  },
  {
    id: 'cod',
    name: 'Cash on Delivery',
    icon: 'cash',
    color: '#4CAF50',
  },
];

const CheckoutScreen = ({ navigation }) => {
  const { items, subtotal, clearCart } = useCart();
  const { user, isAuthenticated } = useAuth();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  
  // Address state
  const [address, setAddress] = useState({
    fullName: user?.name || '',
    phone: user?.phone || '',
    district: '',
    area: '',
    street: '',
    landmark: '',
  });
  
  // Delivery state
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [deliveryFee, setDeliveryFee] = useState(0);
  
  // Payment state
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [mobileNumber, setMobileNumber] = useState(user?.phone || '');

  useEffect(() => {
    if (!isAuthenticated) {
      navigation.replace('Login');
    }
  }, [isAuthenticated]);

  const calculateDeliveryFee = async () => {
    if (!selectedDelivery || selectedDelivery === 'pickup') {
      setDeliveryFee(0);
      return;
    }
    
    // Simple fee calculation based on method
    const fees = {
      safeboda: 5000,
      faras: 8000,
      personal: 3000,
      pickup: 0,
    };
    setDeliveryFee(fees[selectedDelivery] || 0);
  };

  useEffect(() => {
    calculateDeliveryFee();
  }, [selectedDelivery]);

  const validateAddress = () => {
    const { fullName, phone, district, area } = address;
    if (!fullName || !phone || !district || !area) {
      Alert.alert('Missing Info', 'Please fill all required address fields');
      return false;
    }
    if (!isValidUgandaPhone(phone)) {
      Alert.alert('Invalid Phone', 'Please enter a valid Uganda phone number');
      return false;
    }
    return true;
  };

  const validatePayment = () => {
    if (!selectedPayment) {
      Alert.alert('Select Payment', 'Please select a payment method');
      return false;
    }
    if (['mtn_money', 'airtel_money'].includes(selectedPayment)) {
      if (!mobileNumber || !isValidUgandaPhone(mobileNumber)) {
        Alert.alert('Invalid Number', 'Please enter a valid mobile money number');
        return false;
      }
      // Validate network matches payment method
      const network = getPhoneNetwork(mobileNumber);
      if (selectedPayment === 'mtn_money' && network !== 'mtn') {
        Alert.alert('Wrong Network', 'Please enter an MTN number for MTN Mobile Money');
        return false;
      }
      if (selectedPayment === 'airtel_money' && network !== 'airtel') {
        Alert.alert('Wrong Network', 'Please enter an Airtel number for Airtel Money');
        return false;
      }
    }
    return true;
  };

  const handleNextStep = () => {
    if (currentStep === 1 && validateAddress()) {
      setCurrentStep(2);
    } else if (currentStep === 2 && selectedDelivery) {
      setCurrentStep(3);
    } else if (currentStep === 2) {
      Alert.alert('Select Delivery', 'Please select a delivery method');
    }
  };

  const handlePlaceOrder = async () => {
    if (!validatePayment()) return;

    setIsLoading(true);
    try {
      // Prepare order data
      const orderData = {
        items: items.map((item) => ({
          product: item.product._id,
          quantity: item.quantity,
          price: item.product.price,
        })),
        shippingAddress: address,
        deliveryMethod: selectedDelivery,
        deliveryFee,
        paymentMethod: selectedPayment,
        mobileNumber: ['mtn_money', 'airtel_money'].includes(selectedPayment)
          ? mobileNumber
          : undefined,
        subtotal,
        total: subtotal + deliveryFee,
      };

      // Complete checkout
      const response = await orderService.completeCheckout(orderData);

      // Clear cart
      await clearCart();

      // Navigate to success
      navigation.replace('OrderSuccess', { order: response.order });
    } catch (error) {
      console.log('Checkout error:', error);
      Alert.alert(
        'Checkout Failed',
        error.response?.data?.message || 'Something went wrong. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const total = subtotal + deliveryFee;

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {[1, 2, 3].map((step) => (
        <React.Fragment key={step}>
          <View
            style={[
              styles.stepCircle,
              currentStep >= step && styles.stepCircleActive,
            ]}
          >
            {currentStep > step ? (
              <Ionicons name="checkmark" size={16} color="#fff" />
            ) : (
              <Text
                style={[
                  styles.stepNumber,
                  currentStep >= step && styles.stepNumberActive,
                ]}
              >
                {step}
              </Text>
            )}
          </View>
          {step < 3 && (
            <View
              style={[
                styles.stepLine,
                currentStep > step && styles.stepLineActive,
              ]}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  );

  const renderAddressStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Delivery Address</Text>
      
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Full Name *</Text>
        <TextInput
          style={styles.input}
          value={address.fullName}
          onChangeText={(text) => setAddress({ ...address, fullName: text })}
          placeholder="Enter your full name"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Phone Number *</Text>
        <TextInput
          style={styles.input}
          value={address.phone}
          onChangeText={(text) => setAddress({ ...address, phone: text })}
          placeholder="e.g., 0771234567"
          keyboardType="phone-pad"
        />
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
          <Text style={styles.inputLabel}>District *</Text>
          <TextInput
            style={styles.input}
            value={address.district}
            onChangeText={(text) => setAddress({ ...address, district: text })}
            placeholder="e.g., Kampala"
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
          <Text style={styles.inputLabel}>Area *</Text>
          <TextInput
            style={styles.input}
            value={address.area}
            onChangeText={(text) => setAddress({ ...address, area: text })}
            placeholder="e.g., Nakasero"
          />
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Street Address</Text>
        <TextInput
          style={styles.input}
          value={address.street}
          onChangeText={(text) => setAddress({ ...address, street: text })}
          placeholder="Street name, building number"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Landmark</Text>
        <TextInput
          style={styles.input}
          value={address.landmark}
          onChangeText={(text) => setAddress({ ...address, landmark: text })}
          placeholder="e.g., Near Total Petrol Station"
        />
      </View>
    </View>
  );

  const renderDeliveryStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Delivery Method</Text>
      
      {DELIVERY_OPTIONS.map((option) => (
        <TouchableOpacity
          key={option.id}
          style={[
            styles.optionCard,
            selectedDelivery === option.id && styles.optionCardSelected,
          ]}
          onPress={() => setSelectedDelivery(option.id)}
        >
          <View style={styles.optionIcon}>
            <Ionicons name={option.icon} size={24} color="#4A90A4" />
          </View>
          <View style={styles.optionInfo}>
            <Text style={styles.optionName}>{option.name}</Text>
            <Text style={styles.optionDesc}>{option.description}</Text>
            <Text style={styles.optionTime}>⏱ {option.estimatedTime}</Text>
          </View>
          <View style={styles.optionRight}>
            {option.id !== 'pickup' && (
              <Text style={styles.optionFee}>
                {formatPrice(
                  option.id === 'safeboda'
                    ? 5000
                    : option.id === 'faras'
                    ? 8000
                    : 3000
                )}
              </Text>
            )}
            {option.id === 'pickup' && (
              <Text style={styles.optionFree}>FREE</Text>
            )}
            <View
              style={[
                styles.radioOuter,
                selectedDelivery === option.id && styles.radioOuterSelected,
              ]}
            >
              {selectedDelivery === option.id && (
                <View style={styles.radioInner} />
              )}
            </View>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  const renderPaymentStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Payment Method</Text>
      
      {PAYMENT_METHODS.map((method) => (
        <TouchableOpacity
          key={method.id}
          style={[
            styles.optionCard,
            selectedPayment === method.id && styles.optionCardSelected,
          ]}
          onPress={() => setSelectedPayment(method.id)}
        >
          <View style={[styles.paymentIcon, { backgroundColor: method.color + '20' }]}>
            <Ionicons name={method.icon} size={24} color={method.color} />
          </View>
          <View style={styles.optionInfo}>
            <Text style={styles.optionName}>{method.name}</Text>
          </View>
          <View
            style={[
              styles.radioOuter,
              selectedPayment === method.id && styles.radioOuterSelected,
            ]}
          >
            {selectedPayment === method.id && <View style={styles.radioInner} />}
          </View>
        </TouchableOpacity>
      ))}

      {/* Mobile Money Number Input */}
      {['mtn_money', 'airtel_money'].includes(selectedPayment) && (
        <View style={styles.mobileInputContainer}>
          <Text style={styles.inputLabel}>Mobile Money Number</Text>
          <TextInput
            style={styles.input}
            value={mobileNumber}
            onChangeText={setMobileNumber}
            placeholder="e.g., 0771234567"
            keyboardType="phone-pad"
          />
          <Text style={styles.mobileHint}>
            You will receive a payment prompt on this number
          </Text>
        </View>
      )}

      {/* Order Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Order Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>{formatPrice(subtotal)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Delivery Fee</Text>
          <Text style={styles.summaryValue}>
            {deliveryFee === 0 ? 'FREE' : formatPrice(deliveryFee)}
          </Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatPrice(total)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (currentStep > 1) {
              setCurrentStep(currentStep - 1);
            } else {
              navigation.goBack();
            }
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Checkout</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Step Indicator */}
      {renderStepIndicator()}
      <View style={styles.stepLabels}>
        <Text style={[styles.stepLabel, currentStep >= 1 && styles.stepLabelActive]}>
          Address
        </Text>
        <Text style={[styles.stepLabel, currentStep >= 2 && styles.stepLabelActive]}>
          Delivery
        </Text>
        <Text style={[styles.stepLabel, currentStep >= 3 && styles.stepLabelActive]}>
          Payment
        </Text>
      </View>

      {/* Step Content */}
      <ScrollView showsVerticalScrollIndicator={false}>
        {currentStep === 1 && renderAddressStep()}
        {currentStep === 2 && renderDeliveryStep()}
        {currentStep === 3 && renderPaymentStep()}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Button */}
      <View style={styles.bottomBar}>
        {currentStep < 3 ? (
          <TouchableOpacity style={styles.nextBtn} onPress={handleNextStep}>
            <Text style={styles.nextBtnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextBtn, isLoading && styles.btnDisabled]}
            onPress={handlePlaceOrder}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.nextBtnText}>
                  Place Order • {formatPrice(total)}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#fff',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepCircleActive: {
    backgroundColor: '#4A90A4',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#888',
  },
  stepNumberActive: {
    color: '#fff',
  },
  stepLine: {
    width: 60,
    height: 3,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 8,
  },
  stepLineActive: {
    backgroundColor: '#4A90A4',
  },
  stepLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  stepLabel: {
    fontSize: 12,
    color: '#888',
  },
  stepLabelActive: {
    color: '#4A90A4',
    fontWeight: '600',
  },
  stepContent: {
    padding: 16,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  row: {
    flexDirection: 'row',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardSelected: {
    borderColor: '#4A90A4',
    backgroundColor: '#F0F8FF',
  },
  optionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F4F8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  optionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  optionDesc: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  optionTime: {
    fontSize: 12,
    color: '#4A90A4',
    marginTop: 4,
  },
  optionRight: {
    alignItems: 'flex-end',
  },
  optionFee: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  optionFree: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginBottom: 8,
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOuterSelected: {
    borderColor: '#4A90A4',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4A90A4',
  },
  mobileInputContainer: {
    marginTop: 16,
  },
  mobileHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    fontStyle: 'italic',
  },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    color: '#333',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 12,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4A90A4',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A90A4',
    paddingVertical: 16,
    borderRadius: 12,
  },
  nextBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  btnDisabled: {
    opacity: 0.7,
  },
});

export default CheckoutScreen;
