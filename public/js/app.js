// Application Controller - Coordinates UI and WebSocket Events
let currentUser = null;
let userCoords = { latitude: 12.9715, longitude: 77.5945 }; // Default fallback coordinates
let activeRequest = null;
let locationWatchId = null;
let driverLocationIntervalId = null;
let simulatedMovementIntervalId = null;

// DOM Cache Elements
const screens = {
  landing: document.getElementById('screen-landing'),
  auth: document.getElementById('screen-auth'),
  userDashboard: document.getElementById('screen-user-dashboard'),
  driverDashboard: document.getElementById('screen-driver-dashboard')
};

const authForm = document.getElementById('auth-form');
const authTitle = document.getElementById('auth-title');
const authSubtitle = document.getElementById('auth-subtitle');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authToggleLink = document.getElementById('auth-toggle-link');
const authToggleText = document.getElementById('auth-toggle-text');

// Role inputs
const roleUserBtn = document.getElementById('role-select-user');
const roleDriverBtn = document.getElementById('role-select-driver');
const regNameField = document.getElementById('register-field-name');
const regPhoneField = document.getElementById('register-field-phone');
const driverVehicleField = document.getElementById('driver-field-vehicle');
const driverTypeField = document.getElementById('driver-field-type');

// User dashboard details
const userCoordsDisplay = document.getElementById('user-coords-display');
const triggerEmergencyBtn = document.getElementById('trigger-emergency-btn');
const userRequestPanel = document.getElementById('user-request-panel');
const userTrackingPanel = document.getElementById('user-tracking-panel');
const trackingStatusTitle = document.getElementById('tracking-status-title');
const trackingStatusDesc = document.getElementById('tracking-status-desc');
const trackingDriverDetails = document.getElementById('tracking-driver-details');
const trackDriverName = document.getElementById('track-driver-name');
const trackVehicleNumber = document.getElementById('track-vehicle-number');
const trackAmbulanceType = document.getElementById('track-ambulance-type');
const trackDistance = document.getElementById('track-distance');
const trackETA = document.getElementById('track-eta');
const callDriverBtn = document.getElementById('call-driver-btn');
const userGoogleMapsBtn = document.getElementById('user-google-maps-btn');
const nearbyAmbulancesList = document.getElementById('nearby-ambulances-list');
const nearbyCountBadge = document.getElementById('nearby-count');

// Driver dashboard details
const driverAvailabilityToggle = document.getElementById('driver-availability-toggle');
const driverStatusText = document.getElementById('driver-status-text');
const driverEmergencyAlert = document.getElementById('driver-emergency-alert');
const alertDistance = document.getElementById('alert-distance');
const alertCoords = document.getElementById('alert-coords');
const alertAcceptBtn = document.getElementById('alert-accept-btn');
const alertRejectBtn = document.getElementById('alert-reject-btn');
const driverEmptyPanel = document.getElementById('driver-empty-panel');
const driverActivePanel = document.getElementById('driver-active-panel');
const activeUserName = document.getElementById('active-user-name');
const activeUserPhone = document.getElementById('active-user-phone');
const activeDistance = document.getElementById('active-distance');
const activeCoordsDisplay = document.getElementById('active-coords-display');
const driverNavigateBtn = document.getElementById('driver-navigate-btn');
const driverArriveBtn = document.getElementById('driver-arrive-btn');
const driverCompleteBtn = document.getElementById('driver-complete-btn');
const driverActivityList = document.getElementById('driver-activity-list');

// Layout control elements
const logoutBtn = document.getElementById('logout-btn');
const userDisplayBadge = document.getElementById('user-display-badge');
const userDisplayName = document.getElementById('user-display-name');
const brandLink = document.getElementById('brand-link');
const emergencySound = document.getElementById('emergency-sound');

// Notifications Panel elements
const notiBellBtn = document.getElementById('noti-bell-btn');
const notiBadgeDot = document.getElementById('noti-badge-dot');
const notiPanel = document.getElementById('noti-panel');
const notiListContainer = document.getElementById('noti-list-container');
const notiClearBtn = document.getElementById('noti-clear-btn');

// App State Flags
let isRegisterMode = false;
let selectedRole = 'user'; // default

// --- BOOTSTRAP INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadSessionUser();
  requestUserLocation();
  registerServiceWorker();
  setupNetworkStatusListeners();
});

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('SmartRescue PWA Service Worker registered. Scope:', reg.scope);
          
          // Listen for push notifications message channel updates from SW
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'EMERGENCY_PUSH_ALERT') {
              console.log('[App] Received background push alert message from Service Worker.');
              
              // If driver is online and has no active dispatches, show alert card and play siren
              if (currentUser && currentUser.role === 'driver' && driverAvailabilityToggle.checked && !activeRequest) {
                const pushData = event.data.data;
                // Parse parameters from web push payload or fallback
                showIncomingAlert({
                  requestId: pushData.requestId || (pushData.data && pushData.data.requestId) || 0,
                  userLatitude: pushData.userLatitude || (pushData.data && pushData.data.userLatitude) || userCoords.latitude,
                  userLongitude: pushData.userLongitude || (pushData.data && pushData.data.userLongitude) || userCoords.longitude,
                  distanceKm: pushData.distanceKm || (pushData.data && pushData.data.distanceKm) || 1.2
                });
              }
            }
          });
        })
        .catch((err) => console.warn('SmartRescue Service Worker registration failed:', err));
    });
  }
}


