import { Router } from 'express';
import authRoutes from './auth.routes';
import diaRoutes from './dia.routes';
import transactionsRoutes from './transactions.routes';
import settingsRoutes from './settings.routes';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/dia', diaRoutes);
router.use('/transactions', transactionsRoutes);
router.use('/settings', settingsRoutes);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Sumen Backend API is running',
    timestamp: new Date().toISOString(),
  });
});

export default router;
