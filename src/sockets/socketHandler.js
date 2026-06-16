const db = require('../config/db');

module.exports = function (io) {
  io.on('connection', (socket) => {
    console.log(`Client connected: Socket ID ${socket.id}`);

    // Join room on login/connection
    socket.on('join', async (data) => {
      const { userId, role, driverId } = data || {};
      if (!userId) return;

      console.log(`User ${userId} (${role}) joined socket room user_${userId}`);
      socket.join(`user_${userId}`);

      if (role === 'driver' && driverId) {
        console.log(`Driver ${driverId} joined room driver_${driverId}`);
        socket.join(`driver_${driverId}`);

        try {
          // Check if driver is available in DB, if so auto-join available_drivers room
          const driverRes = await db.query('SELECT is_available FROM drivers WHERE id = $1', [driverId]);
          if (driverRes.rows.length > 0 && driverRes.rows[0].is_available) {
            console.log(`Driver ${driverId} joined available_drivers pool room`);
            socket.join('available_drivers');
          }
        } catch (err) {
          console.error('Error fetching driver availability on join:', err.message);
        }
      }
    });

    // Listen for driver status change (online/offline availability)
    socket.on('driver_status_change', (data) => {
      const { driverId, isAvailable } = data || {};
      if (!driverId) return;

      console.log(`Driver ${driverId} availability changed: ${isAvailable}`);

      if (isAvailable) {
        socket.join('available_drivers');
      } else {
        socket.leave('available_drivers');
      }
    });

    // Listen for real-time location streaming from driver
    socket.on('driver_location_update', async (data) => {
      const { driverId, latitude, longitude } = data || {};
      if (!driverId || latitude === undefined || longitude === undefined) return;

      try {
        // 1. Update location in Database
        const upsertQuery = `
          INSERT INTO driver_locations (driver_id, latitude, longitude, updated_at)
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          ON CONFLICT (driver_id) 
          DO UPDATE SET 
            latitude = EXCLUDED.latitude, 
            longitude = EXCLUDED.longitude, 
            updated_at = CURRENT_TIMESTAMP
        `;
        await db.query(upsertQuery, [driverId, latitude, longitude]);

        // 2. Broadcast to users tracking this specific driver
        io.to(`track_driver_${driverId}`).emit('driver_movement', {
          driverId,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          timestamp: new Date().toISOString()
        });

      } catch (err) {
        console.error(`Error updating location for driver ${driverId} via socket:`, err.message);
      }
    });

    // Listen for a user starting to track a driver
    socket.on('start_tracking', (data) => {
      const { driverId } = data || {};
      if (!driverId) return;
      console.log(`Socket ${socket.id} started tracking driver_${driverId}`);
      socket.join(`track_driver_${driverId}`);
    });

    // Listen for a user stopping tracking
    socket.on('stop_tracking', (data) => {
      const { driverId } = data || {};
      if (!driverId) return;
      console.log(`Socket ${socket.id} stopped tracking driver_${driverId}`);
      socket.leave(`track_driver_${driverId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: Socket ID ${socket.id}`);
    });
  });
};
