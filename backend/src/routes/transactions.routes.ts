import { Router, Request, Response } from 'express';
import { query } from '../config/database';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { PendingTransaction } from '../types';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * GET /api/transactions
 * Get all transactions for current user
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const { status, type, limit = '100', offset = '0' } = req.query;

    let sql = 'SELECT * FROM pending_transactions WHERE user_id = ?';
    const params: unknown[] = [req.user.sub];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (type) {
      sql += ' AND transaction_type = ?';
      params.push(type);
    }

    sql += ' ORDER BY transaction_date DESC, created_at DESC';
    sql += ` LIMIT ${parseInt(limit as string, 10)} OFFSET ${parseInt(offset as string, 10)}`;

    const transactions = await query<PendingTransaction[]>(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as total FROM pending_transactions WHERE user_id = ?';
    const countParams: unknown[] = [req.user.sub];

    if (status) {
      countSql += ' AND status = ?';
      countParams.push(status);
    }

    if (type) {
      countSql += ' AND transaction_type = ?';
      countParams.push(type);
    }

    const countResult = await query<{ total: number }[]>(countSql, countParams);
    const total = countResult[0]?.total || 0;

    res.json({
      success: true,
      data: transactions,
      pagination: {
        total,
        limit: parseInt(limit as string, 10),
        offset: parseInt(offset as string, 10),
      },
    });
  })
);

/**
 * GET /api/transactions/summary
 * Get transaction summary by type
 */
router.get(
  '/summary',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const summary = await query<{
      transaction_type: string;
      status: string;
      count: number;
      total_amount: number;
    }[]>(
      `SELECT transaction_type, status, COUNT(*) as count, SUM(amount) as total_amount
       FROM pending_transactions
       WHERE user_id = ?
       GROUP BY transaction_type, status`,
      [req.user.sub]
    );

    // Group by type
    const grouped: Record<string, {
      pending: number;
      approved: number;
      rejected: number;
      analyzing: number;
      total_amount: number;
    }> = {};

    for (const row of summary) {
      if (!grouped[row.transaction_type]) {
        grouped[row.transaction_type] = {
          pending: 0,
          approved: 0,
          rejected: 0,
          analyzing: 0,
          total_amount: 0,
        };
      }
      grouped[row.transaction_type][row.status as keyof typeof grouped[string]] = row.count;
      grouped[row.transaction_type].total_amount += row.total_amount || 0;
    }

    res.json({
      success: true,
      data: grouped,
    });
  })
);

/**
 * GET /api/transactions/:id
 * Get single transaction
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    const transactions = await query<PendingTransaction[]>(
      'SELECT * FROM pending_transactions WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.sub]
    );

    if (transactions.length === 0) {
      throw new AppError('İşlem bulunamadı', 404);
    }

    res.json({
      success: true,
      data: transactions[0],
    });
  })
);

/**
 * PUT /api/transactions/:id
 * Update transaction (local only - for notes, etc.)
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.sub) {
      throw new AppError('Kullanıcı bulunamadı', 401);
    }

    // Only allow updating certain fields locally
    const allowedFields = ['rejection_reason'];
    const updates: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(req.body)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updates.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (updates.length === 0) {
      throw new AppError('Güncellenecek alan bulunamadı', 400);
    }

    values.push(req.params.id, req.user.sub);

    await query(
      `UPDATE pending_transactions SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    res.json({
      success: true,
      message: 'İşlem güncellendi',
    });
  })
);

export default router;
