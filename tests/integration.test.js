const app = require('../src/app');
const db = require('../src/config/db');

// Set longer timeout to accommodate Neon serverless cold-start connection latency
jest.setTimeout(25000);

// Ensure database pool is closed after tests complete to let Jest exit

afterAll(async () => {
  await db.pool.end();
  // We also close Fastify server
  await app.close();
});

describe('Fastify Server Integration Tests', () => {
  
  test('GET /health returns healthy status', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveProperty('status', 'healthy');
  });

  test('POST /api/auth/register registers citizen successfully', async () => {
    // Generate a random unique email to prevent database conflicts
    const randomEmail = `citizen_${Math.floor(Math.random() * 1000000)}@rescue.com`;
    
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Test Citizen',
        email: randomEmail,
        password: 'password123',
        phone: '+919999999999',
        role: 'user'
      }
    });

    expect([201, 409]).toContain(response.statusCode);
    const body = JSON.parse(response.body);
    
    if (response.statusCode === 201) {
      expect(body.success).toBe(true);
      expect(body).toHaveProperty('token');
      expect(body.user).toHaveProperty('email', randomEmail);
    } else {
      // If it returned 409 conflict, that's also a valid handler output for duplicate email
      expect(body.success).toBe(false);
      expect(body.message).toContain('already registered');
    }
  });

  test('POST /api/auth/register rejects driver without vehicle plate info', async () => {
    const randomEmail = `driver_${Math.floor(Math.random() * 1000000)}@rescue.com`;
    
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        name: 'Test Driver Bad',
        email: randomEmail,
        password: 'password123',
        phone: '+919999999999',
        role: 'driver'
        // Missing vehicle_number and ambulance_type
      }
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(false);
    expect(body.message).toContain('Driver registration requires');
  });
});