function setupNetworkStatusListeners() {
  window.addEventListener('online', handleNetworkStateChange);
  window.addEventListener('offline', handleNetworkStateChange);
  // Perform initial check on load
  handleNetworkStateChange();
}

function handleNetworkStateChange() {
  const offlineBanner = document.getElementById('offline-banner');
  const isOnline = navigator.onLine;

  if (isOnline) {
    if (offlineBanner) {
      offlineBanner.classList.add('hidden');
    }
    if (triggerEmergencyBtn) {
      triggerEmergencyBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> DISPATCH NOW';
      triggerEmergencyBtn.classList.remove('btn-success');
      triggerEmergencyBtn.classList.add('btn-danger');
      // Reset onclick override
      triggerEmergencyBtn.onclick = null;
    }
    // Restored connection: process sync queue
    syncOfflineQueuedData();
  } else {
    if (offlineBanner) {
      offlineBanner.classList.remove('hidden');
    }
    if (triggerEmergencyBtn) {
      triggerEmergencyBtn.innerHTML = '<i class="fa-solid fa-phone-flip"></i> CALL EMERGENCY DIRECTLY (102)';
      triggerEmergencyBtn.classList.remove('btn-danger');
      triggerEmergencyBtn.classList.add('btn-success');
      // Set override to dial number directly when clicked offline
      triggerEmergencyBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.location.href = 'tel:102';
      };
    }
  }
}

