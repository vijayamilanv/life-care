const bcrypt = require('bcryptjs');
const db = require('../config/db');

module.exports = async function (fastify, opts) {
  
  // POST /api/auth/register
  fastify.post('/register', async (request, reply) => {
    const { name, email, password, phone, role, vehicle_number, ambulance_type } = request.body || {};

    // Validate request inputs
    if (!name || !email || !password || !phone) {
      return reply.code(400).send({ 
        success: false, 
        message: 'Missing required fields: name, email, password, phone are required' 
      });
    }

    const userRole = role === 'driver' ? 'driver' : 'user';

    // If registering as a driver, require vehicle number and ambulance type
    if (userRole === 'driver' && (!vehicle_number || !ambulance_type)) {
      return reply.code(400).send({
        success: false,
        message: 'Driver registration requires vehicle_number and ambulance_type'
      });
    }

    try {
      // Check if email already exists
      const existingUser = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existingUser.rows.length > 0) {
        return reply.code(409).send({ 
          success: false, 
          message: 'Email address is already registered' 
        });
      }

      // If driver, check if vehicle number already exists
      if (userRole === 'driver') {
        const existingVehicle = await db.query('SELECT id FROM drivers WHERE vehicle_number = $1', [vehicle_number]);
        if (existingVehicle.rows.length > 0) {
          return reply.code(409).send({
            success: false,
            message: 'Vehicle number is already registered'
          });
        }
      }

      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Execute transaction to ensure atomic user/driver creation
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        
        // Insert User
        const insertUserText = `
          INSERT INTO users (name, email, password, phone, role) 
          VALUES ($1, $2, $3, $4, $5) 
          RETURNING id, name, email, role, phone, created_at
        `;
        const userRes = await client.query(insertUserText, [name, email, hashedPassword, phone, userRole]);
        const newUser = userRes.rows[0];

        let newDriver = null;

        // If driver role, insert driver details
        if (userRole === 'driver') {
          const insertDriverText = `
            INSERT INTO drivers (user_id, vehicle_number, ambulance_type, is_available) 
            VALUES ($1, $2, $3, false) 
            RETURNING id, vehicle_number, ambulance_type, is_available
          `;
          const driverRes = await client.query(insertDriverText, [newUser.id, vehicle_number, ambulance_type]);
          newDriver = driverRes.rows[0];

          // Initialize driver location with placeholder coordinates (e.g. 0,0)
          await client.query(`
            INSERT INTO driver_locations (driver_id, latitude, longitude)
            VALUES ($1, 0.0, 0.0)
          `, [newDriver.id]);
        }

        await client.query('COMMIT');

        // Create JWT token payload
        const payload = {
          id: newUser.id,
          email: newUser.email,
          role: newUser.role,
          driverId: newDriver ? newDriver.id : null
        };

        const token = fastify.jwt.sign(payload);

        // Audit Log
        await db.query(
          'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
          [newUser.id, 'REGISTER', `User registered as ${userRole}`]
        );

        return reply.code(201).send({
          success: true,
          token,
          user: {
            id: newUser.id,
            name: newUser.name,
            email: newUser.email,
            role: newUser.role,
            phone: newUser.phone,
            driverId: newDriver ? newDriver.id : null,
            vehicleNumber: newDriver ? newDriver.vehicle_number : null,
            ambulanceType: newDriver ? newDriver.ambulance_type : null
          }
        });

      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

    } catch (error) {
      fastify.log.error('Registration error:', error);
      return reply.code(500).send({ 
        success: false, 
        message: 'Internal server error during registration' 
      });
    }
  });

  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body || {};

    if (!email || !password) {
      return reply.code(400).send({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    try {
      // Get user details
      const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
      if (userRes.rows.length === 0) {
        return reply.code(401).send({ 
          success: false, 
          message: 'Invalid email or password' 
        });
      }

      const user = userRes.rows[0];

      // Compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return reply.code(401).send({ 
          success: false, 
          message: 'Invalid email or password' 
        });
      }

      let driverInfo = null;

      // If user is a driver, retrieve driver details
      if (user.role === 'driver') {
        const driverRes = await db.query(
          'SELECT id, vehicle_number, ambulance_type, is_available FROM drivers WHERE user_id = $1',
          [user.id]
        );
        if (driverRes.rows.length > 0) {
          driverInfo = driverRes.rows[0];
        }
      }

      // Generate JWT Token
      const payload = {
        id: user.id,
        email: user.email,
        role: user.role,
        driverId: driverInfo ? driverInfo.id : null
      };

      const token = fastify.jwt.sign(payload);

      // Audit Log
      await db.query(
        'INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)',
        [user.id, 'LOGIN', `User logged in successfully`]
      );

      return reply.code(200).send({
        success: true,
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          phone: user.phone,
          driverId: driverInfo ? driverInfo.id : null,
          vehicleNumber: driverInfo ? driverInfo.vehicle_number : null,
          ambulanceType: driverInfo ? driverInfo.ambulance_type : null,
          isAvailable: driverInfo ? driverInfo.is_available : null
        }
      });

    } catch (error) {
      fastify.log.error('Login error:', error);
      return reply.code(500).send({ 
        success: false, 
        message: 'Internal server error during login' 
      });
    }
  });

};
