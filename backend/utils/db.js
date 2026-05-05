import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

/**
 * ملف إدارة اتصال قاعدة البيانات MongoDB
 * يحتوي على دوال الاتصال، إعادة المحاولة، والتحقق من الصحة
 */

// ========== متغيرات حالة الاتصال ==========
let isConnected = false;
let connectionAttempts = 0;
const MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAY_MS = 5000;

// خيارات اتصال MongoDB المحسنة
const connectionOptions = {
    serverSelectionTimeoutMS: 10000, // 10 ثواني
    socketTimeoutMS: 45000, // 45 ثانية
    family: 4, // استخدام IPv4
    maxPoolSize: 50, // الحد الأقصى لعدد الاتصالات المتزامنة
    minPoolSize: 5, // الحد الأدنى لعدد الاتصالات
    retryWrites: true,
    retryReads: true,
    writeConcern: { w: 'majority' },
    readPreference: 'primaryPreferred'
};

// ========== دالة الاتصال بقاعدة البيانات ==========
export const connectDB = async () => {
    // التحقق من وجود رابط قاعدة البيانات
    if (!process.env.MONGODB_URI) {
        console.error('❌ MONGODB_URI غير موجود في ملف .env');
        throw new Error('MONGODB_URI is not defined in environment variables');
    }

    // إذا كان الاتصال موجوداً بالفعل
    if (isConnected && mongoose.connection.readyState === 1) {
        console.log('✅ الاتصال بقاعدة البيانات موجود بالفعل');
        return mongoose.connection;
    }

    try {
        console.log('🔄 جاري الاتصال بقاعدة البيانات...');
        
        const connection = await mongoose.connect(process.env.MONGODB_URI, connectionOptions);
        
        isConnected = true;
        connectionAttempts = 0;
        
        console.log(`✅ تم الاتصال بقاعدة البيانات بنجاح`);
        console.log(`📊 قاعدة البيانات: ${connection.connection.db.databaseName}`);
        console.log(`🔌 حالة الاتصال: ${mongoose.connection.readyState}`);
        
        return connection;
        
    } catch (error) {
        console.error('❌ فشل الاتصال بقاعدة البيانات:', error.message);
        isConnected = false;
        
        // محاولة إعادة الاتصال
        if (connectionAttempts < MAX_RETRY_ATTEMPTS) {
            connectionAttempts++;
            console.log(`🔄 محاولة إعادة الاتصال (${connectionAttempts}/${MAX_RETRY_ATTEMPTS}) بعد ${RETRY_DELAY_MS / 1000} ثواني...`);
            
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
            return connectDB();
        }
        
        throw new Error(`فشل الاتصال بعد ${MAX_RETRY_ATTEMPTS} محاولات: ${error.message}`);
    }
};

// ========== دالة قطع الاتصال ==========
export const disconnectDB = async () => {
    if (!isConnected && mongoose.connection.readyState !== 1) {
        console.log('⚠️ لا يوجد اتصال نشط لقطعه');
        return;
    }

    try {
        await mongoose.disconnect();
        isConnected = false;
        console.log('🔌 تم قطع الاتصال بقاعدة البيانات');
    } catch (error) {
        console.error('❌ خطأ أثناء قطع الاتصال:', error.message);
        throw error;
    }
};

// ========== التحقق من صحة الاتصال ==========
export const checkDBHealth = async () => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return { status: false, message: 'قاعدة البيانات غير متصلة', readyState: mongoose.connection.readyState };
        }
        
        // إجراء ping بسيط للتحقق
        await mongoose.connection.db.admin().ping();
        
        const stats = {
            status: true,
            message: 'قاعدة البيانات تعمل بشكل طبيعي',
            readyState: mongoose.connection.readyState,
            databaseName: mongoose.connection.db.databaseName,
            host: mongoose.connection.host,
            port: mongoose.connection.port
        };
        
        return stats;
        
    } catch (error) {
        console.error('❌ فشل التحقق من صحة قاعدة البيانات:', error.message);
        return { status: false, message: error.message, readyState: mongoose.connection.readyState };
    }
};

