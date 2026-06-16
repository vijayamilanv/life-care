// Real-time WebSocket Service using Socket.IO Client
let socketInstance = null;

function connectSocket(user) {
  if (socketInstance) {
    return socketInstance;
  }

  // Initialize socket connection (looks at window.location automatically)
  socketInstance = io();

  socketInstance.on('connect', () => {
    console.log('Successfully connected to WebSocket server with socket ID:', socketInstance.id);
    
    // Join appropriate rooms (User ID room & Driver room if role is driver)
    socketInstance.emit('join', {
      userId: user.id,
      role: user.role,
      driverId: user.driverId
    });
  });

  socketInstance.on('disconnect', () => {
    console.log('Disconnected from WebSocket server');
  });

  socketInstance.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
  });

  return socketInstance;
}

function getSocket() {
  return socketInstance;
}

function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
    console.log('Socket disconnected and cleared');
  }
}
