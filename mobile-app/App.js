import React from 'react';
import { StatusBar, ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';

// Context Providers
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { CartProvider, useCart } from './src/context/CartContext';

// Auth Screens
import LoginScreen from './src/screens/auth/LoginScreen';
import RegisterScreen from './src/screens/auth/RegisterScreen';

// Buyer Screens
import HomeScreen from './src/screens/buyer/HomeScreen';
import ProductDetailsScreen from './src/screens/buyer/ProductDetailsScreen';
import CartScreen from './src/screens/buyer/CartScreen';
import CheckoutScreen from './src/screens/buyer/CheckoutScreen';
import ProfileScreen from './src/screens/buyer/ProfileScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// Placeholder Screen for incomplete screens
const PlaceholderScreen = ({ route }) => {
  return (
    <View style={styles.placeholder}>
      <Ionicons name="construct-outline" size={60} color="#ccc" />
      <Text style={styles.placeholderText}>Coming Soon</Text>
      <Text style={styles.placeholderSubtext}>{route.name}</Text>
    </View>
  );
};

// Bottom Tab Navigator for Buyer
const BuyerTabs = () => {
  const { totalItems } = useCart();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#4A90A4',
        tabBarInactiveTintColor: '#888',
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#fff',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Categories"
        component={PlaceholderScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Cart"
        component={CartScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cart-outline" size={size} color={color} />
          ),
          tabBarBadge: totalItems > 0 ? totalItems : undefined,
        }}
      />
      <Tab.Screen
        name="Chat"
        component={PlaceholderScreen}
        options={{
          tabBarLabel: 'Messages',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen 
        name="Profile" 
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

// Main App Navigator
const AppNavigator = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#4A90A4" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={BuyerTabs} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} />
      <Stack.Screen name="Checkout" component={CheckoutScreen} />
      <Stack.Screen name="Search" component={PlaceholderScreen} />
      <Stack.Screen name="Category" component={PlaceholderScreen} />
      <Stack.Screen name="Products" component={PlaceholderScreen} />
      <Stack.Screen name="Shop" component={PlaceholderScreen} />
      <Stack.Screen name="Reviews" component={PlaceholderScreen} />
      <Stack.Screen name="MakeOffer" component={PlaceholderScreen} />
      <Stack.Screen name="Orders" component={PlaceholderScreen} />
      <Stack.Screen name="OrderSuccess" component={PlaceholderScreen} />
      <Stack.Screen name="Wishlist" component={PlaceholderScreen} />
      <Stack.Screen name="Rewards" component={PlaceholderScreen} />
      <Stack.Screen name="Addresses" component={PlaceholderScreen} />
      <Stack.Screen name="Notifications" component={PlaceholderScreen} />
      <Stack.Screen name="NotificationSettings" component={PlaceholderScreen} />
      <Stack.Screen name="Help" component={PlaceholderScreen} />
      <Stack.Screen name="Settings" component={PlaceholderScreen} />
      <Stack.Screen name="EditProfile" component={PlaceholderScreen} />
      <Stack.Screen name="SellerDashboard" component={PlaceholderScreen} />
    </Stack.Navigator>
  );
};

// Main App Component
export default function App() {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <AuthProvider>
          <CartProvider>
            <NavigationContainer>
              <StatusBar barStyle="dark-content" backgroundColor="#fff" />
              <AppNavigator />
            </NavigationContainer>
          </CartProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
  },
  placeholderText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#888',
    marginTop: 16,
  },
  placeholderSubtext: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 4,
  },
});
