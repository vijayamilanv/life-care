const db = require('../config/db');
const { requireDriver } = require('../middleware/auth');

module.exports = async function (fastify, opts) {
  
  // Apply driver auth middleware to all routes in this plugin
  fastify.addHook('preHandler', requireDriver);

  // PUT /api/driver/availability
  // Body: { "is_available": true/false }
  fastify.put('/availability', async (request, reply) => {
    const { is_available } = request.body || {};
    
    if (is_available === undefined) {
      return reply.code(400).send({
        success: false,
        message: 'is_available parameter is required'
      });
    }

    const driverId = request.user.driverId;
    if (!driverId) {
      return reply.code(400).send({
        success: false,
        message: 'Driver profile not found for authenticated user'
      });
    }

    try {
      const updateText = `
        UPDATE drivers 
        SET is_available = $1 
        WHERE id = $2 
        RETURNING id, is_available
      `;
      const res = await db.query(updateText, [is_available, driverId]);
      
      if (res.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          message: 'Driver not found'
        });
      }

      // Log activity
      await db.query(
        'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
        [request.user.id, 'DRIVER_STATUS', `Driver availability set to ${is_available}`]
      );

      // We can also trigger socket notification here, handled by socket IO in Phase 4/5
      if (fastify.io) {
        fastify.io.emit('driver_status_change', {
          driverId,
          isAvailable: is_available
        });
      }

      return reply.code(200).send({
        success: true,
        is_available: res.rows[0].is_available
      });

    } catch (error) {
      fastify.log.error('Availability update error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // POST /api/driver/location
  // Body: { "latitude": 12.9715, "longitude": 77.5945 }
  fastify.post('/location', async (request, reply) => {
    const { latitude, longitude } = request.body || {};

    if (latitude === undefined || longitude === undefined) {
      return reply.code(400).send({
        success: false,
        message: 'latitude and longitude are required'
      });
    }

    const driverId = request.user.driverId;
    if (!driverId) {
      return reply.code(400).send({
        success: false,
        message: 'Driver profile not found'
      });
    }

    try {
      // Upsert into driver_locations table
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

      // Emit updated location to any active tracking rooms via Socket.IO
      if (fastify.io) {
        // Emit to a specific room for this driver, or broad update if necessary
        // A user tracking this driver can join a room like `track_driver_<driverId>`
        fastify.io.to(`track_driver_${driverId}`).emit('driver_movement', {
          driverId,
          latitude,
          longitude,
          timestamp: new Date().toISOString()
        });
      }

      return reply.code(200).send({
        success: true,
        message: 'Location updated successfully'
      });

    } catch (error) {
      fastify.log.error('Location update error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

};
