import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import xss from 'xss';
import webpush from 'web-push';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ========== إعدادات Web Push ==========
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@braincode.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// ========== الأمان ==========
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https://raw.githubusercontent.com"],
        },
    },
}));

app.use(cors({
    origin: ['http://localhost:3000', 'https://braincode-support.vercel.app'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'frontend')));

// ========== Rate Limiting ==========
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { status: false, message: 'عدد الطلبات كبير جداً، حاول لاحقاً' },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { status: false, message: 'محاولات كثيرة، انتظر ساعة' },
});
app.use('/api/auth/', authLimiter);

// ========== نماذج قاعدة البيانات (تعريف أولاً) ==========
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    email: { type: String, required: true, unique: true, lowercase: true, match: /^\S+@\S+\.\S+$/ },
    phone: { type: String, required: true, match: /^[0-9]{8,15}$/ },
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
    pushSubscription: { type: Object, default: null },
    createdAt: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    serviceType: { type: String, enum: ['maintenance', 'programming'], required: true },
    subService: { type: String, required: true },
    details: { type: String, required: true, maxlength: 1000 },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['pending', 'accepted', 'finished'], default: 'pending' },
    rating: { type: Number, min: 1, max: 5, default: null },
    createdAt: { type: Date, default: Date.now },
    finishedAt: { type: Date, default: null }
});

const User = mongoose.model('User', userSchema);
const Request = mongoose.model('Request', requestSchema);

// ========== الاتصال بقاعدة البيانات ==========
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected');
        
        // إنشاء حساب Admin تلقائياً إذا لم يوجد
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
            const admin = new User({
                username: process.env.ADMIN_USERNAME,
                email: process.env.ADMIN_EMAIL,
                phone: '0999999999',
                password: hashedPassword,
                department: 'حواسيب',
                academicYear: 'سنة رابعة',
                role: 'admin'
            });
            await admin.save();
            console.log('✅ Admin account created');
        }
    } catch (err) {
        console.error('❌ MongoDB Error:', err.message);
        setTimeout(connectDB, 5000);
    }
};

// تشغيل الاتصال بقاعدة البيانات
connectDB();

// ========== دوال مساعدة ==========
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );
};

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ status: false, message: 'غير مصرح، يرجى تسجيل الدخول' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.status(401).json({ status: false, message: 'المستخدم غير موجود' });
        }
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ status: false, message: 'توكن غير صالح أو منتهي' });
    }
};

const adminMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ status: false, message: 'غير مصرح، هذه الخاصية للمدير فقط' });
    }
    next();
};

const technicianMiddleware = (req, res, next) => {
    if (req.user.role !== 'technician' && req.user.role !== 'admin') {
        return res.status(403).json({ status: false, message: 'غير مصرح، هذه الخاصية للتقنيين فقط' });
    }
    next();
};

// ========== إرسال الإشعارات ==========
async function sendNotification(subscription, title, body, icon = '/favicon.ico') {
    if (!subscription || !subscription.endpoint) return false;
    try {
        await webpush.sendNotification(subscription, JSON.stringify({ title, body, icon }));
        return true;
    } catch (error) {
        console.error('Notification error:', error);
        return false;
    }
}

async function notifyTechnicians(title, body, requestId) {
    const technicians = await User.find({ role: 'technician', pushSubscription: { $ne: null } });
    for (const tech of technicians) {
        if (tech.pushSubscription) {
            await sendNotification(tech.pushSubscription, title, `${body} - الطلب #${requestId}`);
        }
    }
}

// ========== API Endpoints ==========

// 1. تسجيل مستخدم جديد
app.post('/api/auth/register', [
    body('username').trim().isLength({ min: 3, max: 30 }).escape(),
    body('email').isEmail().normalizeEmail(),
    body('phone').matches(/^[0-9]{8,15}$/),
    body('password').isLength({ min: 6 }),
    body('department').notEmpty(),
    body('academicYear').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ status: false, message: 'بيانات غير صحيحة', errors: errors.array() });
    }

    try {
        const { username, email, phone, password, department, academicYear, role } = req.body;

        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(409).json({ status: false, message: 'اسم المستخدم أو البريد موجود مسبقاً' });
        }

        const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
        const user = new User({
            username: xss(username),
            email: xss(email),
            phone: xss(phone),
            password: hashedPassword,
            department,
            academicYear,
            role: role === 'technician' ? 'technician' : 'student'
        });

        await user.save();
        const token = generateToken(user);

        res.status(201).json({
            status: true,
            message: 'تم التسجيل بنجاح',
            user: { id: user._id, username: user.username, email: user.email, phone: user.phone, department: user.department, academicYear: user.academicYear, role: user.role },
            token
        });
    } catch (error) {
        res.status(500).json({ status: false, message: 'خطأ في الخادم: ' + error.message });
    }
});

