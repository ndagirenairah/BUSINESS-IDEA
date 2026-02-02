import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { isValidEmail, isValidUgandaPhone } from '../../utils/helpers';

const RegisterScreen = ({ navigation, route }) => {
  const { buyerRegister, sellerRegister, clearError } = useAuth();
  const initialUserType = route.params?.userType || 'buyer';
  
  const [userType, setUserType] = useState(initialUserType);
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    // Seller specific
    businessName: '',
    businessCategory: '',
    location: '',
  });

  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const updateForm = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const validateStep1 = () => {
    const { name, email, phone } = formData;
    if (!name || !email || !phone) {
      Alert.alert('Missing Fields', 'Please fill all required fields');
      return false;
    }
    if (!isValidEmail(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return false;
    }
    if (!isValidUgandaPhone(phone)) {
      Alert.alert('Invalid Phone', 'Please enter a valid Uganda phone number');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    const { password, confirmPassword } = formData;
    if (!password) {
      Alert.alert('Missing Password', 'Please enter a password');
      return false;
    }
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters');
      return false;
    }
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match');
      return false;
    }
    if (userType === 'seller') {
      if (!formData.businessName || !formData.location) {
        Alert.alert('Missing Info', 'Please fill in business details');
        return false;
      }
    }
    if (!agreedToTerms) {
      Alert.alert('Terms Required', 'Please agree to Terms & Conditions');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep1()) {
      setStep(2);
    }
  };

  const handleRegister = async () => {
    if (!validateStep2()) return;

    setIsLoading(true);
    clearError();

    try {
      const userData = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        password: formData.password,
      };

      if (userType === 'seller') {
        userData.businessName = formData.businessName;
        userData.businessCategory = formData.businessCategory;
        userData.location = formData.location;
      }

      let result;
      if (userType === 'buyer') {
        result = await buyerRegister(userData);
      } else {
        result = await sellerRegister(userData);
      }

      if (result.success) {
        Alert.alert('Welcome!', 'Your account has been created successfully');
      } else {
        Alert.alert('Registration Failed', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const renderStep1 = () => (
    <>
      <View style={styles.inputContainer}>
        <Ionicons name="person-outline" size={20} color="#888" />
        <TextInput
          style={styles.input}
          placeholder="Full Name"
          placeholderTextColor="#888"
          value={formData.name}
          onChangeText={(text) => updateForm('name', text)}
          autoCapitalize="words"
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="mail-outline" size={20} color="#888" />
        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor="#888"
          value={formData.email}
          onChangeText={(text) => updateForm('email', text)}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="call-outline" size={20} color="#888" />
        <TextInput
          style={styles.input}
          placeholder="Phone Number (e.g., 0771234567)"
          placeholderTextColor="#888"
          value={formData.phone}
          onChangeText={(text) => updateForm('phone', text)}
          keyboardType="phone-pad"
        />
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={handleNext}>
        <Text style={styles.primaryBtnText}>Continue</Text>
        <Ionicons name="arrow-forward" size={20} color="#fff" />
      </TouchableOpacity>
    </>
  );

  const renderStep2 = () => (
    <>
      {userType === 'seller' && (
        <>
          <View style={styles.inputContainer}>
            <Ionicons name="business-outline" size={20} color="#888" />
            <TextInput
              style={styles.input}
              placeholder="Business Name"
              placeholderTextColor="#888"
              value={formData.businessName}
              onChangeText={(text) => updateForm('businessName', text)}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="grid-outline" size={20} color="#888" />
            <TextInput
              style={styles.input}
              placeholder="Business Category"
              placeholderTextColor="#888"
              value={formData.businessCategory}
              onChangeText={(text) => updateForm('businessCategory', text)}
            />
          </View>

          <View style={styles.inputContainer}>
            <Ionicons name="location-outline" size={20} color="#888" />
            <TextInput
              style={styles.input}
              placeholder="Location (e.g., Kampala, Nakasero)"
              placeholderTextColor="#888"
              value={formData.location}
              onChangeText={(text) => updateForm('location', text)}
            />
          </View>
        </>
      )}

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed-outline" size={20} color="#888" />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
          value={formData.password}
          onChangeText={(text) => updateForm('password', text)}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color="#888"
          />
        </TouchableOpacity>
      </View>

      <View style={styles.inputContainer}>
        <Ionicons name="lock-closed-outline" size={20} color="#888" />
        <TextInput
          style={styles.input}
          placeholder="Confirm Password"
          placeholderTextColor="#888"
          value={formData.confirmPassword}
          onChangeText={(text) => updateForm('confirmPassword', text)}
          secureTextEntry={!showPassword}
        />
      </View>

      {/* Terms Agreement */}
      <TouchableOpacity
        style={styles.termsContainer}
        onPress={() => setAgreedToTerms(!agreedToTerms)}
      >
        <View
          style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}
        >
          {agreedToTerms && (
            <Ionicons name="checkmark" size={16} color="#fff" />
          )}
        </View>
        <Text style={styles.termsText}>
          I agree to the{' '}
          <Text style={styles.termsLink}>Terms & Conditions</Text> and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>
      </TouchableOpacity>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => setStep(1)}
        >
          <Ionicons name="arrow-back" size={20} color="#4A90A4" />
          <Text style={styles.secondaryBtnText}>Back</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryBtn, { flex: 1, marginLeft: 12 }]}
          onPress={handleRegister}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Create Account</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => {
                if (step === 2) setStep(1);
                else navigation.goBack();
              }}
            >
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Title */}
          <View style={styles.titleSection}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              {userType === 'buyer'
                ? 'Sign up to start shopping'
                : 'Register your business'}
            </Text>
          </View>

          {/* User Type Toggle */}
          <View style={styles.userTypeToggle}>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                userType === 'buyer' && styles.toggleBtnActive,
              ]}
              onPress={() => setUserType('buyer')}
            >
              <Ionicons
                name="person"
                size={18}
                color={userType === 'buyer' ? '#fff' : '#666'}
              />
              <Text
                style={[
                  styles.toggleText,
                  userType === 'buyer' && styles.toggleTextActive,
                ]}
              >
                Buyer
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.toggleBtn,
                userType === 'seller' && styles.toggleBtnActive,
              ]}
              onPress={() => setUserType('seller')}
            >
              <Ionicons
                name="business"
                size={18}
                color={userType === 'seller' ? '#fff' : '#666'}
              />
              <Text
                style={[
                  styles.toggleText,
                  userType === 'seller' && styles.toggleTextActive,
                ]}
              >
                Seller
              </Text>
            </TouchableOpacity>
          </View>

          {/* Step Indicator */}
          <View style={styles.stepIndicator}>
            <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
            <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
            <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
          </View>

          {/* Form */}
          <View style={styles.form}>
            {step === 1 ? renderStep1() : renderStep2()}
          </View>

          {/* Login Link */}
          <View style={styles.loginSection}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Login</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  titleSection: {
    marginTop: 12,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
  },
  userTypeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  toggleBtnActive: {
    backgroundColor: '#4A90A4',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginLeft: 8,
  },
  toggleTextActive: {
    color: '#fff',
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E0E0E0',
  },
  stepDotActive: {
    backgroundColor: '#4A90A4',
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
  form: {
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#333',
  },
  termsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ccc',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#4A90A4',
    borderColor: '#4A90A4',
  },
  termsText: {
    flex: 1,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  termsLink: {
    color: '#4A90A4',
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A90A4',
    borderRadius: 12,
    paddingVertical: 16,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F4F8',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  secondaryBtnText: {
    color: '#4A90A4',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  loginSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingBottom: 24,
  },
  loginText: {
    fontSize: 14,
    color: '#888',
  },
  loginLink: {
    fontSize: 14,
    color: '#4A90A4',
    fontWeight: 'bold',
  },
});

export default RegisterScreen;
