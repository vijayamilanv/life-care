const db = require('../config/db');
const { calculateDistance } = require('../utils/haversine');
const { sendSMS, triggerVoiceCall } = require('./smsService');
const { sendPushToUser } = require('./pushService');

let intervalId = null;

async function checkAndEscalateRequests(fastify) {
  try {
    const pendingRequestsRes = await db.query(`
      SELECT id, user_id, user_latitude, user_longitude, status, created_at, escalation_step 
      FROM emergency_requests 
      WHERE status = 'pending'
    `);
    
    const now = new Date();
    
    for (const request of pendingRequestsRes.rows) {
      const elapsedSeconds = Math.round((now - new Date(request.created_at)) / 1000);
      
      if (elapsedSeconds >= 60 && request.escalation_step < 3) {
        // T+60s: Escalation Level 3 -> Emergency Control Center
        console.log(`[Escalation Engine] Request ${request.id} pending for ${elapsedSeconds}s. Escalating to ECC (Step 3).`);
        
        await db.query(`
          UPDATE emergency_requests 
          SET escalation_step = 3, escalated_at = CURRENT_TIMESTAMP 
          WHERE id = $1
        `, [request.id]);
        
        await db.query(`
          INSERT INTO activity_logs (user_id, action, details) 
          VALUES ($1, 'ESCALATION_ECC', $2)
        `, [request.user_id, `Emergency request ${request.id} escalated to Emergency Control Center (ECC) due to no acceptance within 60 seconds`]);
        
        await db.query(`
          INSERT INTO notifications (user_id, title, message)
          VALUES ($1, 'ECC Escalation', 'Your request has been escalated to the State Control Center. A manual dispatcher is intervening.')
        `, [request.user_id]);
        
        sendPushToUser(
          request.user_id,
          'ECC Escalation',
          'Your emergency request is being processed by the State Control Center.',
          '/index.html'
        ).catch(err => console.error('[Push Service] ECC push error:', err.message));
        
        if (fastify && fastify.io) {
          fastify.io.to(`user_${request.user_id}`).emit('status_update', {
            requestId: request.id,
            status: 'pending',
            escalation_step: 3
          });
          fastify.io.to('available_drivers').emit('ecc_escalation', {
            requestId: request.id,
            elapsedSeconds
          });
        }
      } 
      else if (elapsedSeconds >= 40 && request.escalation_step < 2) {
        // T+40s: Escalation Level 2 -> Hospital Dispatcher
        console.log(`[Escalation Engine] Request ${request.id} pending for ${elapsedSeconds}s. Escalating to Hospital (Step 2).`);
        
        await db.query(`
          UPDATE emergency_requests 
          SET escalation_step = 2, escalated_at = CURRENT_TIMESTAMP 
          WHERE id = $1
        `, [request.id]);
        
        await db.query(`
          INSERT INTO activity_logs (user_id, action, details) 
          VALUES ($1, 'ESCALATION_HOSPITAL', $2)
        `, [request.user_id, `Emergency request ${request.id} escalated to Nearest Hospital Dispatch due to no acceptance within 40 seconds`]);
        
        await db.query(`
          INSERT INTO notifications (user_id, title, message)
          VALUES ($1, 'Hospital Alerted', 'Your request has been escalated to the nearest hospital dispatch dashboard.')
        `, [request.user_id]);
        
        sendPushToUser(
          request.user_id,
          'Hospital Alerted',
          'Nearest Hospital Dispatcher has been notified directly.',
          '/index.html'
        ).catch(err => console.error('[Push Service] Hospital push error:', err.message));
        
        if (fastify && fastify.io) {
          fastify.io.to(`user_${request.user_id}`).emit('status_update', {
            requestId: request.id,
            status: 'pending',
            escalation_step: 2
          });
          fastify.io.to('available_drivers').emit('hospital_escalation', {
            requestId: request.id,
            elapsedSeconds
          });
        }
      } 
      else if (elapsedSeconds >= 20 && request.escalation_step < 1) {
        // T+20s: Escalation Level 1 -> Next Closest Driver, SMS, Voice Call
        console.log(`[Escalation Engine] Request ${request.id} pending for ${elapsedSeconds}s. Escalating to Next Driver (Step 1).`);
        
        await db.query(`
          UPDATE emergency_requests 
          SET escalation_step = 1, escalated_at = CURRENT_TIMESTAMP 
          WHERE id = $1
        `, [request.id]);
        
        await db.query(`
          INSERT INTO activity_logs (user_id, action, details) 
          VALUES ($1, 'ESCALATION_DRIVER', $2)
        `, [request.user_id, `Emergency request ${request.id} escalated to next closest driver due to no acceptance within 20 seconds`]);
        
        await db.query(`
          INSERT INTO notifications (user_id, title, message)
          VALUES ($1, 'Escalating Dispatch', 'Alerting alternative drivers and placing emergency voice calls.')
        `, [request.user_id]);
        
        // Find available drivers and sort by distance
        const driversRes = await db.query(`
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
        `);
        
        const sortedDrivers = driversRes.rows.map(d => {
          const dist = calculateDistance(
            parseFloat(request.user_latitude),
            parseFloat(request.user_longitude),
            parseFloat(d.latitude),
            parseFloat(d.longitude)
          );
          return { ...d, distanceKm: dist };
        }).sort((a, b) => a.distanceKm - b.distanceKm);
        
        if (sortedDrivers.length > 0) {
          // Level 4: Voice Call to primary (closest) driver
          const primaryDriver = sortedDrivers[0];
          const voiceMessage = `Alert. Emergency request is waiting. Please accept on your dashboard.`;
          triggerVoiceCall(primaryDriver.driver_phone, voiceMessage).catch(err => {
            console.error('[Escalation Engine] Primary driver voice call failed:', err.message);
          });
          
          await db.query(`
            UPDATE emergency_requests 
            SET voice_called_at = CURRENT_TIMESTAMP 
            WHERE id = $1
          `, [request.id]);
        }
        
        if (sortedDrivers.length > 1) {
          // SMS fallback to secondary closest driver
          const secondaryDriver = sortedDrivers[1];
          const smsBody = `ESCALATED ALERT! Proximity: ${secondaryDriver.distanceKm} km. Client needs help. Navigate: https://www.google.com/maps/dir/?api=1&destination=${request.user_latitude},${request.user_longitude}`;
          
          sendSMS(secondaryDriver.driver_phone, smsBody).catch(err => {
            console.error('[Escalation Engine] Secondary driver SMS failed:', err.message);
          });
          
          await db.query(`
            UPDATE emergency_requests 
            SET last_sms_sent_at = CURRENT_TIMESTAMP 
            WHERE id = $1
          `, [request.id]);
        }
        
        if (fastify && fastify.io) {
          fastify.io.to(`user_${request.user_id}`).emit('status_update', {
            requestId: request.id,
            status: 'pending',
            escalation_step: 1
          });
          
          // Re-broadcast alert to available drivers
          fastify.io.to('available_drivers').emit('emergency_alert', {
            requestId: request.id,
            userLatitude: parseFloat(request.user_latitude),
            userLongitude: parseFloat(request.user_longitude),
            alertedDrivers: sortedDrivers.map(d => ({
              driverId: d.driver_id,
              userId: d.user_id,
              driverName: d.driver_name,
              phone: d.driver_phone,
              distanceKm: d.distanceKm
            }))
          });
        }
      }
    }
  } catch (error) {
    console.error('[Escalation Engine] Error scanning/escalating requests:', error);
  }
}

function startEscalationEngine(fastify, intervalMs = 10000) {
  if (intervalId) {
    clearInterval(intervalId);
  }
  
  console.log(`[Escalation Engine] Started. Scanning interval: ${intervalMs}ms`);
  
  intervalId = setInterval(() => {
    checkAndEscalateRequests(fastify);
  }, intervalMs);
  
  return intervalId;
}

function stopEscalationEngine() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[Escalation Engine] Stopped.');
  }
}

module.exports = {
  startEscalationEngine,
  stopEscalationEngine,
  checkAndEscalateRequests
};
