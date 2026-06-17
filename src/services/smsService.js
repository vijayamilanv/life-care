require('dotenv').config();
const db = require('../config/db');

async function logSMSToDB(phone, message, status, sid) {
  try {
    await db.query(
      'INSERT INTO sms_logs (recipient_phone, message, status, sid) VALUES ($1, $2, $3, $4)',
      [phone, message, status, sid]
    );
  } catch (err) {
    console.error('[SMS Service] Failed to write SMS log to DB:', err.message);
  }
}

async function logCallToDB(phone, content, status, sid) {
  try {
    await db.query(
      'INSERT INTO call_logs (recipient_phone, voice_content, status, sid) VALUES ($1, $2, $3, $4)',
      [phone, content, status, sid]
    );
  } catch (err) {
    console.error('[SMS Service] Failed to write Call log to DB:', err.message);
  }
}


const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;

let twilioClient = null;

// Determine if Twilio credentials are fully configured
const isTwilioConfigured = !!(accountSid && authToken && fromNumber);

if (isTwilioConfigured) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(accountSid, authToken);
    console.log('[SMS Service] Twilio Client initialized successfully.');
  } catch (err) {
    console.error('[SMS Service] Failed to initialize Twilio client:', err.message);
  }
} else {
  console.log('[SMS Service] Twilio environment parameters are missing. Running in MOCK SMS mode.');
}

/**
 * Sends an SMS text message to a recipient.
 * 
 * @param {string} to Recipient phone number (e.g. +919876543210)
 * @param {string} body Message content
 * @returns {Promise<object>} Status result containing message ID
 */
async function sendSMS(to, body) {
  if (isTwilioConfigured && twilioClient) {
    try {
      console.log(`[SMS Service] Sending real SMS to ${to} via Twilio...`);
      const message = await twilioClient.messages.create({
        body,
        from: fromNumber,
        to
      });
      console.log(`[SMS Service] SMS sent successfully. Twilio Message SID: ${message.sid}`);
      await logSMSToDB(to, body, 'success', message.sid);
      return { success: true, sid: message.sid, provider: 'twilio' };
    } catch (error) {
      console.error(`[SMS Service] Twilio send failed to ${to}:`, error.message);
      await logSMSToDB(to, body, 'failed', null);
      // Fallback to mock on error to keep the workflow operational
      return sendMockSMS(to, body, error.message);
    }
  } else {
    const res = await sendMockSMS(to, body);
    await logSMSToDB(to, body, 'success', res.sid);
    return res;
  }
}

function sendMockSMS(to, body, errorDetails = null) {
  const mockSid = `MOCK_SMS_SID_${Math.floor(Math.random() * 1000000000)}`;
  
  console.log('==================================================');
  console.log(`[SMS MOCK DISPATCH] -> Target Number: ${to}`);
  if (errorDetails) {
    console.log(`[SMS WARNING] Twilio configuration failed with error: "${errorDetails}"`);
  }
  console.log(`[SMS CONTENT]:`);
  console.log(body);
  console.log('==================================================');

  return Promise.resolve({
    success: true,
    sid: mockSid,
    provider: 'mock',
    status: 'logged'
  });
}

/**
 * Triggers an automated IVR voice call escalation to a recipient.
 * 
 * @param {string} to Recipient phone number
 * @param {string} message Text message to be read by synthesized voice
 * @returns {Promise<object>} Status result containing call SID
 */
async function triggerVoiceCall(to, message) {
  if (isTwilioConfigured && twilioClient) {
    try {
      console.log(`[Voice Service] Triggering real voice call escalation to ${to} via Twilio...`);
      const call = await twilioClient.calls.create({
        twiml: `<Response><Pause length="1"/><Say voice="alice" loop="2">${message}</Say></Response>`,
        to,
        from: fromNumber
      });
      console.log(`[Voice Service] Voice call placed. Twilio Call SID: ${call.sid}`);
      await logCallToDB(to, message, 'success', call.sid);
      return { success: true, sid: call.sid, provider: 'twilio' };
    } catch (error) {
      console.error(`[Voice Service] Twilio voice call failed to ${to}:`, error.message);
      await logCallToDB(to, message, 'failed', null);
      return triggerMockVoiceCall(to, message, error.message);
    }
  } else {
    const res = await triggerMockVoiceCall(to, message);
    await logCallToDB(to, message, 'success', res.sid);
    return res;
  }
}

function triggerMockVoiceCall(to, message, errorDetails = null) {
  const mockSid = `MOCK_CALL_SID_${Math.floor(Math.random() * 1000000000)}`;
  
  console.log('==================================================');
  console.log(`[VOICE CALL MOCK DISPATCH] -> Target Number: ${to}`);
  if (errorDetails) {
    console.log(`[VOICE WARNING] Twilio config failed with error: "${errorDetails}"`);
  }
  console.log(`[VOICE CONTENT]: "${message}"`);
  console.log('==================================================');

  return Promise.resolve({
    success: true,
    sid: mockSid,
    provider: 'mock',
    status: 'called'
  });
}

module.exports = {
  sendSMS,
  triggerVoiceCall,
  isTwilioConfigured
};

