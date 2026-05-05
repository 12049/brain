import mongoose from 'mongoose';

/**
 * نموذج المستخدم - BrainCode Support System
 * يدعم الأدوار: طالب (student) - تقني (technician) - مدير (admin)
 */

const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: [true, 'اسم المستخدم مطلوب'],
            unique: true,
            trim: true,
            minlength: [3, 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل'],
            maxlength: [30, 'اسم المستخدم يجب أن لا يتجاوز 30 حرف'],
            match: [/^[a-zA-Z0-9_]+$/, 'اسم المستخدم يمكن أن يحتوي فقط على أحرف إنجليزية وأرقام و_']
        },
        email: {
            type: String,
            required: [true, 'البريد الإلكتروني مطلوب'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [
                /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
                'البريد الإلكتروني غير صالح'
            ]
        },
        phone: {
            type: String,
            required: [true, 'رقم الهاتف مطلوب'],
            trim: true,
            match: [
                /^[0-9]{8,15}$/,
                'رقم الهاتف يجب أن يكون 8-15 رقم فقط'
            ]
        },
        password: {
            type: String,
            required: [true, 'كلمة المرور مطلوبة'],
            minlength: [6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'],
            select: false // لا يتم إرجاع كلمة المرور في الاستعلامات العادية
        },
        department: {
            type: String,
            enum: {
                values: ['ميكاترونيكس', 'اتصالات', 'حواسيب', 'الكترون', 'قيادة', 'تحكم', 'نظم قدرة'],
                message: 'القسم غير صحيح'
            },
            required: [true, 'القسم مطلوب']
        },
        academicYear: {
            type: String,
            enum: {
                values: ['سنة أولى', 'سنة ثانية', 'سنة ثالثة', 'سنة رابعة', 'سنة خامسة'],
                message: 'السنة الدراسية غير صحيحة'
            },
            required: [true, 'السنة الدراسية مطلوبة']
        },
        role: {
            type: String,
            enum: {
                values: ['student', 'technician', 'admin'],
                message: 'الدور غير صحيح'
            },
            default: 'student'
        },
        pushSubscription: {
            type: Object,
            default: null,
            select: false // لا يتم إرجاع في الاستعلامات العادية لأسباب أمنية
        },
        lastActive: {
            type: Date,
            default: Date.now
        },
        isActive: {
            type: Boolean,
            default: true
        },
        profileImage: {
            type: String,
            default: null
        },
        bio: {
            type: String,
            maxlength: [200, 'السيرة الذاتية لا تتجاوز 200 حرف'],
            default: ''
        },
        skills: {
            type: [String],
            default: []
        },
        stats: {
            totalRequests: { type: Number, default: 0 },
            completedRequests: { type: Number, default: 0 },
            averageRating: { type: Number, default: 0 }
        },
        createdAt: {
            type: Date,
            default: Date.now,
            immutable: true
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: true, // يقوم تلقائياً بإنشاء createdAt و updatedAt
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// ========== الفهارس (Indexes) لتحسين الأداء ==========
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ department: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });

// ========== العلاقات الافتراضية (Virtuals) ==========
// جلب جميع طلبات المستخدم
userSchema.virtual('requests', {
    ref: 'Request',
    localField: '_id',
    foreignField: 'userId',
    options: { sort: { createdAt: -1 } }
});

// جلب الطلبات التي تم تعيينها للمستخدم (إذا كان تقنياً)
userSchema.virtual('assignedRequests', {
    ref: 'Request',
    localField: '_id',
    foreignField: 'assignedTo',
    options: { sort: { createdAt: -1 } }
});

// ========== دوال مساعدة (Instance Methods) ==========
// التحقق من صلاحيات المستخدم
userSchema.methods.isStudent = function() {
    return this.role === 'student';
};

userSchema.methods.isTechnician = function() {
    return this.role === 'technician' || this.role === 'admin';
};

userSchema.methods.isAdmin = function() {
    return this.role === 'admin';
};

// تحديث آخر نشاط
userSchema.methods.updateLastActive = async function() {
    this.lastActive = new Date();
    return await this.save();
};

// تحديث إحصائيات المستخدم
userSchema.methods.updateStats = async function() {
    const Request = mongoose.model('Request');
    
    const totalRequests = await Request.countDocuments({ userId: this._id });
    const completedRequests = await Request.countDocuments({ 
        userId: this._id, 
        status: 'finished' 
    });
    
    const avgRatingResult = await Request.aggregate([
        { $match: { userId: this._id, rating: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$rating' } } }
    ]);
    
    this.stats = {
        totalRequests,
        completedRequests,
        averageRating: avgRatingResult[0]?.avg || 0
    };
    
    return await this.save();
};

// حذف آمن (بدون حذف فعلي من قاعدة البيانات)
userSchema.methods.softDelete = async function() {
    this.isActive = false;
    return await this.save();
};

// ========== دوال ثابتة (Static Methods) ==========
// البحث عن المستخدمين حسب الدور
userSchema.statics.findByRole = function(role) {
    return this.find({ role, isActive: true });
};

// البحث عن التقنيين النشطين
userSchema.statics.findActiveTechnicians = function() {
    return this.find({ role: 'technician', isActive: true });
};

// جلب إحصائيات المستخدمين
userSchema.statics.getStats = async function() {
    const stats = await this.aggregate([
        { $match: { isActive: true } },
        { $group: {
            _id: '$role',
            count: { $sum: 1 }
        }}
    ]);
    
    const result = { student: 0, technician: 0, admin: 0 };
    stats.forEach(s => {
        if (s._id === 'student') result.student = s.count;
        if (s._id === 'technician') result.technician = s.count;
        if (s._id === 'admin') result.admin = s.count;
    });
    result.total = result.student + result.technician + result.admin;
    
    return result;
};

// ========== Middleware قبل الحفظ ==========
userSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// ========== Middleware قبل الحذف ==========
userSchema.pre('remove', async function(next) {
    // حذف جميع طلبات المستخدم عند حذف المستخدم
    const Request = mongoose.model('Request');
    await Request.deleteMany({ userId: this._id });
    next();
});

const User = mongoose.model('User', userSchema);

export default User;