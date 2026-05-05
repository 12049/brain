import express from 'express';
import { body, query } from 'express-validator';
import {
    createRequest,
    getMyRequests,
    getAllRequests,
    acceptRequest,
    finishRequest,
    rateRequest,
    deleteRequest
} from '../controllers/requestController.js';
import { authMiddleware, adminMiddleware, technicianMiddleware } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/requests/create
// @desc    إنشاء طلب جديد
// @access  Private (Student only)
router.post('/create', authMiddleware, [
    body('serviceType').isIn(['maintenance', 'programming']).withMessage('نوع الخدمة غير صحيح'),
    body('subService').trim().notEmpty().withMessage('الخدمة الفرعية مطلوبة'),
    body('details').trim().notEmpty().maxLength(1000).withMessage('التفاصيل مطلوبة وأقل من 1000 حرف')
], createRequest);

// @route   GET /api/requests/my
// @desc    جلب طلبات المستخدم الحالي
// @access  Private
router.get('/my', authMiddleware, getMyRequests);

// @route   GET /api/requests/all
// @desc    جلب جميع الطلبات (للمدير فقط)
// @access  Private (Admin only)
router.get('/all', authMiddleware, adminMiddleware, getAllRequests);

// @route   POST /api/requests/accept
// @desc    قبول طلب (للتقنيين)
// @access  Private (Technician/Admin only)
router.post('/accept', authMiddleware, technicianMiddleware, [
    body('requestId').notEmpty().withMessage('معرف الطلب مطلوب')
], acceptRequest);

// @route   POST /api/requests/finish
// @desc    إنهاء طلب
// @access  Private (Technician/Admin only)
router.post('/finish', authMiddleware, technicianMiddleware, [
    body('requestId').notEmpty().withMessage('معرف الطلب مطلوب')
], finishRequest);

// @route   POST /api/requests/rate
// @desc    تقييم طلب
// @access  Private
router.post('/rate', authMiddleware, [
    body('requestId').notEmpty().withMessage('معرف الطلب مطلوب'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('التقييم يجب أن يكون بين 1 و 5')
], rateRequest);

// @route   DELETE /api/requests/delete
// @desc    حذف طلب (للمدير أو صاحب الطلب)
// @access  Private
router.delete('/delete', authMiddleware, [
    query('requestId').notEmpty().withMessage('معرف الطلب مطلوب')
], deleteRequest);

export default router;