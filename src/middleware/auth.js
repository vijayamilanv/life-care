/**
 * Authentication and role authorization middleware for Fastify.
 */

/**
 * Checks if request is authenticated using JWT.
 * Assumes @fastify/jwt is registered on the fastify instance.
 */
async function authenticate(request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ 
      success: false, 
      message: 'Unauthorized: Invalid or missing token' 
    });
  }
}

/**
 * Ensures the authenticated user is a driver.
 */
async function requireDriver(request, reply) {
  await authenticate(request, reply);
  if (reply.sent) return;

  if (request.user.role !== 'driver') {
    reply.code(403).send({ 
      success: false, 
      message: 'Forbidden: Driver role required' 
    });
  }
}

/**
 * Ensures the authenticated user is a regular user.
 */
async function requireUser(request, reply) {
  await authenticate(request, reply);
  if (reply.sent) return;

  if (request.user.role !== 'user') {
    reply.code(403).send({ 
      success: false, 
      message: 'Forbidden: User role required' 
    });
  }
}

module.exports = {
  authenticate,
  requireDriver,
  requireUser
};
