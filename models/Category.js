const mongoose = require("mongoose");

// Predefined categories with subcategories
const CATEGORIES = {
  electronics: {
    name: "Electronics",
    icon: "📱",
    subcategories: [
      "Phones & Tablets",
      "Laptops & Computers",
      "TVs & Audio",
      "Cameras",
      "Gaming",
      "Accessories",
      "Other Electronics",
    ],
  },
  fashion: {
    name: "Fashion & Clothing",
    icon: "👗",
    subcategories: [
      "Men's Clothing",
      "Women's Clothing",
      "Kids' Clothing",
      "Shoes",
      "Bags & Luggage",
      "Watches & Jewelry",
      "Accessories",
    ],
  },
  home: {
    name: "Home & Living",
    icon: "🏡",
    subcategories: [
      "Furniture",
      "Kitchen & Dining",
      "Bedding & Bath",
      "Home Décor",
      "Lighting",
      "Garden & Outdoor",
      "Storage & Organization",
    ],
  },
  beauty: {
    name: "Beauty & Health",
    icon: "💄",
    subcategories: [
      "Skincare",
      "Makeup",
      "Haircare",
      "Fragrances",
      "Personal Care",
      "Fitness & Sports",
      "Health & Wellness",
    ],
  },
  vehicles: {
    name: "Vehicles",
    icon: "🚗",
    subcategories: [
      "Cars",
      "Motorcycles",
      "Bicycles",
      "Auto Parts & Accessories",
      "Boats & Marine",
      "Commercial Vehicles",
    ],
  },
  books: {
    name: "Books & Stationery",
    icon: "📚",
    subcategories: [
      "Fiction",
      "Non-Fiction",
      "Educational",
      "Children's Books",
      "Magazines",
      "Office Supplies",
      "Art Supplies",
    ],
  },
  services: {
    name: "Services",
    icon: "🛠️",
    subcategories: [
      "Cleaning",
      "Repairs & Maintenance",
      "Tutoring & Lessons",
      "Delivery & Moving",
      "Events & Photography",
      "Beauty & Wellness",
      "Professional Services",
    ],
  },
  food: {
    name: "Food & Groceries",
    icon: "🍔",
    subcategories: [
      "Fresh Produce",
      "Packaged Foods",
      "Beverages",
      "Snacks",
      "Frozen Foods",
      "Ready-to-Eat",
      "Specialty Foods",
    ],
  },
  others: {
    name: "Others",
    icon: "🔄",
    subcategories: [
      "Pets & Animals",
      "Baby & Kids",
      "Toys & Games",
      "Music & Instruments",
      "Collectibles",
      "Miscellaneous",
    ],
  },
};

// Get all category keys
const CATEGORY_KEYS = Object.keys(CATEGORIES);

// Get all categories as array for API responses
const getCategoriesArray = () => {
  return Object.entries(CATEGORIES).map(([key, value]) => ({
    id: key,
    name: value.name,
    icon: value.icon,
    subcategories: value.subcategories,
  }));
};

// Get category by key
const getCategoryByKey = (key) => {
  const category = CATEGORIES[key.toLowerCase()];
  if (!category) return null;
  return {
    id: key.toLowerCase(),
    name: category.name,
    icon: category.icon,
    subcategories: category.subcategories,
  };
};

// Validate category
const isValidCategory = (category) => {
  return CATEGORY_KEYS.includes(category.toLowerCase());
};

// Validate subcategory
const isValidSubcategory = (category, subcategory) => {
  const cat = CATEGORIES[category.toLowerCase()];
  if (!cat) return false;
  return cat.subcategories.includes(subcategory);
};

// Category Schema (for dynamic categories if needed later)
const categorySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
    },
    icon: {
      type: String,
      default: "📦",
    },
    image: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      default: "",
    },
    subcategories: [
      {
        name: String,
        image: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    // Stats
    productCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

const Category = mongoose.model("Category", categorySchema);

module.exports = {
  Category,
  CATEGORIES,
  CATEGORY_KEYS,
  getCategoriesArray,
  getCategoryByKey,
  isValidCategory,
  isValidSubcategory,
};
