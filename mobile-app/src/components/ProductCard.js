import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../utils/helpers';
import config from '../config/api';

const { width } = Dimensions.get('window');
const cardWidth = (width - 48) / 2;

const ProductCard = ({ product, onPress, showAddToCart }) => {
  const { addToCart, isInCart, getItemQuantity, updateQuantity } = useCart();
  
  // Default showAddToCart to true if not provided
  const shouldShowAddToCart = showAddToCart !== false;
  
  const inCart = isInCart(product._id);
  const quantity = getItemQuantity(product._id);
  
  const getImageUri = () => {
    if (product.images && product.images.length > 0) {
      const image = product.images[0];
      if (image.startsWith('http')) return image;
      return `${config.API_URL}/${image}`;
    }
    return 'https://via.placeholder.com/200x200?text=No+Image';
  };

  const handleAddToCart = () => {
    addToCart(product, 1, product.business);
  };

  const handleIncrease = () => {
    updateQuantity(product._id, quantity + 1);
  };

  const handleDecrease = () => {
    updateQuantity(product._id, quantity - 1);
  };

  const discountPercent = product.compareAtPrice
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: getImageUri() }}
          style={styles.image}
          resizeMode="cover"
        />
        
        {discountPercent > 0 ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discountPercent}%</Text>
          </View>
        ) : null}
        
        <TouchableOpacity style={styles.wishlistBtn}>
          <Ionicons name="heart-outline" size={20} color="#FF6B6B" />
        </TouchableOpacity>
        
        {product.stock === 0 ? (
          <View style={styles.outOfStockOverlay}>
            <Text style={styles.outOfStockText}>Out of Stock</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.info}>
        {product.category ? (
          <Text style={styles.category} numberOfLines={1}>
            {typeof product.category === 'string' ? product.category : product.category.name}
          </Text>
        ) : null}
        
        <Text style={styles.title} numberOfLines={2}>
          {product.name}
        </Text>
        
        {product.stats && product.stats.averageRating > 0 ? (
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={14} color="#FFB800" />
            <Text style={styles.rating}>
              {product.stats.averageRating.toFixed(1)}
            </Text>
            <Text style={styles.reviews}>
              ({product.stats.totalReviews} reviews)
            </Text>
          </View>
        ) : null}
        
        <View style={styles.priceContainer}>
          <Text style={styles.price}>{formatPrice(product.price)}</Text>
          {product.compareAtPrice > product.price ? (
            <Text style={styles.oldPrice}>
              {formatPrice(product.compareAtPrice)}
            </Text>
          ) : null}
        </View>
        
        {product.business ? (
          <Text style={styles.seller} numberOfLines={1}>
            by {product.business.businessName || 'Shop'}
          </Text>
        ) : null}

        {shouldShowAddToCart && product.stock > 0 ? (
          <View style={styles.cartSection}>
            {!inCart ? (
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddToCart}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.quantityContainer}>
                <TouchableOpacity
                  style={styles.quantityBtn}
                  onPress={handleDecrease}
                >
                  <Ionicons name="remove" size={16} color="#4A90A4" />
                </TouchableOpacity>
                <Text style={styles.quantity}>{quantity}</Text>
                <TouchableOpacity
                  style={styles.quantityBtn}
                  onPress={handleIncrease}
                >
                  <Ionicons name="add" size={16} color="#4A90A4" />
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: cardWidth,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    elevation: 3,
    overflow: 'hidden',
  },
  imageContainer: {
    width: '100%',
    height: cardWidth,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  discountBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  discountText: {
    color: '#fff',
    fontSize: 12,
  },
  wishlistBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
  },
  outOfStockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  outOfStockText: {
    color: '#fff',
    fontSize: 14,
  },
  info: {
    padding: 12,
  },
  category: {
    fontSize: 11,
    color: '#4A90A4',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    color: '#333',
    marginBottom: 6,
    lineHeight: 18,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  rating: {
    fontSize: 12,
    color: '#333',
    marginLeft: 4,
  },
  reviews: {
    fontSize: 11,
    color: '#888',
    marginLeft: 4,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  price: {
    fontSize: 16,
    color: '#4A90A4',
  },
  oldPrice: {
    fontSize: 12,
    color: '#999',
    textDecorationLine: 'line-through',
    marginLeft: 6,
  },
  seller: {
    fontSize: 11,
    color: '#888',
    marginBottom: 8,
  },
  cartSection: {
    marginTop: 4,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A90A4',
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    marginLeft: 4,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#4A90A4',
    borderRadius: 8,
    paddingVertical: 4,
  },
  quantityBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  quantity: {
    fontSize: 14,
    color: '#333',
    minWidth: 24,
    textAlign: 'center',
  },
});

export default ProductCard;
