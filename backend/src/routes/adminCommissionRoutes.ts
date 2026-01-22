import { Router } from 'express';
import { authenticate, requireUserType } from '../middleware/auth';
import {
    updateCommissionRates,
    getCommissionReport,
    getCommissionById,
    getCommissionSettings,
} from '../modules/admin/controllers/adminCommissionController';

const router = Router();

// All routes require admin authentication
router.use(authenticate, requireUserType('Admin'));

// Get commission settings
router.get('/settings', getCommissionSettings);

// Update commission rates
router.put('/settings', updateCommissionRates);

// Get commission report
router.get('/report', getCommissionReport);

// Get commission by ID
router.get('/:id', getCommissionById);

export default router;
