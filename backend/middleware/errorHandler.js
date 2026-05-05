/**
 * Error Handler Middleware
 * معالجة مركزية لجميع أخطاء التطبيق
 */

// ========== كلاس مخصص للأخطاء ==========
export class AppError extends Error {
    constructor(message, statusCode, errorCode = null) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

// ========== أخطاء شائعة محددة ==========
export const ErrorCodes = {
    // Auth errors
    UNAUTHORIZED: 'AUTH_001',
    INVALID_TOKEN: 'AUTH_002',
    TOKEN_EXPIRED: 'AUTH_003',
    USER_NOT_FOUND: 'AUTH_004',
    WRONG_PASSWORD: 'AUTH_005',
    USER_EXISTS: 'AUTH_006',
    
    // Request errors
    REQUEST_NOT_FOUND: 'REQ_001',
    REQUEST_ALREADY_ACCEPTED: 'REQ_002',
    REQUEST_NOT_ASSIGNED: 'REQ_003',
    REQUEST_ALREADY_RATED: 'REQ_004',
    
    // Validation errors
    VALIDATION_ERROR: 'VAL_001',
    MISSING_FIELDS: 'VAL_002',
    INVALID_DATA: 'VAL_003',
    
    // Database errors
    DB_CONNECTION_ERROR: 'DB_001',
    DB_QUERY_ERROR: 'DB_002',
    
    // Rate limit
    RATE_LIMIT_EXCEEDED: 'RATE_001'
};

// ========== معالج الأخطاء الرئيسي ==========
export const errorHandler = (err, req, res, next) => {
    // تسجيل الخطأ في الكونسول (للمطورين)
    console.error('❌ Error occurred:', {
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: {
            name: err.name,
            message: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }
    });

    // ========== أخطاء JWT ==========
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            status: false,
            errorCode: ErrorCodes.INVALID_TOKEN,
            message: 'التوكن غير صالح أو تالف',
            timestamp: new Date().toISOString()
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            status: false,
            errorCode: ErrorCodes.TOKEN_EXPIRED,
            message: 'انتهت صلاحية التوكن، يرجى تسجيل الدخول مرة أخرى',
            timestamp: new Date().toISOString()
        });
    }

    // ========== أخطاء MongoDB ==========
    if (err.name === 'MongoServerError') {
        // خطأ التكرار (Duplicate Key)
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            return res.status(409).json({
                status: false,
                errorCode: ErrorCodes.USER_EXISTS,
                message: `${field === 'username' ? 'اسم المستخدم' : 'البريد الإلكتروني'} موجود مسبقاً`,
                timestamp: new Date().toISOString()
            });
        }
        
        return res.status(500).json({
            status: false,
            errorCode: ErrorCodes.DB_QUERY_ERROR,
            message: 'خطأ في قاعدة البيانات، يرجى المحاولة لاحقاً',
            timestamp: new Date().toISOString()
        });
    }

    // ========== أخطاء MongoDB Connection ==========
    if (err.name === 'MongooseError' || err.message?.includes('Mongo')) {
        return res.status(503).json({
            status: false,
            errorCode: ErrorCodes.DB_CONNECTION_ERROR,
            message: 'قاعدة البيانات غير متصلة حالياً، يرجى المحاولة لاحقاً',
            timestamp: new Date().toISOString()
        });
    }

    // ========== أخطاء Cast (ID غير صالح) ==========
    if (err.name === 'CastError' && err.kind === 'ObjectId') {
        return res.status(400).json({
            status: false,
            errorCode: ErrorCodes.INVALID_DATA,
            message: 'المعرف المرسل غير صالح',
            timestamp: new Date().toISOString()
        });
    }

    // ========== أخطاء التحقق من الصحة (express-validator) ==========
    if (err.name === 'ValidationError' || err.array) {
        const errors = err.array ? err.array() : err.errors;
        return res.status(400).json({
            status: false,
            errorCode: ErrorCodes.VALIDATION_ERROR,
            message: 'بيانات غير صحيحة',
            errors: Array.isArray(errors) ? errors.map(e => ({
                field: e.param || e.path,
                message: e.msg || e.message
            })) : errors,
            timestamp: new Date().toISOString()
        });
    }

    // ========== أخطاء Rate Limit ==========
    if (err.message === 'Rate limit exceeded' || err.statusCode === 429) {
        return res.status(429).json({
            status: false,
            errorCode: ErrorCodes.RATE_LIMIT_EXCEEDED,
            message: 'عدد الطلبات كبير جداً، يرجى المحاولة بعد 15 دقيقة',
            retryAfter: 900,
            timestamp: new Date().toISOString()
        });
    }

    // ========== أخطاء مخصصة (AppError) ==========
    if (err.isOperational && err.statusCode) {
        return res.status(err.statusCode).json({
            status: false,
            errorCode: err.errorCode,
            message: err.message,
            timestamp: new Date().toISOString()
        });
    }

    // ========== أخطاء غير متوقعة ==========
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    res.status(500).json({
        status: false,
        errorCode: 'SERVER_001',
        message: isDevelopment ? err.message : 'حدث خطأ داخلي في الخادم، يرجى المحاولة لاحقاً',
        ...(isDevelopment && { stack: err.stack }),
        timestamp: new Date().toISOString()
    });
};

// ========== معالج المسارات غير الموجودة (404) ==========
export const notFoundHandler = (req, res) => {
    res.status(404).json({
        status: false,
        errorCode: 'NOT_FOUND_001',
        message: `المسار ${req.method} ${req.originalUrl} غير موجود`,
        timestamp: new Date().toISOString()
    });
};

// ========== دالة لالتقاط الأخطاء في async functions ==========
export const catchAsync = (fn) => {
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
};

// ========== دالة لتسجيل الأخطاء في ملف (للإنتاج) ==========
export const logErrorToFile = (error, req = null) => {
    const logEntry = {
        timestamp: new Date().toISOString(),
        error: {
            name: error.name,
            message: error.message,
            stack: error.stack
        },
        ...(req && {
            request: {
                method: req.method,
                url: req.url,
                ip: req.ip,
                userAgent: req.get('user-agent'),
                userId: req.user?._id
            }
        })
    };
    
    // في بيئة الإنتاج، يمكن إرسال هذا إلى خدمة مراقبة مثل Sentry
    if (process.env.NODE_ENV === 'production') {
        // TODO: إضافة integration مع Sentry أو Loggly أو أي خدمة مراقبة
        console.error(JSON.stringify(logEntry));
    } else {
        console.error('📝 Error Log:', logEntry);
    }
};