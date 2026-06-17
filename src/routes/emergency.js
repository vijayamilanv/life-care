const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { calculateDistance } = require('../utils/haversine');
const { sendSMS } = require('../services/smsService');
const { sendPushToUser } = require('../services/pushService');


module.exports = async function (fastify, opts) {

  // Apply authentication to all routes
  fastify.addHook('preHandler', authenticate);

  // POST /api/emergency/request
  // Body: { "latitude": 12.9715, "longitude": 77.5945 }
  fastify.post('/request', async (request, reply) => {
    // Only users can request
    if (request.user.role !== 'user') {
      return reply.code(403).send({
        success: false,
        message: 'Only users can request ambulances'
      });
    }

    const { latitude, longitude, request_uuid } = request.body || {};
    if (latitude === undefined || longitude === undefined) {
      return reply.code(400).send({
        success: false,
        message: 'latitude and longitude are required'
      });
    }

    const userLat = parseFloat(latitude);
    const userLng = parseFloat(longitude);

    if (isNaN(userLat) || isNaN(userLng)) {
      return reply.code(400).send({
        success: false,
        message: 'latitude and longitude must be valid numbers'
      });
    }

    try {
      // Deduplicate request if request_uuid is provided
      if (request_uuid) {
        const existingRes = await db.query(
          'SELECT id, user_id, user_latitude, user_longitude, status, created_at, request_uuid FROM emergency_requests WHERE request_uuid = $1',
          [request_uuid]
        );
        if (existingRes.rows.length > 0) {
          const existingRequest = existingRes.rows[0];
          return reply.code(200).send({
            success: true,
            request: {
              id: existingRequest.id,
              userId: existingRequest.user_id,
              userLatitude: parseFloat(existingRequest.user_latitude),
              userLongitude: parseFloat(existingRequest.user_longitude),
              status: existingRequest.status,
              createdAt: existingRequest.created_at,
              requestUuid: existingRequest.request_uuid
            },
            message: 'Request already exists (deduplicated)'
          });
        }
      }

      // Create emergency request in DB
      const insertQuery = `
        INSERT INTO emergency_requests (user_id, user_latitude, user_longitude, status, request_uuid)
        VALUES ($1, $2, $3, 'pending', $4)
        RETURNING id, user_id, user_latitude, user_longitude, status, created_at, request_uuid
      `;
      const res = await db.query(insertQuery, [request.user.id, userLat, userLng, request_uuid || null]);
      const emergencyRequest = res.rows[0];

      // Audit Log
      await db.query(
        'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
        [request.user.id, 'EMERGENCY_REQUEST', `Emergency request ${emergencyRequest.id} created`]
      );

      // Retrieve requester contact details for SMS dispatch
      const requesterRes = await db.query('SELECT name, phone FROM users WHERE id = $1', [request.user.id]);
      const requesterName = requesterRes.rows[0]?.name || 'Citizen';
      const requesterPhone = requesterRes.rows[0]?.phone || 'Unknown';

      // Find nearby available drivers and their contact numbers
      const driversQuery = `
        SELECT 
          d.id AS driver_id,
          u.id AS user_id,
          u.name AS driver_name,
          u.phone AS driver_phone,
          dl.latitude,
          dl.longitude
        FROM drivers d
        JOIN users u ON d.user_id = u.id
        JOIN driver_locations dl ON d.id = dl.driver_id
        WHERE d.is_available = true
      `;
      const driversRes = await db.query(driversQuery);

      const alertedDrivers = driversRes.rows.map(driver => {
        const dist = calculateDistance(userLat, userLng, parseFloat(driver.latitude), parseFloat(driver.longitude));
        return {
          driverId: driver.driver_id,
          userId: driver.user_id,
          driverName: driver.driver_name,
          phone: driver.driver_phone,
          distanceKm: dist
        };
      });

      // Sort nearest drivers first
      alertedDrivers.sort((a, b) => a.distanceKm - b.distanceKm);

      // Trigger fallback SMS dispatch to the absolute nearest available driver
      if (alertedDrivers.length > 0) {
        const nearestDriver = alertedDrivers[0];
        const smsBody = `EMERGENCY ALERT! Accident Victim: ${requesterName} (Phone: ${requesterPhone}) is requesting assistance. Proximity: ${nearestDriver.distanceKm} km. Navigate: https://www.google.com/maps/dir/?api=1&destination=${userLat},${userLng}`;
        
        // Run SMS asynchronously in the background so it does not block the response
        sendSMS(nearestDriver.phone, smsBody).catch(err => {
          console.error('[SMS Service] Failed to trigger dispatch SMS to driver:', err.message);
        });
      }

      // Trigger web push notification alerts to all online drivers
      driversRes.rows.forEach(driver => {
        const dist = alertedDrivers.find(d => d.driverId === driver.driver_id)?.distanceKm || 0;
        sendPushToUser(
          driver.user_id,
          'INCOMING EMERGENCY ALERT!',
          `Accident Victim: ${requesterName} is ${dist} km away. Click to accept.`,
          '/index.html'
        ).catch(err => console.error('[Push Service] Driver alert push error:', err.message));
      });

      // 1. Hospital Recommendation Engine (Capacity & Proximity Scoring)
      let recommendedHospital = null;
      try {
        const hospitalsRes = await db.query(`
          SELECT h.id, h.name, h.latitude, h.longitude, h.contact_number, h.address,
                 c.total_beds, c.available_beds, c.total_icu_beds, c.available_icu_beds
          FROM hospitals h
          LEFT JOIN hospital_capacity c ON h.id = c.hospital_id
        `);
        
        if (hospitalsRes.rows.length > 0) {
          const sortedHospitals = hospitalsRes.rows.map(h => {
            const dist = calculateDistance(userLat, userLng, parseFloat(h.latitude), parseFloat(h.longitude));
            const availICU = parseInt(h.available_icu_beds || 0);
            const availBeds = parseInt(h.available_beds || 0);
            // Lower score is better (closer distance, higher ICU and bed availability)
            const score = (dist * 0.4) - (availICU * 1.5) - (availBeds * 0.2);
            return { ...h, distanceKm: dist, score };
          }).sort((a, b) => a.score - b.score);
          
          recommendedHospital = sortedHospitals[0];
          
          // Log alert to hospital
          const etaMinutes = Math.round((recommendedHospital.distanceKm / 40) * 60) + 5;
          await db.query(`
            INSERT INTO hospital_alerts (hospital_id, request_id, eta_minutes, severity, status)
            VALUES ($1, $2, $3, 'critical', 'pending')
          `, [recommendedHospital.id, emergencyRequest.id, etaMinutes]);
        }
      } catch (hErr) {
        console.error('[Hospital Recommendation] Failed:', hErr.message);
      }

      // 2. Police Coordination Alert
      try {
        await db.query(`
          INSERT INTO police_alerts (request_id, badge_number, status)
          VALUES ($1, 'HQ-DISPATCH-MAIN', 'dispatched')
        `, [emergencyRequest.id]);
      } catch (pErr) {
        console.error('[Police Alert] Failed:', pErr.message);
      }

      // Notify available drivers in real-time via Socket.IO
      if (fastify.io) {
        // We broadcast the alert to the 'available_drivers' room.
        // The clients will check if the alert applies to them. We also pass details.
        fastify.io.to('available_drivers').emit('emergency_alert', {
          requestId: emergencyRequest.id,
          userLatitude: userLat,
          userLongitude: userLng,
          alertedDrivers // List of drivers and their distance from user
        });
      }

      return reply.code(201).send({
        success: true,
        request: emergencyRequest,
        recommendedHospital
      });

    } catch (error) {
      console.error('Create emergency request error:', error);
      fastify.log.error('Create emergency request error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // GET /api/emergency/status/:id
  fastify.get('/status/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const queryText = `
        SELECT 
          er.id, er.user_id, er.driver_id, er.user_latitude, er.user_longitude, er.status, er.created_at,
          u.name AS user_name, u.phone AS user_phone,
          d.vehicle_number, d.ambulance_type,
          du.name AS driver_name, du.phone AS driver_phone,
          dl.latitude AS driver_latitude, dl.longitude AS driver_longitude
        FROM emergency_requests er
        JOIN users u ON er.user_id = u.id
        LEFT JOIN drivers d ON er.driver_id = d.id
        LEFT JOIN users du ON d.user_id = du.id
        LEFT JOIN driver_locations dl ON d.id = dl.driver_id
        WHERE er.id = $1
      `;
      const res = await db.query(queryText, [id]);

      if (res.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          message: 'Emergency request not found'
        });
      }

      const row = res.rows[0];

      // Security check: only the requesting user or assigned driver can view this status
      if (request.user.role === 'user' && request.user.id !== row.user_id) {
        return reply.code(403).send({
          success: false,
          message: 'Access denied'
        });
      }
      if (request.user.role === 'driver' && request.user.driverId !== row.driver_id) {
        // Allow online drivers to view pending requests to accept them
        if (row.status !== 'pending') {
          return reply.code(403).send({
            success: false,
            message: 'Access denied'
          });
        }
      }

      let distanceKm = null;
      if (row.driver_latitude !== null && row.driver_longitude !== null) {
        distanceKm = calculateDistance(
          parseFloat(row.user_latitude),
          parseFloat(row.user_longitude),
          parseFloat(row.driver_latitude),
          parseFloat(row.driver_longitude)
        );
      }

      return reply.code(200).send({
        success: true,
        request: {
          id: row.id,
          userId: row.user_id,
          userName: row.user_name,
          userPhone: row.user_phone,
          userLatitude: parseFloat(row.user_latitude),
          userLongitude: parseFloat(row.user_longitude),
          status: row.status,
          createdAt: row.created_at,
          driverId: row.driver_id,
          driverName: row.driver_name,
          driverPhone: row.driver_phone,
          vehicleNumber: row.vehicle_number,
          ambulanceType: row.ambulance_type,
          driverLatitude: row.driver_latitude ? parseFloat(row.driver_latitude) : null,
          driverLongitude: row.driver_longitude ? parseFloat(row.driver_longitude) : null,
          distanceKm
        }
      });

    } catch (error) {
      fastify.log.error('Get emergency status error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // PUT /api/emergency/action/:id
  // Body: { "action": "accept" | "reject" | "arrive" | "complete" }
  fastify.put('/action/:id', async (request, reply) => {
    const { id } = request.params;
    const { action } = request.body || {};

    if (!['accept', 'reject', 'arrive', 'complete'].includes(action)) {
      return reply.code(400).send({
        success: false,
        message: 'Invalid action. Must be accept, reject, arrive, or complete'
      });
    }

    try {
      // 1. Fetch current request state
      const requestRes = await db.query('SELECT * FROM emergency_requests WHERE id = $1', [id]);
      if (requestRes.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          message: 'Emergency request not found'
        });
      }

      const emergencyRequest = requestRes.rows[0];

      if (action === 'accept') {
        if (request.user.role !== 'driver') {
          return reply.code(403).send({ success: false, message: 'Only drivers can accept requests' });
        }
        
        const driverId = request.user.driverId;
        if (!driverId) {
          return reply.code(400).send({ success: false, message: 'Driver profile missing' });
        }

        // Concurrency lock: first driver to accept updates the status
        if (emergencyRequest.status !== 'pending') {
          return reply.code(400).send({
            success: false,
            message: 'Request is no longer pending (already accepted or completed)'
          });
        }

        // Calculate response time in seconds
        const createdAt = new Date(emergencyRequest.created_at);
        const now = new Date();
        const responseTimeSeconds = Math.round((now - createdAt) / 1000);

        const client = await db.pool.connect();
        try {
          await client.query('BEGIN');
          
          // Assign driver and update status
          const updateRequestText = `
            UPDATE emergency_requests 
            SET driver_id = $1, status = 'accepted', response_time = $2 
            WHERE id = $3 AND status = 'pending'
            RETURNING *
          `;
          const updateRes = await client.query(updateRequestText, [driverId, responseTimeSeconds, id]);
          
          if (updateRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return reply.code(400).send({
              success: false,
              message: 'Failed to accept: request was accepted by another driver'
            });
          }

          // Mark driver as unavailable while executing emergency dispatch
          await client.query('UPDATE drivers SET is_available = false WHERE id = $1', [driverId]);
          
          // Add notification for the user
          await client.query(`
            INSERT INTO notifications (user_id, title, message)
            VALUES ($1, 'Ambulance Assigned', 'A driver has accepted your emergency request and is heading to your location.')
          `, [emergencyRequest.user_id]);

          // Log status history transition
          await client.query(`
            INSERT INTO request_status_history (request_id, status)
            VALUES ($1, 'accepted')
          `, [id]);

          await client.query('COMMIT');

          // Retrieve updated driver information to send to user
          const driverInfoQuery = `
            SELECT 
              u.name AS driver_name, u.phone AS driver_phone,
              d.vehicle_number, d.ambulance_type,
              dl.latitude AS driver_latitude, dl.longitude AS driver_longitude
            FROM drivers d
            JOIN users u ON d.user_id = u.id
            JOIN driver_locations dl ON d.id = dl.driver_id
            WHERE d.id = $1
          `;
          const driverInfoRes = await db.query(driverInfoQuery, [driverId]);
          const driverInfo = driverInfoRes.rows[0];

          // Real-time socket notices
          if (fastify.io) {
            // Notify user
            fastify.io.to(`user_${emergencyRequest.user_id}`).emit('request_accepted', {
              requestId: id,
              status: 'accepted',
              driverId,
              driverName: driverInfo.driver_name,
              driverPhone: driverInfo.driver_phone,
              vehicleNumber: driverInfo.vehicle_number,
              ambulanceType: driverInfo.ambulance_type,
              driverLatitude: parseFloat(driverInfo.driver_latitude),
              driverLongitude: parseFloat(driverInfo.driver_longitude)
            });

            // Notify all drivers to close the alert card
            fastify.io.to('available_drivers').emit('request_closed', {
              requestId: id
            });
          }

          // Send web push notification to user
          sendPushToUser(
            emergencyRequest.user_id,
            'Ambulance Assigned',
            `Driver ${driverInfo.driver_name} (${driverInfo.vehicle_number}) has accepted your request.`,
            '/index.html'
          ).catch(err => console.error('[Push Service] User assign push error:', err.message));

          // Audit Log
          await db.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
            [request.user.id, 'REQUEST_ACCEPTED', `Driver ${driverId} accepted request ${id}`]
          );

          return reply.code(200).send({
            success: true,
            status: 'accepted',
            message: 'Emergency request accepted successfully'
          });

        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }

      if (action === 'reject') {
        if (request.user.role !== 'driver') {
          return reply.code(403).send({ success: false, message: 'Only drivers can reject requests' });
        }
        
        // Drivers simply reject the visual card on frontend. We can log it.
        await db.query(
          'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
          [request.user.id, 'REQUEST_REJECTED', `Driver rejected alert for request ${id}`]
        );
        return reply.code(200).send({
          success: true,
          message: 'Request rejected visually'
        });
      }

      if (action === 'arrive') {
        if (request.user.role !== 'driver') {
          return reply.code(403).send({ success: false, message: 'Only drivers can trigger actions' });
        }
        if (emergencyRequest.driver_id !== request.user.driverId) {
          return reply.code(403).send({ success: false, message: 'Not authorized: you are not the assigned driver' });
        }
        if (emergencyRequest.status !== 'accepted') {
          return reply.code(400).send({ success: false, message: 'Request must be in accepted status to mark arrival' });
        }

        const updateText = `
          UPDATE emergency_requests 
          SET status = 'arrived', arrival_time = CURRENT_TIMESTAMP 
          WHERE id = $1 
          RETURNING *
        `;
        const updateRes = await db.query(updateText, [id]);

        // Add notification for the user
        await db.query(`
          INSERT INTO notifications (user_id, title, message)
          VALUES ($1, 'Ambulance Arrived', 'The driver has arrived at your location.')
        `, [emergencyRequest.user_id]);

        // Log status history transition
        await db.query(`
          INSERT INTO request_status_history (request_id, status)
          VALUES ($1, 'arrived')
        `, [id]);

        // Send web push to user
        sendPushToUser(
          emergencyRequest.user_id,
          'Ambulance Arrived',
          'Your ambulance driver has arrived at the scene.',
          '/index.html'
        ).catch(err => console.error('[Push Service] User arrival push error:', err.message));

        // Socket notify
        if (fastify.io) {
          fastify.io.to(`user_${emergencyRequest.user_id}`).emit('status_update', {
            requestId: id,
            status: 'arrived'
          });
        }

        // Audit Log
        await db.query(
          'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
          [request.user.id, 'DRIVER_ARRIVED', `Driver arrived for request ${id}`]
        );

        return reply.code(200).send({
          success: true,
          status: 'arrived',
          message: 'Arrived at destination'
        });
      }

      if (action === 'complete') {
        if (request.user.role !== 'driver') {
          return reply.code(403).send({ success: false, message: 'Only drivers can trigger actions' });
        }
        if (emergencyRequest.driver_id !== request.user.driverId) {
          return reply.code(403).send({ success: false, message: 'Not authorized: you are not the assigned driver' });
        }
        if (emergencyRequest.status !== 'arrived' && emergencyRequest.status !== 'accepted') {
          return reply.code(400).send({ success: false, message: 'Request must be accepted or arrived to mark complete' });
        }

        const client = await db.pool.connect();
        try {
          await client.query('BEGIN');

          const updateRequestText = `
            UPDATE emergency_requests 
            SET status = 'completed', completion_time = CURRENT_TIMESTAMP 
            WHERE id = $1 
            RETURNING *
          `;
          await client.query(updateRequestText, [id]);

          // Make driver available again
          await client.query('UPDATE drivers SET is_available = true WHERE id = $1', [request.user.driverId]);

          // Add notification for the user
          await client.query(`
            INSERT INTO notifications (user_id, title, message)
            VALUES ($1, 'Trip Completed', 'Your emergency trip has been completed successfully.')
          `, [emergencyRequest.user_id]);

          // Log status history transition
          await client.query(`
            INSERT INTO request_status_history (request_id, status)
            VALUES ($1, 'completed')
          `, [id]);

          // Send web push to user
          sendPushToUser(
            emergencyRequest.user_id,
            'Rescue Operation Completed',
            'Your trip has completed successfully.',
            '/index.html'
          ).catch(err => console.error('[Push Service] User completion push error:', err.message));

          await client.query('COMMIT');

          // Socket notify
          if (fastify.io) {
            fastify.io.to(`user_${emergencyRequest.user_id}`).emit('emergency_completed', {
              requestId: id,
              status: 'completed'
            });
          }

          // Audit Log
          await db.query(
            'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
            [request.user.id, 'REQUEST_COMPLETED', `Driver completed request ${id}`]
          );

          return reply.code(200).send({
            success: true,
            status: 'completed',
            message: 'Trip completed successfully'
          });

        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }

    } catch (error) {
      fastify.log.error('Put action error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

};
