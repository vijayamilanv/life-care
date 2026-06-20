const app = require('../src/app');
const db = require('../src/config/db');

// Set longer timeout to accommodate Neon serverless cold-start connection latency
jest.setTimeout(25000);

let userToken = '';
let userId = null;
let hospitalAId = null;
let hospitalBId = null;

beforeAll(async () => {
  // Register a test user
  const email = `national_user_${Date.now()}@test.com`;
  const registerRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      name: 'National Test User',
      email,
      password: 'password123',
      phone: '+919999999901',
      role: 'user'
    }
  });
  
  const body = JSON.parse(registerRes.body);
  userToken = body.token;
  userId = body.user.id;

  // Insert test hospitals
  // Hospital A: close (12.9715, 77.5945) but low capacity
  const hospitalARes = await db.query(`
    INSERT INTO hospitals (name, latitude, longitude, contact_number, address)
    VALUES ($1, 12.9715, 77.5945, '+918022222222', 'Close Hospital A')
    RETURNING id
  `, [`Hospital A ${Date.now()}`]);
  hospitalAId = hospitalARes.rows[0].id;

  await db.query(`
    INSERT INTO hospital_capacity (hospital_id, total_beds, available_beds, total_icu_beds, available_icu_beds)
    VALUES ($1, 10, 1, 5, 0)
  `, [hospitalAId]);

  // Hospital B: slightly further (12.9800, 77.6000) but high capacity
  const hospitalBRes = await db.query(`
    INSERT INTO hospitals (name, latitude, longitude, contact_number, address)
    VALUES ($1, 12.9800, 77.6000, '+918033333333', 'Further Hospital B')
    RETURNING id
  `, [`Hospital B ${Date.now()}`]);
  hospitalBId = hospitalBRes.rows[0].id;

  await db.query(`
    INSERT INTO hospital_capacity (hospital_id, total_beds, available_beds, total_icu_beds, available_icu_beds)
    VALUES ($1, 50, 15, 10, 5)
  `, [hospitalBId]);
});

afterAll(async () => {
  // Clean up
  if (hospitalAId) {
    await db.query('DELETE FROM hospital_capacity WHERE hospital_id = $1', [hospitalAId]);
    await db.query('DELETE FROM hospitals WHERE id = $1', [hospitalAId]);
  }
  if (hospitalBId) {
    await db.query('DELETE FROM hospital_capacity WHERE hospital_id = $1', [hospitalBId]);
    await db.query('DELETE FROM hospitals WHERE id = $1', [hospitalBId]);
  }
  if (userId) {
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
  }
  await db.pool.end();
  await app.close();
});

describe('National Emergency Dispatch System Tests', () => {

  test('Hospital Recommendation Engine: Recommends Hospital B due to better capacity despite Hospital A being closer', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/emergency/request',
      headers: {
        Authorization: `Bearer ${userToken}`
      },
      payload: {
        latitude: 12.9715,
        longitude: 77.5945
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.recommendedHospital).toBeDefined();
    
    // Verify B is recommended over A due to scoring algorithm weighting beds/ICU
    expect(body.recommendedHospital.id).toBe(hospitalBId);
    expect(body.recommendedHospital.name).toContain('Hospital B');

    const requestId = body.request.id;

    // Check police alert creation
    const policeAlerts = await db.query('SELECT * FROM police_alerts WHERE request_id = $1', [requestId]);
    expect(policeAlerts.rows.length).toBeGreaterThan(0);
    expect(policeAlerts.rows[0].badge_number).toBe('HQ-DISPATCH-MAIN');

    // Check hospital alert creation
    const hospitalAlerts = await db.query('SELECT * FROM hospital_alerts WHERE request_id = $1 AND hospital_id = $2', [requestId, hospitalBId]);
    expect(hospitalAlerts.rows.length).toBeGreaterThan(0);
    expect(hospitalAlerts.rows[0].status).toBe('pending');

    // Clean up request
    await db.query('DELETE FROM hospital_alerts WHERE request_id = $1', [requestId]);
    await db.query('DELETE FROM police_alerts WHERE request_id = $1', [requestId]);
    await db.query('DELETE FROM emergency_requests WHERE id = $1', [requestId]);
  });

  test('Escalation Level 4: scan and escalate active dispatches beyond 90s to Priority Level 4', async () => {
    const { checkAndEscalateRequests } = require('../src/services/escalationEngine');
    
    // Insert a mock request 95s old
    const time95sAgo = new Date(Date.now() - 95000);
    const insertRes = await db.query(`
      INSERT INTO emergency_requests (user_id, user_latitude, user_longitude, status, created_at, escalation_step)
      VALUES ($1, 12.9715, 77.5945, 'pending', $2, 0)
      RETURNING id
    `, [userId, time95sAgo]);
    const requestId = insertRes.rows[0].id;
    
    // Run escalation engine check
    await checkAndEscalateRequests(app);
    
    // Verify it escalated to step 4
    const checkRes = await db.query('SELECT escalation_step FROM emergency_requests WHERE id = $1', [requestId]);
    expect(checkRes.rows[0].escalation_step).toBe(4);

    // Verify activity log is inserted
    const logsRes = await db.query(`
      SELECT * FROM activity_logs 
      WHERE user_id = $1 AND action = 'ESCALATION_PRIORITY'
      ORDER BY id DESC LIMIT 1
    `, [userId]);
    expect(logsRes.rows.length).toBeGreaterThan(0);
    expect(logsRes.rows[0].details).toContain('Priority Level 4');

    // Clean up request & activity logs
    await db.query('DELETE FROM emergency_requests WHERE id = $1', [requestId]);
    await db.query('DELETE FROM activity_logs WHERE user_id = $1 AND action = $2', [userId, 'ESCALATION_PRIORITY']);
  });

  test('ECC Role Authentication: Registering and logging in with role ecc retrieves role ecc from DB and token', async () => {
    const randomEmail = `ecc_user_${Math.floor(Math.random() * 1000000)}@test.com`;
    
    // 1. Register with role: 'ecc'
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'ECC Commander',
        email: randomEmail,
        password: 'password123',
        phone: '+919000000001',
        role: 'ecc'
      }
    });

    expect(registerRes.statusCode).toBe(201);
    const registerBody = JSON.parse(registerRes.body);
    expect(registerBody.success).toBe(true);
    expect(registerBody.user.role).toBe('ecc');
    
    const eccUserId = registerBody.user.id;

    // 2. Login and verify JWT role claim is 'ecc'
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        email: randomEmail,
        password: 'password123'
      }
    });

    expect(loginRes.statusCode).toBe(200);
    const loginBody = JSON.parse(loginRes.body);
    expect(loginBody.success).toBe(true);
    expect(loginBody.user.role).toBe('ecc');

    // Decode token to verify payload contains role: 'ecc'
    const decoded = app.jwt.verify(loginBody.token);
    expect(decoded.role).toBe('ecc');

    // 3. Clean up database user
    await db.query('DELETE FROM users WHERE id = $1', [eccUserId]);
  });

});

