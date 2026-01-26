import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { corsMiddleware } from './middleware/cors';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { testConnection } from './config/database';
import { env } from './config/env';
import routes from './routes';
import { startNotificationJob } from './jobs/notification.job';

const app = express();

// Security middleware
app.use(helmet());

// CORS
app.use(corsMiddleware);

// Rate limiting
const limiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.maxRequests,
  message: {
    success: false,
    error: 'Çok fazla istek gönderildi, lütfen bekleyin',
  },
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging in development
if (env.isDev) {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });
}

// API routes
app.use('/api', routes);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Sumen Backend API',
    version: '1.0.0',
    status: 'running',
    documentation: '/api/health',
  });
});

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// Start server
async function start() {
  // Test database connection
  const dbConnected = await testConnection();
  
  if (!dbConnected) {
    console.error('❌ Cannot start server without database connection');
    process.exit(1);
  }

  // Start notification cron job
  startNotificationJob();

  // Start HTTP server
  app.listen(env.server.port, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║     🚀 Sumen Backend API                      ║
║                                               ║
║     Port: ${env.server.port}                              ║
║     Mode: ${env.server.nodeEnv.padEnd(24)}║
║                                               ║
╚═══════════════════════════════════════════════╝
    `);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

export default app;
