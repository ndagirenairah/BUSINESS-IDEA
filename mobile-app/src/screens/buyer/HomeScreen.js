import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  FlatList,
  Dimensions,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { marketplaceService } from '../../services/api';
import ProductCard from '../../components/ProductCard';
import CategoryGrid from '../../components/CategoryGrid';
import { getGreeting, formatPrice } from '../../utils/helpers';

const { width } = Dimensions.get('window');

const HomeScreen = ({ navigation }) => {
  const { user, isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [categories, setCategories] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [newArrivals, setNewArrivals] = useState([]);
  const [deals, setDeals] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      
      // Load data in parallel
      const [categoriesRes, homeFeed] = await Promise.all([
        marketplaceService.getCategories(),
        marketplaceService.getHomeFeed().catch(() => null),
      ]);

      setCategories(categoriesRes?.categories || []);
      
      if (homeFeed) {
        setFeaturedProducts(homeFeed.featured || []);
        setNewArrivals(homeFeed.newArrivals || []);
        setDeals(homeFeed.deals || []);
      } else {
        // Fallback: load products directly
        const products = await marketplaceService.getProducts({ limit: 20 });
        setFeaturedProducts(products?.products || []);
      }
    } catch (error) {
      console.log('Error loading home data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }, []);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigation.navigate('Search', { query: searchQuery });
    }
  };

  const handleCategoryPress = (category) => {
    navigation.navigate('Category', { category });
  };

  const handleProductPress = (product) => {
    navigation.navigate('ProductDetails', { productId: product._id, product });
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.userName}>
            {isAuthenticated ? user?.name || 'Shopper' : 'Welcome to Marketplace'}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Notifications')}
          >
            <Ionicons name="notifications-outline" size={24} color="#333" />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>3</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products, categories..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity onPress={handleSearch}>
          <Ionicons name="arrow-forward-circle" size={28} color="#4A90A4" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderBanner = () => (
    <View style={styles.bannerContainer}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
      >
        <View style={[styles.banner, { backgroundColor: '#4A90A4' }]}>
          <View style={styles.bannerContent}>
            <Text style={styles.bannerTitle}>New User?</Text>
            <Text style={styles.bannerSubtitle}>Get 10% off on your first order!</Text>
            <TouchableOpacity style={styles.bannerBtn}>
              <Text style={styles.bannerBtnText}>Shop Now</Text>
            </TouchableOpacity>
          </View>
          <Ionicons name="gift" size={80} color="rgba(255,255,255,0.3)" />
        </View>
        
        <View style={[styles.banner, { backgroundColor: '#FF6B6B' }]}>
          <View style={styles.bannerContent}>
            <Text style={styles.bannerTitle}>Flash Sale!</Text>
            <Text style={styles.bannerSubtitle}>Up to 50% off selected items</Text>
            <TouchableOpacity style={styles.bannerBtn}>
              <Text style={styles.bannerBtnText}>View Deals</Text>
            </TouchableOpacity>
          </View>
          <Ionicons name="flash" size={80} color="rgba(255,255,255,0.3)" />
        </View>
      </ScrollView>
    </View>
  );

  const renderCategories = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Categories</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Categories')}>
          <Text style={styles.seeAll}>See All</Text>
        </TouchableOpacity>
      </View>
      <CategoryGrid
        categories={categories.slice(0, 8)}
        onCategoryPress={handleCategoryPress}
        size="small"
      />
    </View>
  );

  const renderProductSection = (title, products, onSeeAll) => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <TouchableOpacity onPress={onSeeAll}>
          <Text style={styles.seeAll}>See All</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={products.slice(0, 6)}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <View style={styles.horizontalCard}>
            <ProductCard
              product={item}
              onPress={() => handleProductPress(item)}
            />
          </View>
        )}
        contentContainerStyle={styles.horizontalList}
      />
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4A90A4" />
        <Text style={styles.loadingText}>Loading marketplace...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={['#4A90A4']}
          />
        }
      >
        {renderHeader()}
        {renderBanner()}
        {categories.length > 0 && renderCategories()}
        
        {featuredProducts.length > 0 &&
          renderProductSection('Featured Products', featuredProducts, () =>
            navigation.navigate('Products', { filter: 'featured' })
          )}
        
        {newArrivals.length > 0 &&
          renderProductSection('New Arrivals', newArrivals, () =>
            navigation.navigate('Products', { filter: 'new' })
          )}
        
        {deals.length > 0 &&
          renderProductSection('Hot Deals 🔥', deals, () =>
            navigation.navigate('Products', { filter: 'deals' })
          )}

        {/* All Products Grid */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Explore Products</Text>
          </View>
          <View style={styles.productsGrid}>
            {featuredProducts.slice(0, 10).map((product) => (
              <ProductCard
                key={product._id}
                product={product}
                onPress={() => handleProductPress(product)}
              />
            ))}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  greeting: {
    fontSize: 14,
    color: '#888',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    padding: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#FF6B6B',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
    color: '#333',
  },
  bannerContainer: {
    marginTop: 16,
  },
  banner: {
    width: width - 32,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    overflow: 'hidden',
  },
  bannerContent: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  bannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 12,
  },
  bannerBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  bannerBtnText: {
    color: '#4A90A4',
    fontWeight: '600',
    fontSize: 14,
  },
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  seeAll: {
    fontSize: 14,
    color: '#4A90A4',
    fontWeight: '600',
  },
  horizontalList: {
    paddingHorizontal: 16,
  },
  horizontalCard: {
    marginRight: 12,
    width: (width - 48) / 2,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
});

export default HomeScreen;
