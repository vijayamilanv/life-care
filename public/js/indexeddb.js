// IndexedDB Service Wrapper for Offline Caching & Queues
const DB_NAME = 'smartrescue-offline-db';
const DB_VERSION = 1;

let dbInstance = null;

/**
 * Initializes and returns a promise for the IndexedDB connection
 */
function openRescueDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Outbox store for deferred emergency requests
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'id' });
      }

      // 2. Cache store for nearby available drivers
      if (!db.objectStoreNames.contains('driver_cache')) {
        db.createObjectStore('driver_cache', { keyPath: 'driverId' });
      }

      // 3. Location cache store for GPS tracking buffer
      if (!db.objectStoreNames.contains('gps_cache')) {
        db.createObjectStore('gps_cache', { keyPath: 'timestamp' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB opening error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// --- OUTBOX OPERATORS ---
async function addToOutbox(requestPayload) {
  const db = await openRescueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const req = store.put({
      ...requestPayload,
      status: 'pending_sync',
      retryCount: 0
    });

    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function getOutboxItems() {
  const db = await openRescueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readonly');
    const store = tx.objectStore('outbox');
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteFromOutbox(id) {
  const db = await openRescueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('outbox', 'readwrite');
    const store = tx.objectStore('outbox');
    const req = store.delete(id);

    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// --- DRIVER CACHE OPERATORS ---
async function cacheDrivers(drivers) {
  const db = await openRescueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('driver_cache', 'readwrite');
    const store = tx.objectStore('driver_cache');

    // Clear old records first
    store.clear();

    drivers.forEach(driver => {
      store.put({
        ...driver,
        lastSeenTimestamp: new Date().toISOString()
      });
    });

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getCachedDrivers() {
  const db = await openRescueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('driver_cache', 'readonly');
    const store = tx.objectStore('driver_cache');
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// --- GPS CACHE OPERATORS ---
async function cacheGPSCoordinates(latitude, longitude) {
  const db = await openRescueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('gps_cache', 'readwrite');
    const store = tx.objectStore('gps_cache');
    const req = store.put({
      timestamp: new Date().getTime(),
      latitude,
      longitude
    });

    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function getCachedGPSCoordinates() {
  const db = await openRescueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('gps_cache', 'readonly');
    const store = tx.objectStore('gps_cache');
    const req = store.getAll();

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function clearCachedGPSCoordinates() {
  const db = await openRescueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('gps_cache', 'readwrite');
    const store = tx.objectStore('gps_cache');
    const req = store.clear();

    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}
