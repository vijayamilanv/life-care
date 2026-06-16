const db = require('../config/db');
const { requireUser } = require('../middleware/auth');
const { calculateDistance } = require('../utils/haversine');

module.exports = async function (fastify, opts) {
  
  // Apply user auth middleware to all routes in this plugin
  fastify.addHook('preHandler', requireUser);

  // GET /api/user/ambulances
  // Query parameters: ?latitude=12.9715&longitude=77.5945
  fastify.get('/ambulances', async (request, reply) => {
    const { latitude, longitude } = request.query || {};

    if (latitude === undefined || longitude === undefined) {
      return reply.code(400).send({
        success: false,
        message: 'Missing required query parameters: latitude and longitude are required'
      });
    }

    const userLat = parseFloat(latitude);
    const userLng = parseFloat(longitude);

    if (isNaN(userLat) || isNaN(userLng)) {
      return reply.code(400).send({
        success: false,
        message: 'latitude and longitude must be valid floating point numbers'
      });
    }

    try {
      // Query all available drivers and their coordinates
      const queryText = `
        SELECT 
          d.id AS driver_id,
          d.vehicle_number,
          d.ambulance_type,
          u.name AS driver_name,
          u.phone AS driver_phone,
          dl.latitude,
          dl.longitude
        FROM drivers d
        JOIN users u ON d.user_id = u.id
        JOIN driver_locations dl ON d.id = dl.driver_id
        WHERE d.is_available = true
      `;
      const res = await db.query(queryText);

      // Map and calculate Haversine distance
      const ambulances = res.rows.map(driver => {
        const distance = calculateDistance(
          userLat, 
          userLng, 
          parseFloat(driver.latitude), 
          parseFloat(driver.longitude)
        );
        return {
          driverId: driver.driver_id,
          driverName: driver.driver_name,
          driverPhone: driver.driver_phone,
          vehicleNumber: driver.vehicle_number,
          ambulanceType: driver.ambulance_type,
          latitude: parseFloat(driver.latitude),
          longitude: parseFloat(driver.longitude),
          distanceKm: distance
        };
      });

      // Sort nearest first
      ambulances.sort((a, b) => a.distanceKm - b.distanceKm);

      return reply.code(200).send({
        success: true,
        ambulances
      });

    } catch (error) {
      fastify.log.error('Fetch ambulances error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

};