// 2. تسجيل دخول
app.post('/api/auth/login', [
    body('username').trim().optional(),
    body('email').isEmail().normalizeEmail().optional(),
    body('password').notEmpty()
], async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const loginField = username || email;

        if (!loginField || !password) {
            return res.status(400).json({ status: false, message: 'البريد/اسم المستخدم وكلمة المرور مطلوبان' });
        }

        const user = await User.findOne({
            $or: [{ username: loginField }, { email: loginField }]
        });

        if (!user) {
            return res.status(401).json({ status: false, message: 'بيانات الدخول غير صحيحة' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ status: false, message: 'بيانات الدخول غير صحيحة' });
        }

        const token = generateToken(user);

        res.json({
            status: true,
            message: 'تم تسجيل الدخول بنجاح',
            user: { id: user._id, username: user.username, email: user.email, phone: user.phone, department: user.department, academicYear: user.academicYear, role: user.role },
            token
        });
    } catch (error) {
        res.status(500).json({ status: false, message: 'خطأ في الخادم: ' + error.message });
    }
});

// 3. حفظ اشتراك الإشعارات
app.post('/api/auth/subscribe', authMiddleware, async (req, res) => {
    try {
        const { subscription } = req.body;
        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ status: false, message: 'بيانات الاشتراك غير صحيحة' });
        }
        req.user.pushSubscription = subscription;
        await req.user.save();
        res.json({ status: true, message: 'تم تفعيل الإشعارات' });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 4. إنشاء طلب جديد
