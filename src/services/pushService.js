require('dotenv').config();
const webPush = require('web-push');
const db = require('../config/db');

let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

// Auto-generate VAPID keys on startup if they are missing in env
if (!vapidPublicKey || !vapidPrivateKey) {
  console.log('[Push Service] VAPID keys not configured in environment variables.');
  const generatedKeys = webPush.generateVAPIDKeys();
  vapidPublicKey = generatedKeys.publicKey;
  vapidPrivateKey = generatedKeys.privateKey;
  console.log('==================================================');
  console.log('[WARNING] Generated temporary VAPID Keys for this run:');
  console.log(`VAPID_PUBLIC_KEY=${vapidPublicKey}`);
  console.log(`VAPID_PRIVATE_KEY=${vapidPrivateKey}`);
  console.log('Please copy these keys to your .env file for persistence.');
  console.log('==================================================');
}

// Set VAPID Details
webPush.setVapidDetails(
  'mailto:support@smartrescue.com',
  vapidPublicKey,
  vapidPrivateKey
);

/**
 * Returns the active public VAPID key
 */
function getPublicKey() {
  return vapidPublicKey;
}

/**
 * Sends a native push notification to a device endpoint
 * 
 * @param {object} subscription Subscription object from browser
 * @param {object} payload Notification content: { title, body, url }
 */
async function sendPushNotification(subscription, payload) {
  try {
    const payloadString = JSON.stringify(payload);
    await webPush.sendNotification(subscription, payloadString);
    return { success: true };
  } catch (error) {
    // 410 (Gone) or 404 (Not Found) indicates subscription has expired or unsubscribed
    if (error.statusCode === 410 || error.statusCode === 404) {
      console.log(`[Push Service] Subscription expired. Purging endpoint: ${subscription.endpoint}`);
      await db.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [subscription.endpoint]);
    } else {
      console.error('[Push Service] Error broadcasting web push:', error.message);
    }
    throw error;
  }
}

/**
 * Sends a push notification to all active device subscriptions of a user
 * 
 * @param {number} userId Target user identifier
 * @param {string} title Notification header
 * @param {string} body Notification message
 * @param {string} url Action redirection link
 */
async function sendPushToUser(userId, title, body, url = '/') {
  try {
    const res = await db.query(
      'SELECT subscription_data FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );

    if (res.rows.length === 0) {
      return { success: false, reason: 'No subscriptions found for user' };
    }

    const payload = { title, body, url };
    const pushPromises = res.rows.map(row => {
      const subscription = row.subscription_data;
      return sendPushNotification(subscription, payload).catch(() => {
        // Suppress individual device failures to let other devices complete
      });
    });

    await Promise.all(pushPromises);
    return { success: true, count: pushPromises.length };

  } catch (err) {
    console.error(`[Push Service] Failed to send push to user ${userId}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  getPublicKey,
  sendPushNotification,
  sendPushToUser
};
