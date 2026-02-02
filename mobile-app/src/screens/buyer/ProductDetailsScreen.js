import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { marketplaceService, buyerService, chatService } from '../../services/api';
import { formatPrice, formatRelativeTime } from '../../utils/helpers';
import config from '../../config/api';

const { width } = Dimensions.get('window');

const ProductDetailsScreen = ({ route, navigation }) => {
  const { productId, product: initialProduct } = route.params;
  const { addToCart, isInCart, getItemQuantity, updateQuantity } = useCart();
  const { isAuthenticated } = useAuth();
  
  const [product, setProduct] = useState(initialProduct || null);
  const [isLoading, setIsLoading] = useState(!initialProduct);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!initialProduct || !initialProduct.description) {
      loadProductDetails();
    }
  }, [productId]);

  const loadProductDetails = async () => {
    try {
      setIsLoading(true);
      const response = await marketplaceService.getProductDetails(productId);
      setProduct(response.product);
    } catch (error) {
      console.log('Error loading product:', error);
      Alert.alert('Error', 'Failed to load product details');
    } finally {
      setIsLoading(false);
    }
  };

  const inCart = product ? isInCart(product._id) : false;
  const cartQuantity = product ? getItemQuantity(product._id) : 0;

  const getImageUri = (image) => {
    if (image?.startsWith('http')) return image;
    return `${config.API_URL}/${image}`;
  };

  const images = product?.images?.length > 0
    ? product.images
    : ['https://via.placeholder.com/400x400?text=No+Image'];

  const handleAddToCart = () => {
    addToCart(product, quantity, product.business);
  };

  const handleBuyNow = () => {
    if (!inCart) {
      addToCart(product, quantity, product.business);
    }
    navigation.navigate('Cart');
  };

  const handleWishlist = async () => {
    if (!isAuthenticated) {
      navigation.navigate('Login');
      return;
    }
    try {
      if (isWishlisted) {
        await buyerService.removeFromWishlist(product._id);
      } else {
        await buyerService.addToWishlist(product._id);
      }
      setIsWishlisted(!isWishlisted);
    } catch (error) {
      console.log('Wishlist error:', error);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${product.name} for ${formatPrice(product.price)} on Marketplace!`,
      });
    } catch (error) {
      console.log('Share error:', error);
    }
  };

  const handleChatSeller = async () => {
    if (!isAuthenticated) {
      navigation.navigate('Login');
      return;
    }
    try {
      const response = await chatService.startConversation(
        product.business._id,
        product._id
      );
      navigation.navigate('Chat', { conversation: response.conversation });
    } catch (error) {
      Alert.alert('Error', 'Failed to start conversation');
    }
  };

  const handleMakeOffer = () => {
    if (!isAuthenticated) {
      navigation.navigate('Login');
      return;
    }
    navigation.navigate('MakeOffer', { product });
  };

  if (isLoading || !product) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A90A4" />
      </View>
    );
  }

  const discountPercent = product.compareAtPrice
    ? Math.round(
        ((product.compareAtPrice - product.price) / product.compareAtPrice) * 100
      )
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerBtn} onPress={handleShare}>
            <Ionicons name="share-outline" size={24} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerBtn} onPress={handleWishlist}>
            <Ionicons
              name={isWishlisted ? 'heart' : 'heart-outline'}
              size={24}
              color={isWishlisted ? '#FF6B6B' : '#333'}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Image Gallery */}
        <View style={styles.imageContainer}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => {
              const index = Math.round(e.nativeEvent.contentOffset.x / width);
              setSelectedImageIndex(index);
            }}
          >
            {images.map((image, index) => (
              <Image
                key={index}
                source={{ uri: getImageUri(image) }}
                style={styles.mainImage}
                resizeMode="cover"
              />
            ))}
          </ScrollView>
          
          {/* Image Dots */}
          {images.length > 1 && (
            <View style={styles.dotsContainer}>
              {images.map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.dot,
                    index === selectedImageIndex && styles.activeDot,
                  ]}
                />
              ))}
            </View>
          )}

          {/* Discount Badge */}
          {discountPercent > 0 && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountText}>-{discountPercent}%</Text>
            </View>
          )}
        </View>

        {/* Product Info */}
        <View style={styles.infoContainer}>
          {/* Category */}
          {product.category && (
            <Text style={styles.category}>
              {product.category.name || product.category}
            </Text>
          )}

          {/* Title */}
          <Text style={styles.title}>{product.name}</Text>

          {/* Rating */}
          {product.stats?.averageRating > 0 && (
            <TouchableOpacity
              style={styles.ratingContainer}
              onPress={() => navigation.navigate('Reviews', { productId: product._id })}
            >
              <View style={styles.stars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Ionicons
                    key={star}
                    name={
                      star <= product.stats.averageRating
                        ? 'star'
                        : star - 0.5 <= product.stats.averageRating
                        ? 'star-half'
                        : 'star-outline'
                    }
                    size={16}
                    color="#FFB800"
                  />
                ))}
              </View>
              <Text style={styles.ratingText}>
                {product.stats.averageRating.toFixed(1)}
              </Text>
              <Text style={styles.reviewsText}>
                ({product.stats.totalReviews} reviews)
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#888" />
            </TouchableOpacity>
          )}

          {/* Price */}
          <View style={styles.priceContainer}>
            <Text style={styles.price}>{formatPrice(product.price)}</Text>
            {product.compareAtPrice > product.price && (
              <Text style={styles.oldPrice}>
                {formatPrice(product.compareAtPrice)}
              </Text>
            )}
          </View>

          {/* Stock Status */}
          <View style={styles.stockContainer}>
            {product.stock > 0 ? (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                <Text style={styles.inStock}>
                  In Stock ({product.stock} available)
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="close-circle" size={18} color="#FF6B6B" />
                <Text style={styles.outOfStock}>Out of Stock</Text>
              </>
            )}
          </View>

          {/* Seller Info */}
          {product.business && (
            <TouchableOpacity
              style={styles.sellerCard}
              onPress={() =>
                navigation.navigate('Shop', { businessId: product.business._id })
              }
            >
              <View style={styles.sellerAvatar}>
                <Text style={styles.sellerInitial}>
                  {product.business.businessName?.charAt(0) || 'S'}
                </Text>
              </View>
              <View style={styles.sellerInfo}>
                <Text style={styles.sellerName}>
                  {product.business.businessName}
                </Text>
                <Text style={styles.sellerLocation}>
                  📍 {product.business.location || 'Uganda'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.chatSellerBtn}
                onPress={handleChatSeller}
              >
                <Ionicons name="chatbubble-outline" size={20} color="#4A90A4" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.description}>
              {product.description || 'No description available.'}
            </Text>
          </View>

          {/* Specifications */}
          {product.specifications && product.specifications.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Specifications</Text>
              {product.specifications.map((spec, index) => (
                <View key={index} style={styles.specRow}>
                  <Text style={styles.specLabel}>{spec.key}</Text>
                  <Text style={styles.specValue}>{spec.value}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Make Offer */}
          {product.allowOffers && (
            <TouchableOpacity
              style={styles.offerBtn}
              onPress={handleMakeOffer}
            >
              <Ionicons name="pricetag-outline" size={20} color="#4A90A4" />
              <Text style={styles.offerBtnText}>Make an Offer</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Action Bar */}
      {product.stock > 0 && (
        <View style={styles.bottomBar}>
          <View style={styles.quantitySelector}>
            <TouchableOpacity
              style={styles.quantityBtn}
              onPress={() => setQuantity(Math.max(1, quantity - 1))}
            >
              <Ionicons name="remove" size={20} color="#4A90A4" />
            </TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity
              style={styles.quantityBtn}
              onPress={() => setQuantity(Math.min(product.stock, quantity + 1))}
            >
              <Ionicons name="add" size={20} color="#4A90A4" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.addToCartBtn}
            onPress={handleAddToCart}
          >
            <Ionicons name="cart-outline" size={20} color="#4A90A4" />
            <Text style={styles.addToCartText}>
              {inCart ? `In Cart (${cartQuantity})` : 'Add to Cart'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.buyNowBtn} onPress={handleBuyNow}>
            <Text style={styles.buyNowText}>Buy Now</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  imageContainer: {
    width: width,
    height: width,
    position: 'relative',
  },
  mainImage: {
    width: width,
    height: width,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 16,
    left: 0,
    right: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 4,
  },
  activeDot: {
    backgroundColor: '#fff',
    width: 24,
  },
  discountBadge: {
    position: 'absolute',
    top: 100,
    left: 16,
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  discountText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoContainer: {
    padding: 16,
  },
  category: {
    fontSize: 12,
    color: '#4A90A4',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stars: {
    flexDirection: 'row',
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  reviewsText: {
    fontSize: 14,
    color: '#888',
    marginLeft: 4,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  price: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4A90A4',
  },
  oldPrice: {
    fontSize: 18,
    color: '#999',
    textDecorationLine: 'line-through',
    marginLeft: 12,
  },
  stockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  inStock: {
    fontSize: 14,
    color: '#4CAF50',
    marginLeft: 6,
  },
  outOfStock: {
    fontSize: 14,
    color: '#FF6B6B',
    marginLeft: 6,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  sellerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4A90A4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sellerInitial: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  sellerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sellerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  sellerLocation: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  chatSellerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },
  specRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  specLabel: {
    flex: 1,
    fontSize: 14,
    color: '#888',
  },
  specValue: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    textAlign: 'right',
  },
  offerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F4F8',
    padding: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  offerBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A90A4',
    marginLeft: 8,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingBottom: 28,
  },
  quantitySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  quantityBtn: {
    padding: 8,
  },
  quantityText: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 30,
    textAlign: 'center',
  },
  addToCartBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F4F8',
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 8,
  },
  addToCartText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A90A4',
    marginLeft: 6,
  },
  buyNowBtn: {
    backgroundColor: '#4A90A4',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buyNowText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
});

export default ProductDetailsScreen;
