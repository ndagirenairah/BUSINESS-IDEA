import React, { createContext, useContext, useReducer, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

// Initial state
const initialState = {
  items: [], // { product, quantity, seller }
  totalItems: 0,
  subtotal: 0,
  isLoading: false,
};

// Action types
const CART_ACTIONS = {
  SET_CART: 'SET_CART',
  ADD_ITEM: 'ADD_ITEM',
  REMOVE_ITEM: 'REMOVE_ITEM',
  UPDATE_QUANTITY: 'UPDATE_QUANTITY',
  CLEAR_CART: 'CLEAR_CART',
  SET_LOADING: 'SET_LOADING',
};

// Helper to calculate totals
const calculateTotals = (items) => {
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  );
  return { totalItems, subtotal };
};

// Reducer
const cartReducer = (state, action) => {
  let newItems;
  
  switch (action.type) {
    case CART_ACTIONS.SET_CART:
      return {
        ...state,
        items: action.payload,
        ...calculateTotals(action.payload),
        isLoading: false,
      };
      
    case CART_ACTIONS.ADD_ITEM:
      const existingIndex = state.items.findIndex(
        (item) => item.product._id === action.payload.product._id
      );
      
      if (existingIndex > -1) {
        // Update quantity if item exists
        newItems = state.items.map((item, index) =>
          index === existingIndex
            ? { ...item, quantity: item.quantity + action.payload.quantity }
            : item
        );
      } else {
        // Add new item
        newItems = [...state.items, action.payload];
      }
      return {
        ...state,
        items: newItems,
        ...calculateTotals(newItems),
      };
      
    case CART_ACTIONS.REMOVE_ITEM:
      newItems = state.items.filter(
        (item) => item.product._id !== action.payload
      );
      return {
        ...state,
        items: newItems,
        ...calculateTotals(newItems),
      };
      
    case CART_ACTIONS.UPDATE_QUANTITY:
      newItems = state.items.map((item) =>
        item.product._id === action.payload.productId
          ? { ...item, quantity: action.payload.quantity }
          : item
      );
      return {
        ...state,
        items: newItems,
        ...calculateTotals(newItems),
      };
      
    case CART_ACTIONS.CLEAR_CART:
      return { ...initialState };
      
    case CART_ACTIONS.SET_LOADING:
      return { ...state, isLoading: action.payload };
      
    default:
      return state;
  }
};

// Create context
const CartContext = createContext(null);

// Provider component
export const CartProvider = ({ children }) => {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  // Load cart from storage on mount
  useEffect(() => {
    loadCart();
  }, []);

  // Save cart to storage whenever it changes
  useEffect(() => {
    if (state.items.length > 0) {
      saveCart();
    }
  }, [state.items]);

  const loadCart = async () => {
    try {
      dispatch({ type: CART_ACTIONS.SET_LOADING, payload: true });
      const cartData = await SecureStore.getItemAsync('cart');
      if (cartData) {
        dispatch({ type: CART_ACTIONS.SET_CART, payload: JSON.parse(cartData) });
      } else {
        dispatch({ type: CART_ACTIONS.SET_LOADING, payload: false });
      }
    } catch (error) {
      console.log('Error loading cart:', error);
      dispatch({ type: CART_ACTIONS.SET_LOADING, payload: false });
    }
  };

  const saveCart = async () => {
    try {
      await SecureStore.setItemAsync('cart', JSON.stringify(state.items));
    } catch (error) {
      console.log('Error saving cart:', error);
    }
  };

  // Add item to cart
  const addToCart = (product, quantity = 1, seller = null) => {
    dispatch({
      type: CART_ACTIONS.ADD_ITEM,
      payload: { product, quantity, seller },
    });
  };

  // Remove item from cart
  const removeFromCart = (productId) => {
    dispatch({ type: CART_ACTIONS.REMOVE_ITEM, payload: productId });
  };

  // Update item quantity
  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      dispatch({
        type: CART_ACTIONS.UPDATE_QUANTITY,
        payload: { productId, quantity },
      });
    }
  };

  // Clear entire cart
  const clearCart = async () => {
    try {
      await SecureStore.deleteItemAsync('cart');
      dispatch({ type: CART_ACTIONS.CLEAR_CART });
    } catch (error) {
      console.log('Error clearing cart:', error);
    }
  };

  // Get item quantity
  const getItemQuantity = (productId) => {
    const item = state.items.find((item) => item.product._id === productId);
    return item ? item.quantity : 0;
  };

  // Check if item is in cart
  const isInCart = (productId) => {
    return state.items.some((item) => item.product._id === productId);
  };

  // Group items by seller
  const getItemsBySeller = () => {
    const grouped = {};
    state.items.forEach((item) => {
      const sellerId = item.seller?._id || item.product.business?._id || 'unknown';
      if (!grouped[sellerId]) {
        grouped[sellerId] = {
          seller: item.seller || item.product.business,
          items: [],
          subtotal: 0,
        };
      }
      grouped[sellerId].items.push(item);
      grouped[sellerId].subtotal += item.product.price * item.quantity;
    });
    return Object.values(grouped);
  };

  const value = {
    ...state,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    getItemQuantity,
    isInCart,
    getItemsBySeller,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};

// Hook to use cart context
export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

export default CartContext;
