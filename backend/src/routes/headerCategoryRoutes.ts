import { Router } from 'express';
import {
    getAdminHeaderCategories,
    getHeaderCategories,
    createHeaderCategory,
    updateHeaderCategory,
    deleteHeaderCategory,
    getHeaderCategoryDisplaySettings,
    toggleHeaderCategoryActive,
} from '../modules/admin/controllers/headerCategoryController';
import { authenticate, requireUserType } from '../middleware/auth';

const router = Router();

// Public routes
router.get('/', getHeaderCategories);
router.get('/display-settings', getHeaderCategoryDisplaySettings);

// Protected Admin routes
router.get('/admin', authenticate, requireUserType('Admin'), getAdminHeaderCategories);
router.post('/', authenticate, requireUserType('Admin'), createHeaderCategory);
router.patch('/:id/toggle-active', authenticate, requireUserType('Admin'), toggleHeaderCategoryActive);
router.put('/:id', authenticate, requireUserType('Admin'), updateHeaderCategory);
router.delete('/:id', authenticate, requireUserType('Admin'), deleteHeaderCategory);

export default router;
