// ============================================================
// ملف: api.js - نفس مسار https://api-dataflowx.vercel.app/api/v1/arege/brain
// نظام BrainCode API - النسخة الاحترافية مع MongoDB
// ============================================================

import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

dotenv.config();

const router = express.Router();

// ========== إعدادات الأمان ==========
router.use(helmet());
router.use(cors());
router.use(express.json());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { status: false, message: 'عدد الطلبات كبير جداً، حاول لاحقاً' }
});
router.use(limiter);

// ========== الاتصال بقاعدة البيانات ==========
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://username:password@cluster.mongodb.net/braincode';
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey123';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// ========== نماذج قاعدة البيانات (Models) ==========

// نموذج المستخدم
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    department: { 
        type: String, 
        enum: ['ميكاترونيكس', 'اتصالات', 'حواسيب', 'الكترون', 'قيادة', 'تحكم', 'نظم قدرة'],
        required: true 
    },
    academicYear: { 
        type: String, 
        enum: ['سنة أولى', 'سنة ثانية', 'سنة ثالثة', 'سنة رابعة', 'سنة خامسة'],
        required: true 
    },
    role: { type: String, enum: ['student', 'technician', 'admin'], default: 'student' },
    tokens: [{ token: { type: String, required: true } }],
    createdAt: { type: Date, default: Date.now }
});

// نموذج الطلب
const requestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    serviceType: { type: String, enum: ['maintenance', 'programming'], required: true },
    subService: { type: String, required: true },
    details: { type: String, required: true },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['pending', 'accepted', 'finished'], default: 'pending' },
    rating: { type: Number, min: 1, max: 5, default: null },
    createdAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null }
});

const User = mongoose.model('User', userSchema);
const Request = mongoose.model('Request', requestSchema);

// ========== دوال مساعدة ==========
const generateToken = (user) => {
    return jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
};

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.json({ status: false, message: 'الوصول ممنوع، يرجى تسجيل الدخول' });
        }
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.json({ status: false, message: 'المستخدم غير موجود' });
        }
        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        return res.json({ status: false, message: 'توكن غير صالح أو منتهي الصلاحية' });
    }
};

const adminMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.json({ status: false, message: 'غير مصرح لك، هذه الخاصية للمدير فقط' });
    }
    next();
};

const technicianMiddleware = (req, res, next) => {
    if (req.user.role !== 'technician' && req.user.role !== 'admin') {
        return res.json({ status: false, message: 'غير مصرح لك، هذه الخاصية للتقنيين فقط' });
    }
    next();
};

// ============================================================
// ========== 1. تسجيل مستخدم جديد (POST /auth/register) ==========
// ============================================================
router.post('/auth/register', async (req, res) => {
    try {
        const { username, email, phone, password, department, academicYear, role } = req.body;

        // التحقق من صحة البيانات
        if (!username || !email || !phone || !password || !department || !academicYear) {
            return res.json({ status: false, message: 'جميع الحقول مطلوبة' });
        }

        // التحقق من وجود المستخدم
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.json({ status: false, message: 'اسم المستخدم أو البريد الإلكتروني موجود مسبقاً' });
        }

        // تشفير كلمة المرور
        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

        // إنشاء المستخدم
        const user = new User({
            username,
            email,
            phone,
            password: hashedPassword,
            department,
            academicYear,
            role: role || 'student'
        });

        await user.save();
        const token = generateToken(user);

        user.tokens = [{ token }];
        await user.save();

        return res.json({
            status: true,
            message: 'تم التسجيل بنجاح',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                phone: user.phone,
                department: user.department,
                academicYear: user.academicYear,
                role: user.role
            },
            token
        });

    } catch (error) {
        return res.json({ status: false, message: 'حدث خطأ: ' + error.message });
    }
});

