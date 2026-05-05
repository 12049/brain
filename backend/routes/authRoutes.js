import express from 'express';
import { body } from 'express-validator';
import { register, login, subscribe, getProfile } from '../controllers/authController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/auth/register
// @desc    تسجيل مستخدم جديد
// @access  Public
router.post('/register', [
    body('username').trim().isLength({ min: 3, max: 30 }).withMessage('اسم المستخدم يجب أن يكون بين 3 و 30 حرف'),
    body('email').isEmail().withMessage('بريد إلكتروني غير صالح').normalizeEmail(),
    body('phone').matches(/^[0-9]{8,15}$/).withMessage('رقم الهاتف يجب أن يكون 8-15 رقم'),
    body('password').isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
    body('department').notEmpty().withMessage('القسم مطلوب'),
    body('academicYear').notEmpty().withMessage('السنة الدراسية مطلوبة')
], register);

// @route   POST /api/auth/login
// @desc    تسجيل دخول
// @access  Public
router.post('/login', [
    body('username').optional(),
    body('email').optional().isEmail(),
    body('password').notEmpty().withMessage('كلمة المرور مطلوبة')
], login);

// @route   POST /api/auth/subscribe
// @desc    حفظ اشتراك الإشعارات
// @access  Private
router.post('/subscribe', authMiddleware, subscribe);

// @route   GET /api/auth/profile
// @desc    جلب بيانات المستخدم الحالي
// @access  Private
router.get('/profile', authMiddleware, getProfile);

export default router;