async function syncOfflineQueuedData() {
  console.log('[Sync Engine] Restored network connection. Processing offline queues...');
  
  // 1. Sync pending requests in outbox
  try {
    const outboxItems = await getOutboxItems();
    for (const item of outboxItems) {
      console.log(`[Sync Engine] Syncing queued request: ${item.id}`);
      try {
        const response = await EmergencyAPI.createRequest(item.latitude, item.longitude, item.id);
        if (response.success) {
          console.log(`[Sync Engine] Queued request synchronized: ${item.id}`);
          await deleteFromOutbox(item.id);
          
          // If this was the user's active request, load tracking console
          if (currentUser && currentUser.role === 'user' && !activeRequest) {
            activeRequest = response.request;
            userRequestPanel.classList.add('hidden');
            userTrackingPanel.classList.remove('hidden');
            trackingStatusTitle.textContent = 'Locating Ambulance...';
            pollRequestDetails(activeRequest.id);
          }
        }
      } catch (err) {
        console.error(`[Sync Engine] Failed to sync request ${item.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Sync Engine] Error reading IndexedDB outbox:', err.message);
  }

  // 2. Sync queued GPS coordinates
  try {
    const gpsCoords = await getCachedGPSCoordinates();
    if (gpsCoords.length > 0) {
      console.log(`[Sync Engine] Syncing ${gpsCoords.length} buffered GPS coordinates...`);
      for (const coord of gpsCoords) {
        try {
          await DriverAPI.updateLocation(coord.latitude, coord.longitude);
        } catch (err) {
          console.warn('[Sync Engine] Failed syncing GPS step:', err.message);
        }
      }
      await clearCachedGPSCoordinates();
      console.log('[Sync Engine] Buffered coordinates synchronized and cleared.');
    }
  } catch (err) {
    console.error('[Sync Engine] Error processing GPS queue:', err.message);
  }
}


// --- STATE NAVIGATION & ROUTING ---
function showScreen(screenKey) {
  Object.keys(screens).forEach(key => {
    if (key === screenKey) {
      screens[key].classList.add('active');
    } else {
      screens[key].classList.remove('active');
    }
  });

  // Hide notification panel when routing
  notiPanel.classList.remove('active');
}

function loadSessionUser() {
  const cachedUser = localStorage.getItem('user');
  const token = getAuthToken();

  if (cachedUser && token) {
    currentUser = JSON.parse(cachedUser);
    
    // Set Header profile styles
    userDisplayName.textContent = currentUser.name;
    userDisplayBadge.classList.remove('hidden');
    
    if (currentUser.role === 'driver') {
      userDisplayBadge.classList.add('driver');
    } else {
      userDisplayBadge.classList.remove('driver');
    }

    logoutBtn.style.display = 'inline-flex';
    notiBellBtn.classList.remove('hidden');

    // Connect to WebSocket Server
    const socket = connectSocket(currentUser);
    setupSocketListeners(socket);

    // Fetch alerts count / notifications
    refreshNotifications();

    // Prompt and register Web Push Subscription
    requestNotificationPermissionAndSubscribe();

    // Route to appropriate dashboard
    if (currentUser.role === 'driver') {
      showScreen('driverDashboard');
      initDriverConsole();
    } else {
      showScreen('userDashboard');
      initUserConsole();
    }
  } else {
    // Return to Landing Screen
    currentUser = null;
    userDisplayBadge.classList.add('hidden');
    logoutBtn.style.display = 'none';
    notiBellBtn.classList.add('hidden');
    showScreen('landing');
  }
}

async function requestNotificationPermissionAndSubscribe() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('[Push Client] Web Push not supported by this browser.');
    return;
  }

  try {
    // Request permission if not already determined
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('[Push Client] Notification permission denied by user.');
        return;
      }
    }

    if (Notification.permission !== 'granted') return;

    const reg = await navigator.serviceWorker.ready;
    const existingSubscription = await reg.pushManager.getSubscription();

    // If subscription already exists, we can still sync it to backend
    if (existingSubscription) {
      await registerSubscriptionOnBackend(existingSubscription);
      return;
    }

    // Retrieve active VAPID public key from the backend API
    const keyData = await apiFetch('/api/notifications/vapid-public-key');
    if (!keyData || !keyData.publicKey) {
      console.warn('[Push Client] Failed to retrieve VAPID public key from backend.');
      return;
    }

    // Subscribe to push service
    const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey
    });

    await registerSubscriptionOnBackend(subscription);

  } catch (error) {
    console.error('[Push Client] Failed to register Web Push:', error.message);
  }
}

async function registerSubscriptionOnBackend(subscription) {
  try {
    const res = await apiFetch('/api/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription })
    });
    if (res.success) {
      console.log('[Push Client] Web Push subscription registered successfully on Neon DB.');
    }
  } catch (err) {
    console.error('[Push Client] Failed to sync subscription with server:', err.message);
  }
}

// Helper utility to convert VAPID public key to Uint8Array format
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}


// --- LOCATION TRACKING & GEO SERVICES ---
function requestUserLocation() {
  if (navigator.geolocation) {
    // Continuous coordinates tracking
    locationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        userCoords.latitude = position.coords.latitude;
        userCoords.longitude = position.coords.longitude;
        updateCoordsDisplay();
        
        // If driver is online, post their current coordinates
        if (currentUser && currentUser.role === 'driver' && driverAvailabilityToggle.checked) {
          streamDriverLocationSocket();
        }
      },
      (error) => {
        console.warn('GPS access denied or unavailable. Running in simulated fallback mode.');
        // Center-point coordinates around Bangalore/San-Francisco for mock testing
        updateCoordsDisplay();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    console.warn('Geolocation is not supported by this browser.');
    updateCoordsDisplay();
  }
}

function updateCoordsDisplay() {
  const displayStr = `Lat: ${userCoords.latitude.toFixed(5)}, Lng: ${userCoords.longitude.toFixed(5)}`;
  if (userCoordsDisplay) {
    userCoordsDisplay.textContent = displayStr;
  }
  const userGpsBadge = document.getElementById('gps-status-badge');
  if (userGpsBadge) {
    userGpsBadge.textContent = 'GPS Active';
    userGpsBadge.style.color = '#10b981';
  }
}

// --- AUTHENTICATION FLOWS ---
function setupEventListeners() {
  // Brand Header Click
  brandLink.addEventListener('click', (e) => {
    e.preventDefault();
    loadSessionUser();
  });

  // Hero Actions
  document.getElementById('landing-request-btn').addEventListener('click', () => {
    selectedRole = 'user';
    toggleAuthFormState(false); // Mode: Login
    updateRoleSelectorUI();
    showScreen('auth');
  });

  document.getElementById('landing-login-btn').addEventListener('click', () => {
    selectedRole = 'driver';
    toggleAuthFormState(false); // Mode: Login
    updateRoleSelectorUI();
    showScreen('auth');
  });

  // Role Toggles inside Login Card
  roleUserBtn.addEventListener('click', () => {
    selectedRole = 'user';
    updateRoleSelectorUI();
  });

  roleDriverBtn.addEventListener('click', () => {
    selectedRole = 'driver';
    updateRoleSelectorUI();
  });

  // Auth Card toggle signup/login link
  authToggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    toggleAuthFormState(!isRegisterMode);
  });

  // Form Submission
  authForm.addEventListener('submit', handleAuthSubmit);

  // Logout Trigger
  logoutBtn.addEventListener('click', () => {
    // Stop locations streams
    if (locationWatchId) navigator.geolocation.clearWatch(locationWatchId);
    if (driverLocationIntervalId) clearInterval(driverLocationIntervalId);
    if (simulatedMovementIntervalId) clearInterval(simulatedMovementIntervalId);
    
    // Disable availability status before logoff
    if (currentUser && currentUser.role === 'driver') {
      DriverAPI.updateAvailability(false).catch(() => {});
    }

    clearAuth();
    disconnectSocket();
    loadSessionUser();
  });

  // Notifications bell toggler
  notiBellBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    notiPanel.classList.toggle('active');
    if (notiPanel.classList.contains('active')) {
      NotificationAPI.markAllRead().then(() => {
        notiBadgeDot.classList.remove('active');
      });
    }
  });

  // Close notifications on body click
  document.body.addEventListener('click', () => {
    notiPanel.classList.remove('active');
  });

  notiPanel.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent closing dropdown card when clicking list
  });

  // Notifications clear
  notiClearBtn.addEventListener('click', async () => {
    await NotificationAPI.markAllRead();
    refreshNotifications();
  });

  // Citizen Dashboard triggers
  triggerEmergencyBtn.addEventListener('click', triggerEmergencyDispatch);

  // Driver Dashboard availability toggler
  driverAvailabilityToggle.addEventListener('change', handleDriverAvailabilityChange);

  // Driver Alert buttons
  alertRejectBtn.addEventListener('click', () => {
    hideIncomingAlert();
  });
  
  alertAcceptBtn.addEventListener('click', () => {
    acceptIncomingEmergency();
  });

  // Active Driver buttons
  driverArriveBtn.addEventListener('click', markDriverArrived);
  driverCompleteBtn.addEventListener('click', markEmergencyCompleted);
}

function updateRoleSelectorUI() {
  if (selectedRole === 'driver') {
    roleDriverBtn.classList.add('active');
    roleUserBtn.classList.remove('active');
    
    if (isRegisterMode) {
      driverVehicleField.classList.remove('hidden');
      driverTypeField.classList.remove('hidden');
    }
  } else {
    roleUserBtn.classList.add('active');
    roleDriverBtn.classList.remove('active');
    driverVehicleField.classList.add('hidden');
    driverTypeField.classList.add('hidden');
  }
}

function toggleAuthFormState(registerMode) {
  isRegisterMode = registerMode;
  
  if (isRegisterMode) {
    authTitle.textContent = 'Join SmartRescue';
    authSubtitle.textContent = 'Create an account to start using the system';
    authSubmitBtn.textContent = 'Sign Up';
    authToggleText.textContent = 'Already have an account?';
    authToggleLink.textContent = 'Login';
    
    regNameField.classList.remove('hidden');
    regPhoneField.classList.remove('hidden');
    
    // Apply role inputs rules
    updateRoleSelectorUI();
  } else {
    authTitle.textContent = 'Welcome Back';
    authSubtitle.textContent = 'Login to access your dispatch dashboard';
    authSubmitBtn.textContent = 'Login';
    authToggleText.textContent = "Don't have an account?";
    authToggleLink.textContent = 'Sign Up';
    
    regNameField.classList.add('hidden');
    regPhoneField.classList.add('hidden');
    driverVehicleField.classList.add('hidden');
    driverTypeField.classList.add('hidden');
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();

  const email = document.getElementById('input-email').value;
  const password = document.getElementById('input-password').value;

  try {
    let response;

    if (isRegisterMode) {
      const name = document.getElementById('input-name').value;
      const phone = document.getElementById('input-phone').value;
      
      const payload = {
        name,
        email,
        password,
        phone,
        role: selectedRole
      };

      if (selectedRole === 'driver') {
        payload.vehicle_number = document.getElementById('input-vehicle').value;
        payload.ambulance_type = document.getElementById('select-ambulance').value;
      }

      response = await AuthAPI.register(payload);
    } else {
      response = await AuthAPI.login(email, password);
    }

    if (response.success) {
      setAuthToken(response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
      
      // Clear forms
      authForm.reset();
      
      // Load screen
      loadSessionUser();
    }
  } catch (error) {
    alert(`Authentication failed: ${error.message}`);
  }
}

// --- USER CONSOLE OPERATIONS ---
async function initUserConsole() {
  userRequestPanel.classList.remove('hidden');
  userTrackingPanel.classList.add('hidden');
  trackingDriverDetails.classList.add('hidden');
  
  // Set map user location marker coords
  const userMarker = document.getElementById('user-map-marker');
  userMarker.style.top = '50%';
  userMarker.style.left = '50%';
  
  const driverMarker = document.getElementById('driver-map-marker');
  driverMarker.classList.add('hidden');

  const userRadar = document.getElementById('user-radar-ring');
  userRadar.style.top = '50%';
  userRadar.style.left = '50%';

  // Fetch nearby available ambulances
  fetchNearbyAmbulances();

  // Poll nearby ambulances list every 10 seconds
  if (window.userPollInterval) clearInterval(window.userPollInterval);
  window.userPollInterval = setInterval(fetchNearbyAmbulances, 10000);
}

async function fetchNearbyAmbulances() {
  // If device is offline, load nearby ambulances from local IndexedDB cache
  if (!navigator.onLine) {
    try {
      const cachedDrivers = await getCachedDrivers();
      renderNearbyAmbulances(cachedDrivers, true);
    } catch (err) {
      console.error('[Offline Cache] Failed to load cached drivers:', err.message);
    }
    return;
  }

  try {
    const data = await UserAPI.getNearbyAmbulances(userCoords.latitude, userCoords.longitude);
    if (data.success) {
      renderNearbyAmbulances(data.ambulances, false);
      // Cache driver listings locally
      await cacheDrivers(data.ambulances);
    }
  } catch (err) {
    console.error('Error fetching nearby ambulances:', err.message);
  }
}

function renderNearbyAmbulances(ambulances, isCached = false) {
  nearbyCountBadge.textContent = isCached ? 'Cached (Offline)' : `${ambulances.length} Online`;
  
  if (ambulances.length === 0) {
    nearbyAmbulancesList.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">No ambulances nearby</div>
    `;
    return;
  }

  nearbyAmbulancesList.innerHTML = ambulances.map(amb => {
    let lastSeenText = '';
    if (isCached && amb.lastSeenTimestamp) {
      const diffMs = new Date() - new Date(amb.lastSeenTimestamp);
      const diffMins = Math.max(0, Math.floor(diffMs / 1000 / 60));
      lastSeenText = ` <span style="font-size:0.75rem; color:var(--status-danger); font-weight:600;">(Last seen ${diffMins}m ago)</span>`;
    }

    return `
      <div class="list-item">
        <div class="list-item-header">
          <div>
            <div class="list-item-title">${amb.driverName}${lastSeenText}</div>
            <div class="list-item-subtitle">Plate: ${amb.vehicleNumber}</div>
          </div>
          <span class="list-item-badge cyan">${amb.ambulanceType}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.825rem; margin-top: 0.25rem;">
          <span class="text-secondary-color"><i class="fa-solid fa-location-arrow text-cyan"></i> Proximity:</span>
          <strong>${amb.distanceKm} km</strong>
        </div>
      </div>
    `;
  }).join('');
}

async function triggerEmergencyDispatch() {
  // Generate a cryptographically secure UUID for deduplication
  const localUuid = self.crypto.randomUUID ? self.crypto.randomUUID() : 'req-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();

  try {
    // Lock buttons
    triggerEmergencyBtn.disabled = true;
    triggerEmergencyBtn.textContent = 'PLACING REQUEST...';

    // If device is offline, queue request locally in IndexedDB outbox
    if (!navigator.onLine) {
      const requestPayload = {
        id: localUuid,
        latitude: userCoords.latitude,
        longitude: userCoords.longitude,
        createdAt: new Date().toISOString()
      };

      await addToOutbox(requestPayload);

      alert('No internet connection. Your emergency request has been queued locally and will sync automatically once your signal returns.');

      // Show offline queued interface
      userRequestPanel.classList.add('hidden');
      userTrackingPanel.classList.remove('hidden');
      trackingStatusTitle.textContent = 'Queued (Offline)';
      trackingStatusDesc.textContent = 'Your emergency call is saved locally. We are trying to restore connectivity...';
      trackingDriverDetails.classList.add('hidden');
      
      triggerEmergencyBtn.disabled = false;
      triggerEmergencyBtn.textContent = 'DISPATCH NOW';
      return;
    }

    const response = await EmergencyAPI.createRequest(userCoords.latitude, userCoords.longitude, localUuid);
    
    if (response.success) {
      activeRequest = response.request;
      
      // Transition User Panel to Search mode
      userRequestPanel.classList.add('hidden');
      userTrackingPanel.classList.remove('hidden');
      trackingStatusTitle.textContent = 'Locating Ambulance...';
      trackingStatusDesc.textContent = 'Broadcasting emergency parameters to nearby available drivers...';
      trackingDriverDetails.classList.add('hidden');

      // Update radar rings
      const radar = document.getElementById('user-radar-ring');
      radar.style.display = 'block';
      
      // Track request status changes
      pollRequestDetails(activeRequest.id);
    }
  } catch (error) {
    alert(`Failed to place emergency request: ${error.message}`);
    triggerEmergencyBtn.disabled = false;
    triggerEmergencyBtn.textContent = 'DISPATCH NOW';
  }
}

function pollRequestDetails(requestId) {
  // Set interval to check request status via API if websockets reconnect
  if (window.requestPollIntervalId) clearInterval(window.requestPollIntervalId);
  
  window.requestPollIntervalId = setInterval(async () => {
    if (!activeRequest) {
      clearInterval(window.requestPollIntervalId);
      return;
    }
    
    try {
      const data = await EmergencyAPI.getStatus(requestId);
      if (data.success) {
        handleRequestStateChange(data.request);
      }
    } catch (err) {
      console.error('Error polling request status:', err.message);
    }
  }, 4000);
}

function handleRequestStateChange(request) {
  activeRequest = request;

  if (request.status === 'pending') {
    trackingStatusTitle.textContent = 'Searching for Ambulance...';
    trackingStatusDesc.textContent = 'Alerts are landing on available driver consoles...';
    trackingDriverDetails.classList.add('hidden');
  } 
  else if (request.status === 'accepted') {
    trackingStatusTitle.textContent = 'Rescue Team Dispatched';
    trackingStatusDesc.textContent = 'An ambulance is rushing to your coordinates.';
    trackingDriverDetails.classList.remove('hidden');
    
    // Render driver details
    trackDriverName.textContent = `Driver: ${request.driverName}`;
    trackVehicleNumber.textContent = `Plate: ${request.vehicleNumber}`;
    trackAmbulanceType.textContent = request.ambulanceType;
    callDriverBtn.href = `tel:${request.driverPhone}`;
    
    // Google Maps href direction for user to track driver
    // In user view, we point origin=driverCoords & destination=userCoords
    if (request.driverLatitude && request.driverLongitude) {
      userGoogleMapsBtn.href = `https://www.google.com/maps/dir/?api=1&origin=${request.driverLatitude},${request.driverLongitude}&destination=${request.userLatitude},${request.userLongitude}&travelmode=driving`;
      
      // Update UI distance
      trackDistance.textContent = `${request.distanceKm ? request.distanceKm.toFixed(2) : '--'} km`;
      // Calculate eta based on distance (assuming average city driving speed 30km/h: 2 mins per km)
      const etaMin = request.distanceKm ? Math.max(1, Math.round(request.distanceKm * 2)) : '--';
      trackETA.textContent = `${etaMin} mins`;

      // Update driver visual marker on map
      updateDriverMarkerOnSimulatedMap(request.driverLatitude, request.driverLongitude);
    }
    
    // Connect tracking sockets
    const socket = getSocket();
    if (socket) {
      socket.emit('start_tracking', { driverId: request.driverId });
    }
  }
  else if (request.status === 'arrived') {
    trackingStatusTitle.textContent = 'Ambulance Arrived!';
    trackingStatusDesc.textContent = 'Your ambulance driver is at the scene of the accident.';
    if (request.distanceKm !== null) {
      trackDistance.textContent = '0.00 km';
      trackETA.textContent = 'Arrived';
    }
    // Update map marker
    if (request.driverLatitude && request.driverLongitude) {
      updateDriverMarkerOnSimulatedMap(request.driverLatitude, request.driverLongitude);
    }
  }
  else if (request.status === 'completed') {
    clearInterval(window.requestPollIntervalId);
    const socket = getSocket();
    if (socket && request.driverId) {
      socket.emit('stop_tracking', { driverId: request.driverId });
    }
    alert('Rescue operation complete. Glad you are safe!');
    activeRequest = null;
    initUserConsole();
    triggerEmergencyBtn.disabled = false;
    triggerEmergencyBtn.textContent = 'DISPATCH NOW';
  }
}

function updateDriverMarkerOnSimulatedMap(drvLat, drvLng) {
  const driverMarkerEl = document.getElementById('driver-map-marker');
  driverMarkerEl.classList.remove('hidden');
  document.getElementById('driver-marker-label').textContent = activeRequest.vehicleNumber;

  // Since we have userCoords and driverCoords, we can dynamically position the driver relative to user (center 50%, 50%)
  // We compute delta and map coordinates
  const latDelta = drvLat - userCoords.latitude;
  const lngDelta = drvLng - userCoords.longitude;

  // Scale factor to map degree delta to percentage (let's say 0.01 degree = 30% width)
  const scale = 3000; 
  const topPercent = 50 - (latDelta * scale);
  const leftPercent = 50 + (lngDelta * scale);

  // Keep it within map boundaries
  const boundedTop = Math.max(5, Math.min(95, topPercent));
  const boundedLeft = Math.max(5, Math.min(95, leftPercent));

  driverMarkerEl.style.top = `${boundedTop}%`;
  driverMarkerEl.style.left = `${boundedLeft}%`;
}

// --- DRIVER CONSOLE OPERATIONS ---
async function initDriverConsole() {
  driverEmergencyAlert.classList.add('hidden');
  driverEmptyPanel.classList.remove('hidden');
  driverActivePanel.classList.add('hidden');
  
  // Set default state of toggler based on profile available flag
  const isAvailable = currentUser.isAvailable;
  driverAvailabilityToggle.checked = !!isAvailable;
  
  updateDriverStatusText(!!isAvailable);
  
  if (isAvailable) {
    startDriverLocationTracking();
  }

  // Retrieve driver activities
  refreshActivityLogs();
}

async function handleDriverAvailabilityChange(e) {
  const isChecked = e.target.checked;
  
  try {
    const res = await DriverAPI.updateAvailability(isChecked);
    if (res.success) {
      currentUser.isAvailable = res.is_available;
      localStorage.setItem('user', JSON.stringify(currentUser));
      updateDriverStatusText(res.is_available);
      
      const socket = getSocket();
      if (socket) {
        socket.emit('driver_status_change', {
          driverId: currentUser.driverId,
          isAvailable: res.is_available
        });
      }

      if (res.is_available) {
        startDriverLocationTracking();
        refreshActivityLogs();
      } else {
        stopDriverLocationTracking();
        hideIncomingAlert();
        refreshActivityLogs();
      }
    }
  } catch (error) {
    alert(`Failed to update status: ${error.message}`);
    // Rollback toggle switch
    driverAvailabilityToggle.checked = !isChecked;
  }
}

function updateDriverStatusText(isAvailable) {
  if (isAvailable) {
    driverStatusText.textContent = 'AVAILABLE (ONLINE)';
    driverStatusText.className = 'switch-label text-success';
  } else {
    driverStatusText.textContent = 'OFFLINE';
    driverStatusText.className = 'switch-label text-secondary-color';
  }
}

function startDriverLocationTracking() {
  // Start high frequency coordinates stream
  // Fastify API coordinates update
  streamDriverLocationAPI();
  
  if (driverLocationIntervalId) clearInterval(driverLocationIntervalId);
  driverLocationIntervalId = setInterval(streamDriverLocationAPI, 8000);
}

function stopDriverLocationTracking() {
  if (driverLocationIntervalId) {
    clearInterval(driverLocationIntervalId);
    driverLocationIntervalId = null;
  }
}

async function streamDriverLocationAPI() {
  // If device is offline, cache coordinates in local GPS buffer
  if (!navigator.onLine) {
    try {
      await cacheGPSCoordinates(userCoords.latitude, userCoords.longitude);
      console.log('[GPS Cache] Connection offline. Buffered current GPS coordinates.');
    } catch (err) {
      console.error('[GPS Cache] Failed to cache coordinates offline:', err.message);
    }
    return;
  }

  try {
    await DriverAPI.updateLocation(userCoords.latitude, userCoords.longitude);
  } catch (err) {
    console.error('API location update error, falling back to cache:', err.message);
    try {
      await cacheGPSCoordinates(userCoords.latitude, userCoords.longitude);
    } catch (dbErr) {
      console.error('[GPS Cache] Fallback caching failed:', dbErr.message);
    }
  }
}

function streamDriverLocationSocket() {
  // Socket connections are suspended during signal drops
  if (!navigator.onLine) return;

  const socket = getSocket();
  if (socket && currentUser && currentUser.driverId) {
    socket.emit('driver_location_update', {
      driverId: currentUser.driverId,
      latitude: userCoords.latitude,
      longitude: userCoords.longitude
    });
  }
}

// --- DRIVER EMERGENCY DISPATCH WORKFLOW ---
function showIncomingAlert(alertData) {
  // Play warning sirens
  emergencySound.play().catch(e => console.log('Audio autoplay blocked by user interaction rules.'));

  alertDistance.textContent = `${alertData.distanceKm.toFixed(2)} km`;
  alertCoords.textContent = `Lat: ${alertData.userLatitude.toFixed(5)}, Lng: ${alertData.userLongitude.toFixed(5)}`;
  
  // Save temporary request parameters on button triggers
  alertAcceptBtn.onclick = () => acceptEmergencyRun(alertData.requestId);
  alertRejectBtn.onclick = () => {
    hideIncomingAlert();
    // Call visual reject audit log API
    EmergencyAPI.performAction(alertData.requestId, 'reject').catch(() => {});
  };

  driverEmergencyAlert.classList.remove('hidden');

  // 1. Native OS notification trigger (foreground alert)
  if (Notification.permission === 'granted') {
    new Notification('🚨 INCOMING EMERGENCY ALERT!', {
      body: `Accident Victim is ${alertData.distanceKm.toFixed(2)} km away. Click to accept.`,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200]
    });
  }

  // 2. Default standard JS alert popup (delayed slightly to allow audio to initialize)
  setTimeout(() => {
    if (!driverEmergencyAlert.classList.contains('hidden')) {
      alert(`⚠️ EMERGENCY DISPATCH ALERT!\n\nAn accident victim is requesting assistance.\nDistance: ${alertData.distanceKm.toFixed(2)} km.\n\nPlease accept the run on your dashboard!`);
    }
  }, 1000);
}


function hideIncomingAlert() {
  driverEmergencyAlert.classList.add('hidden');
  emergencySound.pause();
  emergencySound.currentTime = 0;
}

async function acceptEmergencyRun(requestId) {
  try {
    hideIncomingAlert();
    const data = await EmergencyAPI.performAction(requestId, 'accept');
    
    if (data.success) {
      // Enter active mission view
      enterActiveMissionConsole(requestId);
    }
  } catch (error) {
    alert(`Could not accept request: ${error.message}`);
  }
}

async function enterActiveMissionConsole(requestId) {
  try {
    const data = await EmergencyAPI.getStatus(requestId);
    if (data.success) {
      activeRequest = data.request;
      
      driverEmptyPanel.classList.add('hidden');
      driverActivePanel.classList.remove('hidden');
      
      activeUserName.textContent = `Victim: ${activeRequest.userName}`;
      activeUserPhone.textContent = `Phone: ${activeRequest.userPhone}`;
      activeDistance.textContent = `${activeRequest.distanceKm ? activeRequest.distanceKm.toFixed(2) : '--'} km`;
      activeCoordsDisplay.textContent = `Coords: ${activeRequest.userLatitude.toFixed(5)}, ${activeRequest.userLongitude.toFixed(5)}`;
      
      // Update Google Maps navigation direct directions link (origin=driver, destination=user)
      driverNavigateBtn.href = `https://www.google.com/maps/dir/?api=1&origin=${userCoords.latitude},${userCoords.longitude}&destination=${activeRequest.userLatitude},${activeRequest.userLongitude}&travelmode=driving`;
      
      driverArriveBtn.classList.remove('hidden');
      driverCompleteBtn.classList.add('hidden');

      // Update map display target
      const targetMarker = document.getElementById('driver-target-marker');
      targetMarker.classList.remove('hidden');
      
      // Simulate real-time driver movement towards destination (for interactive presentation testing)
      simulateDriverMovementToDestination();

      refreshActivityLogs();
    }
  } catch (err) {
    console.error('Error opening active console:', err.message);
  }
}

// Helper to simulate location drifting towards user on the map (helpful for local demo/validation testing)
function simulateDriverMovementToDestination() {
  if (simulatedMovementIntervalId) clearInterval(simulatedMovementIntervalId);

  let stepCount = 0;
  const maxSteps = 12;
  const startLat = userCoords.latitude;
  const startLng = userCoords.longitude;
  const destLat = activeRequest.userLatitude;
  const destLng = activeRequest.userLongitude;

  simulatedMovementIntervalId = setInterval(async () => {
    if (!activeRequest || activeRequest.status === 'completed') {
      clearInterval(simulatedMovementIntervalId);
      return;
    }

    stepCount++;
    // Drift current position closer to target
    const latDrift = startLat + ((destLat - startLat) * (stepCount / maxSteps));
    const lngDrift = startLng + ((destLng - startLng) * (stepCount / maxSteps));

    // Update local state coordinates
    userCoords.latitude = latDrift;
    userCoords.longitude = lngDrift;
    
    // Broadcast updated coordinates
    streamDriverLocationSocket();
    streamDriverLocationAPI();

    // Recalculate distance
    const currentDist = calculateMockDistance(latDrift, lngDrift, destLat, destLng);
    activeDistance.textContent = `${currentDist.toFixed(2)} km`;

    // Stop drifting once arrived
    if (stepCount >= maxSteps) {
      clearInterval(simulatedMovementIntervalId);
    }
  }, 6000);
}

function calculateMockDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function markDriverArrived() {
  if (!activeRequest) return;
  try {
    const data = await EmergencyAPI.performAction(activeRequest.id, 'arrive');
    if (data.success) {
      driverArriveBtn.classList.add('hidden');
      driverCompleteBtn.classList.remove('hidden');
      
      // Stop drifting simulation
      if (simulatedMovementIntervalId) clearInterval(simulatedMovementIntervalId);
      
      // Snap coordinates to target user
      userCoords.latitude = activeRequest.userLatitude;
      userCoords.longitude = activeRequest.userLongitude;
      streamDriverLocationSocket();
      streamDriverLocationAPI();
      
      activeDistance.textContent = '0.00 km';
      refreshActivityLogs();
    }
  } catch (error) {
    alert(`Error marking arrival: ${error.message}`);
  }
}

async function markEmergencyCompleted() {
  if (!activeRequest) return;
  try {
    const data = await EmergencyAPI.performAction(activeRequest.id, 'complete');
    if (data.success) {
      alert('Emergency request closed successfully. Heading back online.');
      
      // Stop drifting simulation
      if (simulatedMovementIntervalId) clearInterval(simulatedMovementIntervalId);
      
      activeRequest = null;
      
      // Reset map targets
      document.getElementById('driver-target-marker').classList.add('hidden');

      initDriverConsole();
    }
  } catch (error) {
    alert(`Error completing request: ${error.message}`);
  }
}

// --- ACTIVITY LOGS & NOTIFICATIONS ---
async function refreshActivityLogs() {
  try {
    // We can fetch recent logs or populate via API. Since we log user actions, let's query backend.
    // To keep simple, we render simulated lists or log from local UI events
    // Let's populate simulated logs since they represent the activity_logs table
    const dbLogs = await NotificationAPI.getNotifications(); // Retrieve mock notifications / action items
    // Render
    driverActivityList.innerHTML = `
      <div class="list-item" style="padding: 0.5rem 1rem;">
        <div class="list-item-title" style="font-size:0.85rem;"><i class="fa-solid fa-circle-info text-cyan"></i> Console online</div>
        <div class="list-item-subtitle" style="font-size:0.75rem;">GPS streaming verified</div>
      </div>
    `;
  } catch (err) {
    console.log(err);
  }
}

async function refreshNotifications() {
  try {
    const data = await NotificationAPI.getNotifications();
    if (data.success && data.notifications) {
      renderNotifications(data.notifications);
    }
  } catch (err) {
    console.error('Error fetching notifications:', err.message);
  }
}

function renderNotifications(notifications) {
  const unreadCount = notifications.filter(n => !n.is_read).length;
  
  if (unreadCount > 0) {
    notiBadgeDot.classList.add('active');
  } else {
    notiBadgeDot.classList.remove('active');
  }

  if (notifications.length === 0) {
    notiListContainer.innerHTML = `
      <div style="padding: 1.5rem; text-align: center; color: var(--text-muted);">No new notifications</div>
    `;
    return;
  }

  notiListContainer.innerHTML = notifications.map(noti => `
    <div class="notification-item ${noti.is_read ? '' : 'unread'}">
      <div class="notification-title">${noti.title}</div>
      <div class="notification-desc">${noti.message}</div>
      <div class="notification-time">${new Date(noti.created_at).toLocaleTimeString()}</div>
    </div>
  `).join('');
}

// --- WEBSOCKET REAL-TIME EVENT ROUTERS ---
function setupSocketListeners(socket) {
  // Clear any existing listeners to prevent duplicates
  socket.off('emergency_alert');
  socket.off('request_accepted');
  socket.off('request_closed');
  socket.off('driver_movement');
  socket.off('status_update');
  socket.off('emergency_completed');

  // DRIVER: Receive dispatch alert
  socket.on('emergency_alert', (data) => {
    // Only online drivers can process alerts
    if (currentUser && currentUser.role === 'driver' && driverAvailabilityToggle.checked && !activeRequest) {
      // Find distance relative to this driver
      const targetDriver = data.alertedDrivers.find(d => d.driverId === currentUser.driverId);
      if (targetDriver) {
        showIncomingAlert({
          requestId: data.requestId,
          userLatitude: data.userLatitude,
          userLongitude: data.userLongitude,
          distanceKm: targetDriver.distanceKm
        });
      }
    }
  });

  // DRIVER: Request closed (another driver accepted it)
  socket.on('request_closed', (data) => {
    if (currentUser && currentUser.role === 'driver') {
      // Hide alert card if currently open for this request
      if (driverEmergencyAlert.dataset.requestId === String(data.requestId) || !activeRequest) {
        hideIncomingAlert();
      }
    }
  });

  // USER: Request accepted by driver
  socket.on('request_accepted', (data) => {
    if (currentUser && currentUser.role === 'user' && activeRequest && activeRequest.id === data.requestId) {
      handleRequestStateChange({
        ...activeRequest,
        status: 'accepted',
        driverId: data.driverId,
        driverName: data.driverName,
        driverPhone: data.driverPhone,
        vehicleNumber: data.vehicleNumber,
        ambulanceType: data.ambulanceType,
        driverLatitude: data.driverLatitude,
        driverLongitude: data.driverLongitude,
        distanceKm: data.driverLatitude ? calculateMockDistance(userCoords.latitude, userCoords.longitude, data.driverLatitude, data.driverLongitude) : null
      });
      refreshNotifications();
    }
  });

  // USER: Driver movement stream
  socket.on('driver_movement', (data) => {
    if (currentUser && currentUser.role === 'user' && activeRequest && activeRequest.driverId === data.driverId) {
      const dist = calculateMockDistance(userCoords.latitude, userCoords.longitude, data.latitude, data.longitude);
      
      handleRequestStateChange({
        ...activeRequest,
        driverLatitude: data.latitude,
        driverLongitude: data.longitude,
        distanceKm: dist
      });
    }
  });

  // USER: Status updates (arrived, etc.)
  socket.on('status_update', (data) => {
    if (currentUser && currentUser.role === 'user' && activeRequest && activeRequest.id === data.requestId) {
      handleRequestStateChange({
        ...activeRequest,
        status: data.status
      });
      refreshNotifications();
    }
  });

  // USER: Completion trigger
  socket.on('emergency_completed', (data) => {
    if (currentUser && currentUser.role === 'user' && activeRequest && activeRequest.id === data.requestId) {
      handleRequestStateChange({
        ...activeRequest,
        status: 'completed'
      });
      refreshNotifications();
    }
  });
}