// ============================================================
// ========== 2. تسجيل دخول (POST /auth/login) ==========
// ============================================================
router.post('/auth/login', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if ((!username && !email) || !password) {
            return res.json({ status: false, message: 'اسم المستخدم/البريد الإلكتروني وكلمة المرور مطلوبان' });
        }

        // البحث عن المستخدم
        const user = await User.findOne({
            $or: [{ username: username }, { email: email }, { email: username }]
        });

        if (!user) {
            return res.json({ status: false, message: 'بيانات الدخول غير صحيحة' });
        }

        // التحقق من كلمة المرور
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.json({ status: false, message: 'بيانات الدخول غير صحيحة' });
        }

        const token = generateToken(user);

        // إضافة التوكن الجديد إلى قائمة التوكنات
        user.tokens = user.tokens || [];
        user.tokens.push({ token });
        await user.save();

        return res.json({
            status: true,
            message: 'تم تسجيل الدخول بنجاح',
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                phone: user.phone,
                department: user.department,
                academicYear: user.academicYear,
                role: user.role
            },
            token
        });

    } catch (error) {
        return res.json({ status: false, message: 'حدث خطأ: ' + error.message });
    }
});

// ============================================================
// ========== 3. تسجيل الخروج (POST /auth/logout) ==========
// ============================================================
router.post('/auth/logout', authMiddleware, async (req, res) => {
    try {
        req.user.tokens = req.user.tokens.filter(t => t.token !== req.token);
        await req.user.save();
        return res.json({ status: true, message: 'تم تسجيل الخروج بنجاح' });
    } catch (error) {
        return res.json({ status: false, message: 'حدث خطأ: ' + error.message });
    }
});

// ============================================================
// ========== 4. إنشاء طلب دعم جديد (POST /requests/create) ==========
// ============================================================
router.post('/requests/create', authMiddleware, async (req, res) => {
    try {
        const { serviceType, subService, details } = req.body;

        if (!serviceType || !subService || !details) {
            return res.json({ status: false, message: 'جميع الحقول مطلوبة' });
        }

        const newRequest = new Request({
            userId: req.user._id,
            serviceType,
            subService,
            details,
            status: 'pending'
        });

        await newRequest.save();

        // TODO: إرسال إشعار لجميع التقنيين (FCM)
        
        return res.json({
            status: true,
            message: 'تم إنشاء الطلب بنجاح',
            request: {
                id: newRequest._id,
                serviceType: newRequest.serviceType,
                subService: newRequest.subService,
                details: newRequest.details,
                status: newRequest.status,
                createdAt: newRequest.createdAt
            }
        });

    } catch (error) {
        return res.json({ status: false, message: 'حدث خطأ: ' + error.message });
    }
});

// ============================================================
// ========== 5. جلب طلباتي (GET /requests/my) ==========
// ============================================================
router.get('/requests/my', authMiddleware, async (req, res) => {
    try {
        const requests = await Request.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .populate('assignedTo', 'username');

        return res.json({
            status: true,
            count: requests.length,
            requests: requests.map(r => ({
                id: r._id,
                serviceType: r.serviceType,
                subService: r.subService,
                details: r.details,
                assignedTo: r.assignedTo?.username || null,
                status: r.status,
                rating: r.rating,
                createdAt: r.createdAt,
                finishedAt: r.finishedAt
            }))
        });

    } catch (error) {
        return res.json({ status: false, message: 'حدث خطأ: ' + error.message });
    }
});

