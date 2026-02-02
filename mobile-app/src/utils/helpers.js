// Format price in UGX
export const formatPrice = (amount, currency = 'UGX') => {
  if (!amount && amount !== 0) return 'UGX 0';
  
  const formatted = new Intl.NumberFormat('en-UG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
  
  return `${currency} ${formatted}`;
};

// Format date
export const formatDate = (dateString, options = {}) => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  };
  
  return date.toLocaleDateString('en-UG', defaultOptions);
};

// Format date with time
export const formatDateTime = (dateString) => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  return date.toLocaleString('en-UG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// Format relative time (e.g., "2 hours ago")
export const formatRelativeTime = (dateString) => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  
  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  
  return formatDate(dateString);
};

// Truncate text
export const truncateText = (text, maxLength = 50) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// Validate email
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate Ugandan phone number
export const isValidUgandaPhone = (phone) => {
  // Remove spaces and dashes
  const cleaned = phone.replace(/[\s-]/g, '');
  
  // Check for valid Uganda phone number formats
  // 0712345678, +256712345678, 256712345678
  const phoneRegex = /^(\+?256|0)?[37][0-9]{8}$/;
  return phoneRegex.test(cleaned);
};

// Format phone number
export const formatPhone = (phone) => {
  if (!phone) return '';
  
  const cleaned = phone.replace(/[\s-]/g, '');
  
  // Convert to local format
  if (cleaned.startsWith('+256')) {
    return '0' + cleaned.substring(4);
  }
  if (cleaned.startsWith('256')) {
    return '0' + cleaned.substring(3);
  }
  
  return cleaned;
};

// Get phone network from number (for mobile money)
export const getPhoneNetwork = (phone) => {
  const cleaned = phone.replace(/[\s-]/g, '');
  let digits = cleaned;
  
  // Extract the relevant digits
  if (cleaned.startsWith('+256')) {
    digits = cleaned.substring(4);
  } else if (cleaned.startsWith('256')) {
    digits = cleaned.substring(3);
  } else if (cleaned.startsWith('0')) {
    digits = cleaned.substring(1);
  }
  
  const prefix = digits.substring(0, 2);
  
  // MTN Uganda prefixes
  const mtnPrefixes = ['77', '78', '76', '39'];
  // Airtel Uganda prefixes
  const airtelPrefixes = ['70', '75', '74'];
  
  if (mtnPrefixes.includes(prefix)) return 'mtn';
  if (airtelPrefixes.includes(prefix)) return 'airtel';
  
  return 'unknown';
};

// Get initials from name
export const getInitials = (name) => {
  if (!name) return '';
  
  const words = name.trim().split(' ');
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
};

// Generate random color for avatar
export const getAvatarColor = (name) => {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
    '#85C1E9', '#F8B500', '#00CED1', '#FF69B4',
  ];
  
  if (!name) return colors[0];
  
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
};

// Calculate discount percentage
export const calculateDiscount = (originalPrice, salePrice) => {
  if (!originalPrice || !salePrice) return 0;
  if (originalPrice <= salePrice) return 0;
  
  return Math.round(((originalPrice - salePrice) / originalPrice) * 100);
};

// Format order status
export const formatOrderStatus = (status) => {
  const statusMap = {
    pending: { label: 'Pending', color: '#FFA500' },
    confirmed: { label: 'Confirmed', color: '#4169E1' },
    processing: { label: 'Processing', color: '#9370DB' },
    shipped: { label: 'Shipped', color: '#20B2AA' },
    out_for_delivery: { label: 'Out for Delivery', color: '#32CD32' },
    delivered: { label: 'Delivered', color: '#228B22' },
    cancelled: { label: 'Cancelled', color: '#DC143C' },
    refunded: { label: 'Refunded', color: '#808080' },
  };
  
  return statusMap[status] || { label: status, color: '#666' };
};

// Format payment status
export const formatPaymentStatus = (status) => {
  const statusMap = {
    pending: { label: 'Pending', color: '#FFA500' },
    completed: { label: 'Paid', color: '#228B22' },
    failed: { label: 'Failed', color: '#DC143C' },
    refunded: { label: 'Refunded', color: '#808080' },
    escrow: { label: 'In Escrow', color: '#4169E1' },
  };
  
  return statusMap[status] || { label: status, color: '#666' };
};

// Format delivery method
export const formatDeliveryMethod = (method) => {
  const methodMap = {
    safeboda: { label: 'SafeBoda', icon: 'bicycle' },
    faras: { label: 'Faras', icon: 'car' },
    personal: { label: 'Personal Delivery', icon: 'person' },
    pickup: { label: 'Self Pickup', icon: 'storefront' },
  };
  
  return methodMap[method] || { label: method, icon: 'cube' };
};

// Debounce function
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Format file size
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Get greeting based on time
export const getGreeting = () => {
  const hour = new Date().getHours();
  
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};
