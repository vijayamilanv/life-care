require('dotenv').config();
const path = require('path');
const Fastify = require('fastify');

// Initialize Fastify server
const isTest = process.env.NODE_ENV === 'test';
const fastify = Fastify({
  logger: isTest ? false : { level: 'info' }
});


// Register Fastify plugins
// 1. JWT Authentication Support
fastify.register(require('@fastify/jwt'), {
  secret: process.env.JWT_SECRET || 'super_secret_emergency_jwt_token_12345!'
});

// 2. Socket.IO Integration
fastify.register(require('fastify-socket.io'), {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// 3. Static File Server (serves front-end assets)
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '../public'),
  prefix: '/'
});

// Register routes
fastify.register(require('./routes/auth'), { prefix: '/api/auth' });
fastify.register(require('./routes/driver'), { prefix: '/api/driver' });
fastify.register(require('./routes/user'), { prefix: '/api/user' });
fastify.register(require('./routes/emergency'), { prefix: '/api/emergency' });
fastify.register(require('./routes/notifications'), { prefix: '/api/notifications' });

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'healthy', timestamp: new Date().toISOString() };
});

// Register clean shutdown handler to clear background intervals
fastify.addHook('onClose', async (instance) => {
  const { stopEscalationEngine } = require('./services/escalationEngine');
  stopEscalationEngine();
});

// Bind sockets when fastify is ready
fastify.ready(err => {
  if (err) {
    fastify.log.error('Error starting Fastify socket binding:', err);
    process.exit(1);
  }
  
  fastify.log.info('Fastify plugins loaded successfully.');
  
  // Attach WebSocket connection handlers
  const socketHandler = require('./sockets/socketHandler');
  socketHandler(fastify.io);

  // Initialize active dispatches timeout escalation scheduler
  const { startEscalationEngine } = require('./services/escalationEngine');
  startEscalationEngine(fastify);
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT || 3000;
    // Bind to 0.0.0.0 to allow external connections on cloud services like Render/Railway
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`Server is running at http://localhost:${port}`);
  } catch (err) {
    fastify.log.error('Error starting server:', err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

module.exports = fastify;