// ============================================================
// ========== 6. جلب جميع الطلبات للمدير (GET /requests/all) ==========
// ============================================================
router.get('/requests/all', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { status, department } = req.query;
        let filter = {};

        if (status) filter.status = status;
        
        const requests = await Request.find(filter)
            .sort({ createdAt: -1 })
            .populate('userId', 'username email department academicYear')
            .populate('assignedTo', 'username');

        // فلترة حسب القسم إذا مطلوب
        let filteredRequests = requests;
        if (department) {
            filteredRequests = requests.filter(r => r.userId?.department === department);
        }

        return res.json({
            status: true,
            count: filteredRequests.length,
            requests: filteredRequests.map(r => ({
                id: r._id,
                user: {
                    id: r.userId?._id,
                    username: r.userId?.username,
                    email: r.userId?.email,
                    department: r.userId?.department
                },
                serviceType: r.serviceType,
                subService: r.subService,
                details: r.details,
                assignedTo: r.assignedTo?.username || null,
                status: r.status,
                rating: r.rating,
                createdAt: r.createdAt,
                finishedAt: r.finishedAt
            }))
        });

    } catch (error) {
        return res.json({ status: false, message: 'حدث خطأ: ' + error.message });
    }
});

// ============================================================
// ========== 7. قبول طلب من قبل تقني (POST /requests/accept) ==========
// ============================================================
router.post('/requests/accept', authMiddleware, technicianMiddleware, async (req, res) => {
    try {
        const { requestId } = req.body;

        if (!requestId) {
            return res.json({ status: false, message: 'معرف الطلب مطلوب' });
        }

        // استخدام update atomic لضمان أن تقني واحد فقط يقبل الطلب
        const request = await Request.findOneAndUpdate(
            { 
                _id: requestId, 
                status: 'pending',
                assignedTo: null 
            },
            { 
                status: 'accepted',
                assignedTo: req.user._id
            },
            { new: true }
        );

        if (!request) {
            return res.json({ status: false, message: 'الطلب غير موجود أو تم قبوله من قبل تقني آخر' });
        }

        // TODO: إرسال إشعار للطالب بأن طلبه تم قبوله

        return res.json({
            status: true,
            message: 'تم قبول الطلب بنجاح',
            request: {
                id: request._id,
                status: request.status,
                assignedTo: req.user.username
            }
        });

    } catch (error) {
        return res.json({ status: false, message: 'حدث خطأ: ' + error.message });
    }
});

// ============================================================
// ========== 8. إنهاء طلب من قبل تقني (POST /requests/finish) ==========
// ============================================================
router.post('/requests/finish', authMiddleware, technicianMiddleware, async (req, res) => {
    try {
        const { requestId } = req.body;

        if (!requestId) {
            return res.json({ status: false, message: 'معرف الطلب مطلوب' });
        }

        const request = await Request.findOneAndUpdate(
            { 
                _id: requestId, 
                assignedTo: req.user._id,
                status: 'accepted'
            },
            { 
                status: 'finished',
                finishedAt: new Date()
            },
            { new: true }
        );

        if (!request) {
            return res.json({ status: false, message: 'الطلب غير موجود أو ليس من مهامك أو ليس بحالة مقبول' });
        }

        // TODO: إرسال إشعار للطالب بأن الطلب اكتمل

        return res.json({
            status: true,
            message: 'تم إنهاء الطلب بنجاح',
            request: {
                id: request._id,
                status: request.status,
                finishedAt: request.finishedAt
            }
        });

    } catch (error) {
        return res.json({ status: false, message: 'حدث خطأ: ' + error.message });
    }
});

// ============================================================
// ========== 9. تقييم طلب (POST /requests/rate) ==========
// ============================================================
router.post('/requests/rate', authMiddleware, async (req, res) => {
    try {
        const { requestId, rating } = req.body;

        if (!requestId || !rating || rating < 1 || rating > 5) {
            return res.json({ status: false, message: 'معرف الطلب والتقييم (1-5) مطلوبان' });
        }

        const request = await Request.findOneAndUpdate(
            { 
                _id: requestId, 
                userId: req.user._id,
                status: 'finished',
                rating: null
            },
            { rating: rating },
            { new: true }
        );

        if (!request) {
            return res.json({ status: false, message: 'الطلب غير موجود أو لم يتم إنهاؤه أو سبق تقييمه' });
        }

        return res.json({
            status: true,
            message: 'تم تقييم الطلب بنجاح',
            rating: request.rating
        });

    } catch (error) {
        return res.json({ status: false, message: 'حدث خطأ: ' + error.message });
    }
});