app.post('/api/requests/create', authMiddleware, [
    body('serviceType').isIn(['maintenance', 'programming']),
    body('subService').trim().notEmpty(),
    body('details').trim().notEmpty().maxLength(1000)
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ status: false, message: 'بيانات غير صحيحة', errors: errors.array() });
    }

    try {
        const { serviceType, subService, details } = req.body;

        const newRequest = new Request({
            userId: req.user._id,
            serviceType,
            subService: xss(subService),
            details: xss(details),
            status: 'pending'
        });

        await newRequest.save();

        // إرسال إشعار لجميع التقنيين
        await notifyTechnicians(
            'طلب دعم جديد',
            `${req.user.username} يطلب خدمة ${serviceType === 'maintenance' ? 'صيانة' : 'برمجة'}`,
            newRequest._id.toString().slice(-6)
        );

        res.status(201).json({
            status: true,
            message: 'تم إنشاء الطلب بنجاح',
            request: newRequest
        });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 5. جلب طلبات المستخدم الحالي
app.get('/api/requests/my', authMiddleware, async (req, res) => {
    try {
        const requests = await Request.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .populate('assignedTo', 'username');
        res.json({ status: true, count: requests.length, requests });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 6. جلب جميع الطلبات (للمدير فقط)
app.get('/api/requests/all', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { status, department } = req.query;
        let filter = {};
        if (status) filter.status = status;
        
        const requests = await Request.find(filter)
            .sort({ createdAt: -1 })
            .populate('userId', 'username email department academicYear')
            .populate('assignedTo', 'username');

        let filteredRequests = requests;
        if (department) {
            filteredRequests = requests.filter(r => r.userId?.department === department);
        }

        res.json({ status: true, count: filteredRequests.length, requests: filteredRequests });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 7. قبول طلب (للتقنيين)
app.post('/api/requests/accept', authMiddleware, technicianMiddleware, async (req, res) => {
    try {
        const { requestId } = req.body;
        if (!requestId) {
            return res.status(400).json({ status: false, message: 'معرف الطلب مطلوب' });
        }

        const request = await Request.findOneAndUpdate(
            { _id: requestId, status: 'pending', assignedTo: null },
            { status: 'accepted', assignedTo: req.user._id },
            { new: true }
        ).populate('userId', 'username pushSubscription');

        if (!request) {
            return res.status(404).json({ status: false, message: 'الطلب غير موجود أو تم قبوله من قبل' });
        }

        // إشعار للطالب
        if (request.userId?.pushSubscription) {
            await sendNotification(
                request.userId.pushSubscription,
                'تم قبول طلبك',
                `التقني ${req.user.username} قام بقبول طلبك`
            );
        }

        res.json({ status: true, message: 'تم قبول الطلب', request });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 8. إنهاء طلب
app.post('/api/requests/finish', authMiddleware, technicianMiddleware, async (req, res) => {
    try {
        const { requestId } = req.body;
        if (!requestId) {
            return res.status(400).json({ status: false, message: 'معرف الطلب مطلوب' });
        }

        const request = await Request.findOneAndUpdate(
            { _id: requestId, assignedTo: req.user._id, status: 'accepted' },
            { status: 'finished', finishedAt: new Date() },
            { new: true }
        ).populate('userId', 'pushSubscription');

        if (!request) {
            return res.status(404).json({ status: false, message: 'الطلب غير موجود أو ليس من مهامك' });
        }

        if (request.userId?.pushSubscription) {
            await sendNotification(
                request.userId.pushSubscription,
                'تم إكمال طلبك',
                `طلبك #${request._id.toString().slice(-6)} قد اكتمل`
            );
        }

        res.json({ status: true, message: 'تم إنهاء الطلب', request });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 9. تقييم طلب
app.post('/api/requests/rate', authMiddleware, async (req, res) => {
    try {
        const { requestId, rating } = req.body;
        if (!requestId || !rating || rating < 1 || rating > 5) {
            return res.status(400).json({ status: false, message: 'التقييم يجب أن يكون بين 1 و 5' });
        }

        const request = await Request.findOneAndUpdate(
            { _id: requestId, userId: req.user._id, status: 'finished', rating: null },
            { rating },
            { new: true }
        );

        if (!request) {
            return res.status(404).json({ status: false, message: 'الطلب غير موجود أو سبق تقييمه' });
        }

        res.json({ status: true, message: 'شكراً لتقييمك', rating: request.rating });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 10. إحصائيات النظام
app.get('/api/stats', async (req, res) => {
    try {
        const [totalUsers, totalStudents, totalTechnicians, totalRequests, pendingRequests, acceptedRequests, finishedRequests, avgRating] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ role: 'student' }),
            User.countDocuments({ role: 'technician' }),
            Request.countDocuments(),
            Request.countDocuments({ status: 'pending' }),
            Request.countDocuments({ status: 'accepted' }),
            Request.countDocuments({ status: 'finished' }),
            Request.aggregate([{ $match: { rating: { $ne: null } } }, { $group: { _id: null, avg: { $avg: '$rating' } } }])
        ]);

        res.json({
            status: true,
            stats: {
                users: { total: totalUsers, students: totalStudents, technicians: totalTechnicians },
                requests: { total: totalRequests, pending: pendingRequests, accepted: acceptedRequests, finished: finishedRequests },
                averageRating: avgRating[0]?.avg || 0
            }
        });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 11. جلب جميع المستخدمين (للمدير)
app.get('/api/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password -pushSubscription');
        res.json({ status: true, count: users.length, users });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 12. حذف طلب (للمدير أو صاحب الطلب)
app.delete('/api/requests/delete', authMiddleware, async (req, res) => {
    try {
        const { requestId } = req.query;
        if (!requestId) {
            return res.status(400).json({ status: false, message: 'معرف الطلب مطلوب' });
        }

        const request = await Request.findById(requestId);
        if (!request) {
            return res.status(404).json({ status: false, message: 'الطلب غير موجود' });
        }

        if (req.user.role !== 'admin' && request.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({ status: false, message: 'غير مصرح لك بحذف هذا الطلب' });
        }

        await Request.findByIdAndDelete(requestId);
        res.json({ status: true, message: 'تم حذف الطلب' });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// 13. نقطة المساعدة
app.get('/api/help', (req, res) => {
    res.json({
        status: true,
        creator: 'BrainCode Team',
        app: 'BrainCode Support System',
        version: '3.0.0',
        features: ['JWT Authentication', 'Push Notifications', 'Role-based access', 'Rate limiting', 'XSS Protection', 'MongoDB Atlas'],
        endpoints: {
            auth: { register: 'POST /api/auth/register', login: 'POST /api/auth/login', subscribe: 'POST /api/auth/subscribe' },
            requests: { create: 'POST /api/requests/create', my: 'GET /api/requests/my', all: 'GET /api/requests/all', accept: 'POST /api/requests/accept', finish: 'POST /api/requests/finish', rate: 'POST /api/requests/rate', delete: 'DELETE /api/requests/delete' },
            other: { stats: 'GET /api/stats', users: 'GET /api/users', help: 'GET /api/help' }
        }
    });
});

// ========== Serve Frontend ==========
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ========== Error Handler ==========
app.use((err, req, res, next) => {
    console.error('Server Error:', err);
    res.status(500).json({ status: false, message: 'خطأ داخلي في الخادم' });
});

// ========== تشغيل السيرفر ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 API: http://localhost:${PORT}/api/help`);
});