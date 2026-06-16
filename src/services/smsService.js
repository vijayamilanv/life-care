require('dotenv').config();

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
      return { success: true, sid: message.sid, provider: 'twilio' };
    } catch (error) {
      console.error(`[SMS Service] Twilio send failed to ${to}:`, error.message);
      // Fallback to mock on error to keep the workflow operational
      return sendMockSMS(to, body, error.message);
    }
  } else {
    return sendMockSMS(to, body);
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

module.exports = {
  sendSMS,
  isTwilioConfigured
};
