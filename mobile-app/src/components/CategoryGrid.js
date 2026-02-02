import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Category icons mapping
const categoryIcons = {
  'Electronics': 'phone-portrait-outline',
  'Fashion': 'shirt-outline',
  'Home & Garden': 'home-outline',
  'Health & Beauty': 'heart-outline',
  'Sports': 'football-outline',
  'Food & Drinks': 'fast-food-outline',
  'Automotive': 'car-outline',
  'Books': 'book-outline',
  'Toys & Games': 'game-controller-outline',
  'Services': 'briefcase-outline',
  'default': 'grid-outline',
};

// Category colors
const categoryColors = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Purple
  '#85C1E9', // Light Blue
];

const CategoryCard = ({ category, index, onPress, size = 'medium' }) => {
  const icon = categoryIcons[category.name] || categoryIcons.default;
  const color = categoryColors[index % categoryColors.length];
  
  const isSmall = size === 'small';
  const isMedium = size === 'medium';
  
  return (
    <TouchableOpacity
      style={[
        styles.card,
        isSmall && styles.cardSmall,
        isMedium && styles.cardMedium,
      ]}
      onPress={() => onPress(category)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: color + '20' }]}>
        {category.image ? (
          <Image
            source={{ uri: category.image }}
            style={styles.categoryImage}
            resizeMode="cover"
          />
        ) : (
          <Ionicons name={icon} size={isSmall ? 24 : 32} color={color} />
        )}
      </View>
      <Text
        style={[styles.name, isSmall && styles.nameSmall]}
        numberOfLines={2}
      >
        {category.name}
      </Text>
      {category.productCount !== undefined && !isSmall && (
        <Text style={styles.count}>
          {category.productCount} items
        </Text>
      )}
    </TouchableOpacity>
  );
};

const CategoryGrid = ({
  categories,
  onCategoryPress,
  horizontal = false,
  showAll = false,
  maxItems = 8,
  size = 'medium',
}) => {
  const displayCategories = showAll ? categories : categories.slice(0, maxItems);

  if (horizontal) {
    return (
      <FlatList
        data={displayCategories}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item._id || item.name}
        renderItem={({ item, index }) => (
          <CategoryCard
            category={item}
            index={index}
            onPress={onCategoryPress}
            size={size}
          />
        )}
        contentContainerStyle={styles.horizontalList}
      />
    );
  }

  return (
    <View style={styles.grid}>
      {displayCategories.map((category, index) => (
        <CategoryCard
          key={category._id || category.name}
          category={category}
          index={index}
          onPress={onCategoryPress}
          size={size}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  horizontalList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    alignItems: 'center',
    marginBottom: 16,
    width: '23%',
  },
  cardSmall: {
    width: 70,
    marginRight: 12,
  },
  cardMedium: {
    width: '30%',
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  categoryImage: {
    width: '100%',
    height: '100%',
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  nameSmall: {
    fontSize: 11,
  },
  count: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
});

export { CategoryCard };
export default CategoryGrid;
