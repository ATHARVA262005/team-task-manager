const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Validate required env vars
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const { projectTaskRouter, taskRouter } = require('./routes/tasks');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  },
});

app.set('io', io);

const PORT = process.env.PORT || 5000;

// Global rate limiter: 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' })); // Limit payload size
app.use('/api', apiLimiter);

// Socket.io connection handling
io.on('connection', (socket) => {
  socket.on('join:project', (projectId) => {
    if (typeof projectId === 'string' && projectId.length > 0) {
      socket.join(`project:${projectId}`);
    }
  });

  socket.on('leave:project', (projectId) => {
    if (typeof projectId === 'string' && projectId.length > 0) {
      socket.leave(`project:${projectId}`);
    }
  });

  socket.on('disconnect', () => {});
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects/:projectId/tasks', projectTaskRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/dashboard', dashboardRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 404 for unknown API routes
app.use('/api/{*splat}', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Serve static React build in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
