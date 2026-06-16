const db = require('../config/db');
const { authenticate } = require('../middleware/auth');
const pushService = require('../services/pushService');


module.exports = async function (fastify, opts) {

  // Apply authentication
  fastify.addHook('preHandler', authenticate);

  // GET /api/notifications
  fastify.get('/', async (request, reply) => {
    try {
      const queryText = `
        SELECT id, title, message, is_read, created_at 
        FROM notifications 
        WHERE user_id = $1 
        ORDER BY created_at DESC 
        LIMIT 50
      `;
      const res = await db.query(queryText, [request.user.id]);
      
      return reply.code(200).send({
        success: true,
        notifications: res.rows
      });

    } catch (error) {
      fastify.log.error('Fetch notifications error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // PUT /api/notifications/read
  fastify.put('/read', async (request, reply) => {
    try {
      const updateText = `
        UPDATE notifications 
        SET is_read = true 
        WHERE user_id = $1 AND is_read = false
      `;
      await db.query(updateText, [request.user.id]);

      return reply.code(200).send({
        success: true,
        message: 'All notifications marked as read'
      });

    } catch (error) {
      fastify.log.error('Mark read notifications error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // GET /api/notifications/vapid-public-key
  fastify.get('/vapid-public-key', async (request, reply) => {
    try {
      const publicKey = pushService.getPublicKey();
      return reply.code(200).send({
        success: true,
        publicKey
      });
    } catch (error) {
      fastify.log.error('Fetch VAPID public key error:', error);
      return reply.code(500).send({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/notifications/subscribe
  // Body: { "subscription": { ... } }
  fastify.post('/subscribe', async (request, reply) => {
    const { subscription } = request.body || {};

    if (!subscription || !subscription.endpoint) {
      return reply.code(400).send({
        success: false,
        message: 'subscription object with valid endpoint is required'
      });
    }

    try {
      // Upsert browser subscription data
      const upsertQuery = `
        INSERT INTO push_subscriptions (user_id, endpoint, subscription_data)
        VALUES ($1, $2, $3)
        ON CONFLICT (endpoint) 
        DO UPDATE SET 
          user_id = EXCLUDED.user_id,
          subscription_data = EXCLUDED.subscription_data
        RETURNING id
      `;
      await db.query(upsertQuery, [
        request.user.id,
        subscription.endpoint,
        JSON.stringify(subscription)
      ]);

      return reply.code(200).send({
        success: true,
        message: 'Push subscription saved successfully'
      });

    } catch (error) {
      fastify.log.error('Save push subscription error:', error);
      return reply.code(500).send({
        success: false,
        message: 'Internal server error'
      });
    }
  });

};