// ============================================================
// ========== 10. إحصائيات النظام (GET /stats) ==========
// ============================================================
router.get('/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalTechnicians = await User.countDocuments({ role: 'technician' });
        const totalRequests = await Request.countDocuments();
        const pendingRequests = await Request.countDocuments({ status: 'pending' });
        const acceptedRequests = await Request.countDocuments({ status: 'accepted' });
        const finishedRequests = await Request.countDocuments({ status: 'finished' });
        
        const avgRating = await Request.aggregate([
            { $match: { rating: { $ne: null } } },
            { $group: { _id: null, avg: { $avg: '$rating' } } }
        ]);

        return res.json({
            status: true,
            stats: {
                users: {
                    total: totalUsers,
                    students: totalStudents,
                    technicians: totalTechnicians
                },
                requests: {
                    total: totalRequests,
                    pending: pendingRequests,
                    accepted: acceptedRequests,
                    finished: finishedRequests
                },
                averageRating: avgRating[0]?.avg || 0
            }
        });

    } catch (error) {
        return res.json({ status: false, message: 'حدث خطأ: ' + error.message });
    }
});

// ============================================================
// ========== 11. جلب جميع المستخدمين (للمدير) (GET /users) ==========
// ============================================================
router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password -tokens');
        return res.json({
            status: true,
            count: users.length,
            users: users
        });
    } catch (error) {
        return res.json({ status: false, message: 'حدث خطأ: ' + error.message });
    }
});

// ============================================================
// ========== 12. حذف طلب (للمدير أو صاحب الطلب) (DELETE /requests/delete) ==========
// ============================================================
router.delete('/requests/delete', authMiddleware, async (req, res) => {
    try {
        const { requestId } = req.query;

        if (!requestId) {
            return res.json({ status: false, message: 'معرف الطلب مطلوب' });
        }

        let request = await Request.findById(requestId);
        
        if (!request) {
            return res.json({ status: false, message: 'الطلب غير موجود' });
        }

        // التحقق من الصلاحية: المدير أو صاحب الطلب فقط
        if (req.user.role !== 'admin' && request.userId.toString() !== req.user._id.toString()) {
            return res.json({ status: false, message: 'غير مصرح لك بحذف هذا الطلب' });
        }

        await Request.findByIdAndDelete(requestId);

        return res.json({
            status: true,
            message: 'تم حذف الطلب بنجاح'
        });

    } catch (error) {
        return res.json({ status: false, message: 'حدث خطأ: ' + error.message });
    }
});

// ============================================================
// ========== 13. مساعدة (GET /help) ==========
// ============================================================
router.get('/help', (req, res) => {
    res.json({
        status: true,
        creator: "BrainCode Team",
        app: "BrainCode Support System API",
        version: "3.0.0",
        note: "✅ نظام متكامل للدعم الفني مع تشفير كلمات المرور ومصادقة JWT",
        endpoints: {
            auth: {
                register: "POST /auth/register { username, email, phone, password, department, academicYear, role? }",
                login: "POST /auth/login { username/email, password }",
                logout: "POST /auth/logout (requires Bearer token)"
            },
            requests: {
                create: "POST /requests/create { serviceType, subService, details } (requires token)",
                my: "GET /requests/my (requires token)",
                all: "GET /requests/all?status=&department= (admin only, requires token)",
                accept: "POST /requests/accept { requestId } (technician/admin, requires token)",
                finish: "POST /requests/finish { requestId } (technician/admin, requires token)",
                rate: "POST /requests/rate { requestId, rating (1-5) } (requires token)",
                delete: "DELETE /requests/delete?requestId= (requires token)"
            },
            admin: {
                users: "GET /users (admin only, requires token)",
                stats: "GET /stats"
            }
        }
    });
});

export default router;