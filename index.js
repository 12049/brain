import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ========== الأمان ==========
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ========== Rate Limiting ==========
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { status: false, message: 'عدد الطلبات كبير جداً' },
});
app.use('/api/', limiter);

// ========== نماذج قاعدة البيانات ==========
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    department: { type: String, required: true },
    academicYear: { type: String, required: true },
    role: { type: String, enum: ['student', 'technician', 'admin'], default: 'student' },
    createdAt: { type: Date, default: Date.now }
});

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

// ========== الاتصال بقاعدة البيانات ==========
if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined');
} else {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => {
            console.log('✅ MongoDB Connected');
            createAdminIfNotExists();
        })
        .catch(err => console.error('❌ MongoDB Error:', err.message));
}

async function createAdminIfNotExists() {
    try {
        const adminExists = await User.findOne({ role: 'admin' });
        if (!adminExists && process.env.ADMIN_PASSWORD) {
            const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
            const admin = new User({
                username: process.env.ADMIN_USERNAME || 'admin',
                email: process.env.ADMIN_EMAIL || 'admin@braincode.com',
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
        console.error('Admin creation error:', err.message);
    }
}

// ========== دوال مساعدة ==========
const generateToken = (user) => {
    return jwt.sign(
        { id: user._id, username: user.username, role: user.role },
        process.env.JWT_SECRET || 'fallback_secret_change_me',
        { expiresIn: '7d' }
    );
};

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ status: false, message: 'غير مصرح' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_change_me');
        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.status(401).json({ status: false, message: 'مستخدم غير موجود' });
        }
        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({ status: false, message: 'توكن غير صالح' });
    }
};

const adminMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ status: false, message: 'غير مصرح' });
    }
    next();
};

// ========== API Endpoints ==========

// تسجيل مستخدم جديد
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, phone, password, department, academicYear } = req.body;
        
        if (!username || !email || !phone || !password || !department || !academicYear) {
            return res.status(400).json({ status: false, message: 'جميع الحقول مطلوبة' });
        }
        
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(409).json({ status: false, message: 'المستخدم موجود مسبقاً' });
        }
        
        const hashedPassword = await bcrypt.hash(password, 12);
        const user = new User({ username, email, phone, password: hashedPassword, department, academicYear });
        await user.save();
        const token = generateToken(user);
        
        res.status(201).json({
            status: true,
            message: 'تم التسجيل بنجاح',
            user: { id: user._id, username, email, phone, department, academicYear, role: user.role },
            token
        });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// تسجيل دخول
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const loginField = username || email;
        
        if (!loginField || !password) {
            return res.status(400).json({ status: false, message: 'اسم المستخدم وكلمة المرور مطلوبان' });
        }
        
        const user = await User.findOne({ $or: [{ username: loginField }, { email: loginField }] });
        if (!user) {
            return res.status(401).json({ status: false, message: 'بيانات غير صحيحة' });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(401).json({ status: false, message: 'بيانات غير صحيحة' });
        }
        
        const token = generateToken(user);
        res.json({
            status: true,
            message: 'تم الدخول بنجاح',
            user: { id: user._id, username: user.username, email: user.email, phone: user.phone, department: user.department, academicYear: user.academicYear, role: user.role },
            token
        });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// إنشاء طلب
app.post('/api/requests/create', authMiddleware, async (req, res) => {
    try {
        const { serviceType, subService, details } = req.body;
        
        if (!serviceType || !subService || !details) {
            return res.status(400).json({ status: false, message: 'جميع الحقول مطلوبة' });
        }
        
        const newRequest = new Request({
            userId: req.user._id,
            serviceType,
            subService,
            details,
            status: 'pending'
        });
        
        await newRequest.save();
        res.status(201).json({ status: true, message: 'تم إنشاء الطلب', request: newRequest });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// جلب طلباتي
app.get('/api/requests/my', authMiddleware, async (req, res) => {
    try {
        const requests = await Request.find({ userId: req.user._id }).sort({ createdAt: -1 });
        res.json({ status: true, count: requests.length, requests });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// إحصائيات
app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalRequests = await Request.countDocuments();
        res.json({ status: true, stats: { totalUsers, totalRequests } });
    } catch (error) {
        res.status(500).json({ status: false, message: error.message });
    }
});

// مساعدة
app.get('/api/help', (req, res) => {
    res.json({
        status: true,
        app: 'BrainCode Support System',
        version: '3.0.0',
        endpoints: {
            register: 'POST /api/auth/register',
            login: 'POST /api/auth/login',
            createRequest: 'POST /api/requests/create',
            myRequests: 'GET /api/requests/my',
            stats: 'GET /api/stats'
        }
    });
});

// الصفحة الرئيسية
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// معالج الأخطاء
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ status: false, message: 'خطأ داخلي' });
});

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
