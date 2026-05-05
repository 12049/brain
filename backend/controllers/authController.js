import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import xss from 'xss';
import User from '../models/User.js';

// توليد JWT Token
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};

// @desc    تسجيل مستخدم جديد
// @route   POST /api/auth/register
export const register = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: false,
            message: 'بيانات غير صحيحة',
            errors: errors.array()
        });
    }

    try {
        const { username, email, phone, password, department, academicYear, role } = req.body;

        // التحقق من وجود المستخدم
        const existingUser = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            return res.status(409).json({
                status: false,
                message: 'اسم المستخدم أو البريد الإلكتروني موجود مسبقاً'
            });
        }

        // تشفير كلمة المرور
        const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_ROUNDS) || 12);
        const hashedPassword = await bcrypt.hash(password, salt);

        // إنشاء المستخدم
        const user = new User({
            username: xss(username.trim()),
            email: xss(email.toLowerCase()),
            phone: xss(phone),
            password: hashedPassword,
            department,
            academicYear,
            role: role === 'technician' ? 'technician' : 'student'
        });

        await user.save();

        // إنشاء token
        const token = generateToken(user);

        // إرجاع البيانات بدون كلمة المرور
        res.status(201).json({
            status: true,
            message: 'تم التسجيل بنجاح',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                phone: user.phone,
                department: user.department,
                academicYear: user.academicYear,
                role: user.role,
                createdAt: user.createdAt
            },
            token
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            status: false,
            message: 'خطأ في الخادم: ' + error.message
        });
    }
};

// @desc    تسجيل دخول
// @route   POST /api/auth/login
export const login = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: false,
            message: 'بيانات غير صحيحة',
            errors: errors.array()
        });
    }

    try {
        const { username, email, password } = req.body;
        const loginField = username || email;

        if (!loginField) {
            return res.status(400).json({
                status: false,
                message: 'اسم المستخدم أو البريد الإلكتروني مطلوب'
            });
        }

        // البحث عن المستخدم
        const user = await User.findOne({
            $or: [
                { username: loginField },
                { email: loginField.toLowerCase() }
            ]
        });

        if (!user) {
            return res.status(401).json({
                status: false,
                message: 'بيانات الدخول غير صحيحة'
            });
        }

        // التحقق من كلمة المرور
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                status: false,
                message: 'بيانات الدخول غير صحيحة'
            });
        }

        // تحديث آخر نشاط
        user.lastActive = new Date();
        await user.save();

        // إنشاء token جديد
        const token = generateToken(user);

        res.json({
            status: true,
            message: 'تم تسجيل الدخول بنجاح',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                phone: user.phone,
                department: user.department,
                academicYear: user.academicYear,
                role: user.role,
                createdAt: user.createdAt
            },
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            status: false,
            message: 'خطأ في الخادم: ' + error.message
        });
    }
};

// @desc    حفظ اشتراك الإشعارات
// @route   POST /api/auth/subscribe
export const subscribe = async (req, res) => {
    try {
        const { subscription } = req.body;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({
                status: false,
                message: 'بيانات الاشتراك غير صحيحة'
            });
        }

        req.user.pushSubscription = subscription;
        await req.user.save();

        res.json({
            status: true,
            message: 'تم تفعيل الإشعارات بنجاح'
        });

    } catch (error) {
        console.error('Subscribe error:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
};

// @desc    جلب بيانات المستخدم الحالي
// @route   GET /api/auth/profile
export const getProfile = async (req, res) => {
    try {
        res.json({
            status: true,
            user: {
                id: req.user._id,
                username: req.user.username,
                email: req.user.email,
                phone: req.user.phone,
                department: req.user.department,
                academicYear: req.user.academicYear,
                role: req.user.role,
                createdAt: req.user.createdAt
            }
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
};