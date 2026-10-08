const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const authRoutes = require('./routes/authRoutes');
const setupSocketIO = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS settings
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static assets
app.use(express.static(path.join(__dirname, 'public')));

// Mount API routes
app.use('/api', authRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Fallback to index.html for client-side navigation (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Setup Socket.IO logic
setupSocketIO(io);

function startServer(port = config.PORT) {
  return server.listen(port, () => {
    console.log(`====================================================`);
    console.log(`🚀 Realtime Chat Server running at http://localhost:${port}`);
    console.log(`📡 Broadcast Mode: Active at http://localhost:${port}`);
    console.log(`🔒 1-on-1 & Group Chat: Active at http://localhost:${port}`);
    console.log(`====================================================`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.app = app;
module.exports.server = server;
module.exports.io = io;
module.exports.startServer = startServer;
