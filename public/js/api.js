// API Service Wrappers for HTTP Operations
const API_URL = window.location.origin;

// Retrieve JWT token from localStorage
function getAuthToken() {
  return localStorage.getItem('token');
}

// Save JWT token
function setAuthToken(token) {
  localStorage.setItem('token', token);
}

// Clear JWT token and user details
function clearAuth() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

// Base Fetch function with automatic header injection
async function apiFetch(endpoint, options = {}) {
  const url = `${API_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config = {
    ...options,
    headers
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.message || `Request failed with status ${response.status}`;
      throw new Error(errorMsg);
    }

    return data;
  } catch (error) {
    console.error(`API Fetch Error [${endpoint}]:`, error.message);
    throw error;
  }
}

// Authentication APIs
const AuthAPI = {
  login: async (email, password) => {
    return apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },
  
  register: async (userData) => {
    return apiFetch('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  }
};

// User / Citizen APIs
const UserAPI = {
  getNearbyAmbulances: async (latitude, longitude) => {
    return apiFetch(`/api/user/ambulances?latitude=${latitude}&longitude=${longitude}`, {
      method: 'GET'
    });
  }
};

// Driver APIs
const DriverAPI = {
  updateAvailability: async (isAvailable) => {
    return apiFetch('/api/driver/availability', {
      method: 'PUT',
      body: JSON.stringify({ is_available: isAvailable })
    });
  },
  
  updateLocation: async (latitude, longitude) => {
    return apiFetch('/api/driver/location', {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude })
    });
  }
};

// Emergency Workflow APIs
const EmergencyAPI = {
  createRequest: async (latitude, longitude, requestUuid = null) => {
    return apiFetch('/api/emergency/request', {
      method: 'POST',
      body: JSON.stringify({ latitude, longitude, request_uuid: requestUuid })
    });
  },
  
  getStatus: async (requestId) => {
    return apiFetch(`/api/emergency/status/${requestId}`, {
      method: 'GET'
    });
  },
  
  performAction: async (requestId, action) => {
    return apiFetch(`/api/emergency/action/${requestId}`, {
      method: 'PUT',
      body: JSON.stringify({ action })
    });
  }
};

// Notification APIs
const NotificationAPI = {
  getNotifications: async () => {
    return apiFetch('/api/notifications', {
      method: 'GET'
    });
  },
  
  markAllRead: async () => {
    return apiFetch('/api/notifications/read', {
      method: 'PUT'
    });
  }
};
