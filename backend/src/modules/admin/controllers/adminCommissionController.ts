import { Request, Response } from 'express';
import AppSettings from '../../../models/AppSettings';
import Commission from '../../../models/Commission';

/**
 * Update commission rates
 */
export const updateCommissionRates = async (req: Request, res: Response) => {
    try {
        const { sellerCommissionRate, deliveryBoyCommissionRate, minimumWithdrawalAmount } = req.body;

        let settings = await AppSettings.findOne();
        if (!settings) {
            settings = await AppSettings.create({
                appName: 'Dhakad Snazzy',
                contactEmail: 'contact@dhakadsnazzy.com',
                contactPhone: '1234567890',
            });
        }

        if (sellerCommissionRate !== undefined) {
            if (sellerCommissionRate < 0 || sellerCommissionRate > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Seller commission rate must be between 0 and 100',
                });
            }
            settings.sellerCommissionRate = sellerCommissionRate;
        }

        if (deliveryBoyCommissionRate !== undefined) {
            if (deliveryBoyCommissionRate < 0 || deliveryBoyCommissionRate > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Delivery boy commission rate must be between 0 and 100',
                });
            }
            settings.deliveryBoyCommissionRate = deliveryBoyCommissionRate;
        }

        if (minimumWithdrawalAmount !== undefined) {
            if (minimumWithdrawalAmount < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Minimum withdrawal amount cannot be negative',
                });
            }
            settings.minimumWithdrawalAmount = minimumWithdrawalAmount;
        }

        await settings.save();

        return res.status(200).json({
            success: true,
            message: 'Commission rates updated successfully',
            data: {
                sellerCommissionRate: settings.sellerCommissionRate,
                deliveryBoyCommissionRate: settings.deliveryBoyCommissionRate,
                minimumWithdrawalAmount: settings.minimumWithdrawalAmount,
            },
        });
    } catch (error: any) {
        console.error('Error updating commission rates:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to update commission rates',
        });
    }
};

/**
 * Get commission report
 */
export const getCommissionReport = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, type, status } = req.query;

        const query: any = {};

        if (type) {
            query.type = type;
        }

        if (status) {
            query.status = status;
        }

        if (startDate || endDate) {
            query.createdAt = {};
            if (startDate) query.createdAt.$gte = new Date(startDate as string);
            if (endDate) query.createdAt.$lte = new Date(endDate as string);
        }

        const commissions = await Commission.find(query)
            .populate('seller', 'sellerName storeName email')
            .populate('deliveryBoy', 'name email')
            .populate('order', 'orderNumber total')
            .sort({ createdAt: -1 });

        // Calculate summary
        const summary = {
            totalCommissions: 0,
            sellerCommissions: 0,
            deliveryBoyCommissions: 0,
            paidCommissions: 0,
            pendingCommissions: 0,
            count: commissions.length,
        };

        commissions.forEach((c) => {
            summary.totalCommissions += c.commissionAmount;

            if (c.type === 'SELLER') {
                summary.sellerCommissions += c.commissionAmount;
            } else {
                summary.deliveryBoyCommissions += c.commissionAmount;
            }

            if (c.status === 'Paid') {
                summary.paidCommissions += c.commissionAmount;
            } else if (c.status === 'Pending') {
                summary.pendingCommissions += c.commissionAmount;
            }
        });

        return res.status(200).json({
            success: true,
            data: {
                summary,
                commissions,
            },
        });
    } catch (error: any) {
        console.error('Error getting commission report:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to get commission report',
        });
    }
};

/**
 * Get commission by ID
 */
export const getCommissionById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const commission = await Commission.findById(id)
            .populate('seller', 'sellerName storeName email mobile')
            .populate('deliveryBoy', 'name email mobile')
            .populate('order', 'orderNumber total status')
            .populate('orderItem', 'productName quantity unitPrice total');

        if (!commission) {
            return res.status(404).json({
                success: false,
                message: 'Commission not found',
            });
        }

        return res.status(200).json({
            success: true,
            data: commission,
        });
    } catch (error: any) {
        console.error('Error getting commission:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to get commission',
        });
    }
};

/**
 * Get commission settings
 */
export const getCommissionSettings = async (_req: Request, res: Response) => {
    try {
        let settings = await AppSettings.findOne();

        if (!settings) {
            settings = await AppSettings.create({
                appName: 'Dhakad Snazzy',
                contactEmail: 'contact@dhakadsnazzy.com',
                contactPhone: '1234567890',
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                sellerCommissionRate: settings.sellerCommissionRate || 10,
                deliveryBoyCommissionRate: settings.deliveryBoyCommissionRate || 5,
                minimumWithdrawalAmount: settings.minimumWithdrawalAmount || 100,
            },
        });
    } catch (error: any) {
        console.error('Error getting commission settings:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to get commission settings',
        });
    }
};
