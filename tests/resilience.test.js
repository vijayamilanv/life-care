const app = require('../src/app');
const db = require('../src/config/db');

// Set longer timeout to accommodate Neon serverless cold-start connection latency
jest.setTimeout(25000);

let userToken = '';
let userId = null;
let driverToken = '';
let driverId = null;

beforeAll(async () => {
  // Register a test user
  const email = `resilience_user_${Date.now()}@test.com`;
  const registerRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      name: 'Resilience Test User',
      email,
      password: 'password123',
      phone: '+919876543210',
      role: 'user'
    }
  });
  
  const body = JSON.parse(registerRes.body);
  userToken = body.token;
  userId = body.user.id;

  // Register a test driver
  const driverEmail = `resilience_driver_${Date.now()}@test.com`;
  const registerDriverRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      name: 'Resilience Test Driver',
      email: driverEmail,
      password: 'password123',
      phone: '+918765432109',
      role: 'driver',
      vehicle_number: `DL-resilience-${Date.now() % 10000}`,
      ambulance_type: 'ALS'
    }
  });
  const driverBody = JSON.parse(registerDriverRes.body);
  driverToken = driverBody.token;
  
  // Retrieve the driver's ID from database
  const driverQuery = await db.query('SELECT id FROM drivers WHERE user_id = $1', [driverBody.user.id]);
  driverId = driverQuery.rows[0].id;
  
  // Set driver location to be close to the test user
  await db.query(`
    INSERT INTO driver_locations (driver_id, latitude, longitude)
    VALUES ($1, 12.9715, 77.5945)
    ON CONFLICT (driver_id) DO UPDATE SET latitude = 12.9715, longitude = 77.5945
  `, [driverId]);
  
  // Make driver available
  await db.query('UPDATE drivers SET is_available = true WHERE id = $1', [driverId]);
});

afterAll(async () => {
  // Clean up test users and drivers
  if (userId) {
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
  }
  if (driverId) {
    await db.query('DELETE FROM drivers WHERE id = $1', [driverId]);
  }
  await db.pool.end();
  await app.close();
});

describe('Resilience and Escalation System Tests', () => {

  test('Deduplication: POST /api/emergency/request with same request_uuid returns the same request', async () => {
    const uuid = `12345678-1234-1234-1234-${Date.now().toString().padStart(12, '0').slice(-12)}`;
    
    // First request
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/emergency/request',
      headers: {
        Authorization: `Bearer ${userToken}`
      },
      payload: {
        latitude: 12.9715,
        longitude: 77.5945,
        request_uuid: uuid
      }
    });
    
    if (res1.statusCode !== 201) {
      console.error("res1 failed. Status:", res1.statusCode, "Body:", res1.body);
    }
    expect(res1.statusCode).toBe(201);
    const body1 = JSON.parse(res1.body);
    expect(body1.success).toBe(true);
    const requestId = body1.request.id;
    
    // Second request with same UUID
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/emergency/request',
      headers: {
        Authorization: `Bearer ${userToken}`
      },
      payload: {
        latitude: 12.9715,
        longitude: 77.5945,
        request_uuid: uuid
      }
    });
    
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.body);
    expect(body2.success).toBe(true);
    expect(body2.request.id).toBe(requestId);
    expect(body2.message).toContain('deduplicated');

    // Clean up request
    await db.query('DELETE FROM emergency_requests WHERE id = $1', [requestId]);
  });

  test('Escalation: scan and escalate active dispatches based on elapsed time', async () => {
    const { checkAndEscalateRequests } = require('../src/services/escalationEngine');
    
    // 1. Insert a mock emergency request that is 25s old
    const time25sAgo = new Date(Date.now() - 25000);
    const insertRes = await db.query(`
      INSERT INTO emergency_requests (user_id, user_latitude, user_longitude, status, created_at, escalation_step)
      VALUES ($1, 12.9715, 77.5945, 'pending', $2, 0)
      RETURNING id
    `, [userId, time25sAgo]);
    const requestId = insertRes.rows[0].id;
    
    // Run escalation engine check
    await checkAndEscalateRequests(app);
    
    // Verify it escalated to step 1
    let checkRes = await db.query('SELECT escalation_step, voice_called_at FROM emergency_requests WHERE id = $1', [requestId]);
    expect(checkRes.rows[0].escalation_step).toBe(1);
    expect(checkRes.rows[0].voice_called_at).not.toBeNull();
    
    // Update created_at to 45 seconds ago
    const time45sAgo = new Date(Date.now() - 45000);
    await db.query('UPDATE emergency_requests SET created_at = $1 WHERE id = $2', [time45sAgo, requestId]);
    
    // Run escalation check again
    await checkAndEscalateRequests(app);
    
    // Verify it escalated to step 2
    checkRes = await db.query('SELECT escalation_step FROM emergency_requests WHERE id = $1', [requestId]);
    expect(checkRes.rows[0].escalation_step).toBe(2);
    
    // Update created_at to 65 seconds ago
    const time65sAgo = new Date(Date.now() - 65000);
    await db.query('UPDATE emergency_requests SET created_at = $1 WHERE id = $2', [time65sAgo, requestId]);
    
    // Run escalation check again
    await checkAndEscalateRequests(app);
    
    // Verify it escalated to step 3
    checkRes = await db.query('SELECT escalation_step FROM emergency_requests WHERE id = $1', [requestId]);
    expect(checkRes.rows[0].escalation_step).toBe(3);
    
    // Clean up request
    await db.query('DELETE FROM emergency_requests WHERE id = $1', [requestId]);
  });

});
