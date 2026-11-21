import { Router } from 'express';
import { getActiveTaxes, getAllTaxes, createTax, updateTaxStatus } from '../modules/seller/controllers/taxController';
import { authenticate, requireUserType } from '../middleware/auth';

const router = Router();

// Requires auth. Previously `authenticate` alone, which let ANY authenticated
// user type (customer, delivery partner) create and modify tax records.
router.use(authenticate);
router.use(requireUserType('Admin', 'Seller'));

// Get active taxes for selection
router.get('/active', getActiveTaxes);

// Get all taxes for management
router.get('/', getAllTaxes);

// Create tax (Admin should ideally do this, but seller management has a page for it in this app it seems)
router.post('/', createTax);

// Update tax status
router.patch('/:id/status', updateTaxStatus);

export default router;
