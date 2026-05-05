import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ========== إعدادات بسيطة ==========
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// ========== نماذج قاعدة البيانات ==========
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    department: { type: String, required: true },
    academicYear: { type: String, required: true },
    role: { type: String, default: 'student' },
    createdAt: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    serviceType: { type: String, required: true },
    subService: { type: String, required: true },
    details: { type: String, required: true },
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Request = mongoose.model('Request', requestSchema);

// ========== الاتصال بقاعدة البيانات ==========
if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is not defined in environment variables');
} else {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => console.log('✅ MongoDB Connected'))
        .catch(err => console.error('❌ MongoDB Error:', err.message));
}

// ========== API Endpoints ==========

// اختبار بسيط
app.get('/api/test', (req, res) => {
    res.json({ status: true, message: 'API is working!' });
});

// تسجيل مستخدم جديد
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, email, phone, password, department, academicYear } = req.body;
        
        if (!username || !email || !phone || !password || !department || !academicYear) {
            return res.json({ status: false, message: 'جميع الحقول مطلوبة' });
        }
        
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.json({ status: false, message: 'المستخدم موجود مسبقاً' });
        }
        
        const bcrypt = await import('bcryptjs');
        const hashedPassword = await bcrypt.default.hash(password, 10);
        
        const user = new User({ username, email, phone, password: hashedPassword, department, academicYear });
        await user.save();
        
        res.json({ status: true, message: 'تم التسجيل بنجاح', user: { id: user._id, username, email } });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// تسجيل دخول
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        const loginField = username || email;
        
        if (!loginField || !password) {
            return res.json({ status: false, message: 'جميع الحقول مطلوبة' });
        }
        
        const user = await User.findOne({ $or: [{ username: loginField }, { email: loginField }] });
        if (!user) {
            return res.json({ status: false, message: 'بيانات غير صحيحة' });
        }
        
        const bcrypt = await import('bcryptjs');
        const isValid = await bcrypt.default.compare(password, user.password);
        if (!isValid) {
            return res.json({ status: false, message: 'بيانات غير صحيحة' });
        }
        
        res.json({ status: true, message: 'تم الدخول بنجاح', user: { id: user._id, username: user.username, email: user.email, role: user.role } });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// إنشاء طلب
app.post('/api/requests/create', async (req, res) => {
    try {
        const { userId, serviceType, subService, details } = req.body;
        
        if (!userId || !serviceType || !subService || !details) {
            return res.json({ status: false, message: 'جميع الحقول مطلوبة' });
        }
        
        const newRequest = new Request({ userId, serviceType, subService, details });
        await newRequest.save();
        
        res.json({ status: true, message: 'تم إنشاء الطلب', request: newRequest });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// جلب الطلبات
app.get('/api/requests/:userId', async (req, res) => {
    try {
        const requests = await Request.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json({ status: true, requests });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// إحصائيات
app.get('/api/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalRequests = await Request.countDocuments();
        res.json({ status: true, stats: { totalUsers, totalRequests } });
    } catch (error) {
        res.json({ status: false, message: error.message });
    }
});

// نقطة المساعدة
app.get('/api/help', (req, res) => {
    res.json({
        status: true,
        app: 'BrainCode Support System',
        version: '1.0.0',
        endpoints: {
            test: 'GET /api/test',
            register: 'POST /api/auth/register',
            login: 'POST /api/auth/login',
            createRequest: 'POST /api/requests/create',
            getRequests: 'GET /api/requests/:userId',
            stats: 'GET /api/stats'
        }
    });
});

// ========== الصفحة الرئيسية ==========
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// ========== تشغيل السيرفر ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Test API: https://brain-brainnn.vercel.app/api/test`);
});