// ========== الحصول على إحصائيات قاعدة البيانات ==========
export const getDBStats = async () => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return { status: false, message: 'قاعدة البيانات غير متصلة' };
        }
        
        const dbStats = await mongoose.connection.db.stats();
        const collections = await mongoose.connection.db.listCollections().toArray();
        
        // جلب عدد المستندات في كل مجموعة
        const collectionStats = {};
        for (const collection of collections) {
            const count = await mongoose.connection.db.collection(collection.name).countDocuments();
            collectionStats[collection.name] = count;
        }
        
        return {
            status: true,
            stats: {
                databaseName: mongoose.connection.db.databaseName,
                collectionsCount: collections.length,
                documentsCount: dbStats.objects,
                dataSize: (dbStats.dataSize / 1024 / 1024).toFixed(2) + ' MB',
                storageSize: (dbStats.storageSize / 1024 / 1024).toFixed(2) + ' MB',
                indexesCount: dbStats.indexes,
                indexSize: (dbStats.indexSize / 1024 / 1024).toFixed(2) + ' MB',
                collections: collectionStats
            }
        };
        
    } catch (error) {
        console.error('❌ فشل جلب إحصائيات قاعدة البيانات:', error.message);
        return { status: false, message: error.message };
    }
};

// ========== إعادة تعيين الاتصال ==========
export const resetConnection = async () => {
    console.log('🔄 جاري إعادة تعيين اتصال قاعدة البيانات...');
    
    if (isConnected) {
        await disconnectDB();
    }
    
    // إعادة تعيين المتغيرات
    isConnected = false;
    connectionAttempts = 0;
    
    // إعادة الاتصال
    return await connectDB();
};

// ========== مراقبة أحداث الاتصال ==========
export const setupConnectionListeners = () => {
    mongoose.connection.on('connected', () => {
        console.log('✅ MongoDB connected');
        isConnected = true;
    });

    mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err.message);
        isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
        console.log('⚠️ MongoDB disconnected');
        isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
        console.log('🔄 MongoDB reconnected');
        isConnected = true;
    });

    // إغلاق الاتصال عند إغلاق التطبيق
    process.on('SIGINT', async () => {
        await disconnectDB();
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        await disconnectDB();
        process.exit(0);
    });
};

// ========== التحقق من صحة رابط MongoDB ==========
export const validateMongoURI = (uri) => {
    if (!uri) return false;
    
    // التحقق من صيغة الرابط
    const mongoUriPattern = /^mongodb(\+srv)?:\/\/.+/;
    if (!mongoUriPattern.test(uri)) {
        console.error('❌ صيغة رابط MongoDB غير صحيحة');
        return false;
    }
    
    // التحقق من وجود اسم مستخدم وكلمة مرور (لـ Atlas)
    if (uri.includes('mongodb+srv')) {
        const hasCredentials = /:\/\/[^:]+:[^@]+@/.test(uri);
        if (!hasCredentials) {
            console.warn('⚠️ رابط MongoDB Atlas قد لا يحتوي على بيانات اعتماد صحيحة');
        }
    }
    
    return true;
};

// ========== دالة تهيئة قاعدة البيانات ==========
export const initDatabase = async () => {
    try {
        // التحقق من صحة الرابط
        if (!validateMongoURI(process.env.MONGODB_URI)) {
            throw new Error('رابط MongoDB غير صالح');
        }
        
        // إعداد مستمعي الأحداث
        setupConnectionListeners();
        
        // الاتصال بقاعدة البيانات
        await connectDB();
        
        // إضافة فهارس إضافية إذا لزم الأمر
        await ensureIndexes();
        
        console.log('✅ تم تهيئة قاعدة البيانات بنجاح');
        return true;
        
    } catch (error) {
        console.error('❌ فشل تهيئة قاعدة البيانات:', error.message);
        return false;
    }
};

// ========== التأكد من وجود الفهارس ==========
const ensureIndexes = async () => {
    try {
        const User = mongoose.model('User');
        const Request = mongoose.model('Request');
        
        // إضافة فهارس إضافية للنماذج إن وجدت
        await User.syncIndexes();
        await Request.syncIndexes();
        
        console.log('✅ تم التأكد من الفهارس');
    } catch (error) {
        console.warn('⚠️ تحذير أثناء إنشاء الفهارس:', error.message);
    }
};

// ========== تصدير دوال إضافية مفيدة ==========
export default {
    connectDB,
    disconnectDB,
    checkDBHealth,
    getDBStats,
    resetConnection,
    initDatabase,
    validateMongoURI,
    isConnected: () => isConnected && mongoose.connection.readyState === 1
};