const db = require('../config/db');
const { authenticate } = require('../middleware/auth');

module.exports = async function (fastify, opts) {

  // Apply authentication to all routes
  fastify.addHook('preHandler', authenticate);

  // GET /api/national/hospitals
  fastify.get('/hospitals', async (request, reply) => {
    try {
      const res = await db.query(`
        SELECT h.id, h.name, h.latitude, h.longitude, h.contact_number, h.address,
               c.total_beds, c.available_beds, c.total_icu_beds, c.available_icu_beds
        FROM hospitals h
        LEFT JOIN hospital_capacity c ON h.id = c.hospital_id
        ORDER BY h.name
      `);
      return reply.code(200).send({
        success: true,
        hospitals: res.rows
      });
    } catch (error) {
      fastify.log.error('Fetch national hospitals error:', error);
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  });

  // PUT /api/national/hospital/capacity/:id
  fastify.put('/hospital/capacity/:id', async (request, reply) => {
    const { id } = request.params;
    const { total_beds, available_beds, total_icu_beds, available_icu_beds } = request.body || {};

    if (total_beds === undefined || available_beds === undefined || total_icu_beds === undefined || available_icu_beds === undefined) {
      return reply.code(400).send({
        success: false,
        message: 'total_beds, available_beds, total_icu_beds, available_icu_beds are required'
      });
    }

    try {
      await db.query(`
        INSERT INTO hospital_capacity (hospital_id, total_beds, available_beds, total_icu_beds, available_icu_beds)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (hospital_id) DO UPDATE SET 
          total_beds = EXCLUDED.total_beds,
          available_beds = EXCLUDED.available_beds,
          total_icu_beds = EXCLUDED.total_icu_beds,
          available_icu_beds = EXCLUDED.available_icu_beds,
          updated_at = CURRENT_TIMESTAMP
      `, [id, total_beds, available_beds, total_icu_beds, available_icu_beds]);

      return reply.code(200).send({
        success: true,
        message: 'Hospital capacity updated successfully'
      });
    } catch (error) {
      fastify.log.error('Update hospital capacity error:', error);
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  });

  // GET /api/national/police-alerts
  fastify.get('/police-alerts', async (request, reply) => {
    try {
      const res = await db.query(`
        SELECT p.id, p.request_id, p.badge_number, p.status, p.created_at,
               er.user_latitude, er.user_longitude, u.name AS victim_name
        FROM police_alerts p
        JOIN emergency_requests er ON p.request_id = er.id
        JOIN users u ON er.user_id = u.id
        ORDER BY p.created_at DESC
        LIMIT 50
      `);
      return reply.code(200).send({
        success: true,
        alerts: res.rows
      });
    } catch (error) {
      fastify.log.error('Fetch police alerts error:', error);
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  });

  // GET /api/national/logs
  fastify.get('/logs', async (request, reply) => {
    try {
      const res = await db.query(`
        SELECT * FROM (
          SELECT 'SMS' AS type, recipient_phone, message AS content, status, created_at FROM sms_logs
          UNION ALL
          SELECT 'Voice' AS type, recipient_phone, voice_content AS content, status, created_at FROM call_logs
        ) AS combined_logs
        ORDER BY created_at DESC
        LIMIT 50
      `);
      return reply.code(200).send({
        success: true,
        logs: res.rows
      });
    } catch (error) {
      fastify.log.error('Fetch gateway logs error:', error);
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  });

  // GET /api/national/active-requests
  fastify.get('/active-requests', async (request, reply) => {
    try {
      const res = await db.query(`
        SELECT er.id, er.user_id, er.driver_id, er.user_latitude, er.user_longitude, er.status, er.created_at, er.escalation_step,
               u.name AS victim_name, u.phone AS victim_phone,
               ha.hospital_id, h.name AS recommended_hospital_name,
               du.name AS driver_name, d.vehicle_number
        FROM emergency_requests er
        JOIN users u ON er.user_id = u.id
        LEFT JOIN hospital_alerts ha ON er.id = ha.request_id
        LEFT JOIN hospitals h ON ha.hospital_id = h.id
        LEFT JOIN drivers d ON er.driver_id = d.id
        LEFT JOIN users du ON d.user_id = du.id
        WHERE er.status IN ('pending', 'accepted', 'arrived')
        ORDER BY er.created_at DESC
      `);
      return reply.code(200).send({
        success: true,
        requests: res.rows
      });
    } catch (error) {
      fastify.log.error('Fetch active requests error:', error);
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  });

};
