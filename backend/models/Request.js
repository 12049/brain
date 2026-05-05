import mongoose from 'mongoose';

/**
 * نموذج طلب الدعم - BrainCode Support System
 * يدير طلبات الصيانة والبرمجة
 */

const requestSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'معرف المستخدم مطلوب'],
            index: true
        },
        serviceType: {
            type: String,
            enum: {
                values: ['maintenance', 'programming'],
                message: 'نوع الخدمة يجب أن يكون صيانة أو برمجة'
            },
            required: [true, 'نوع الخدمة مطلوب']
        },
        subService: {
            type: String,
            required: [true, 'الخدمة الفرعية مطلوبة'],
            trim: true,
            maxlength: [100, 'الخدمة الفرعية لا تتجاوز 100 حرف']
        },
        details: {
            type: String,
            required: [true, 'تفاصيل الطلب مطلوبة'],
            trim: true,
            maxlength: [1000, 'التفاصيل لا تتجاوز 1000 حرف']
        },
        assignedTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            index: true
        },
        status: {
            type: String,
            enum: {
                values: ['pending', 'accepted', 'finished'],
                message: 'حالة الطلب غير صحيحة'
            },
            default: 'pending',
            index: true
        },
        rating: {
            type: Number,
            min: [1, 'التقييم يجب أن يكون بين 1 و 5'],
            max: [5, 'التقييم يجب أن يكون بين 1 و 5'],
            default: null
        },
        feedback: {
            type: String,
            maxlength: [500, 'الملاحظات لا تتجاوز 500 حرف'],
            default: null
        },
        priority: {
            type: String,
            enum: {
                values: ['low', 'normal', 'high', 'urgent'],
                message: 'الأولوية غير صحيحة'
            },
            default: 'normal'
        },
        attachments: {
            type: [String],
            default: []
        },
        resolvedAt: {
            type: Date,
            default: null
        },
        finishedAt: {
            type: Date,
            default: null
        },
        estimatedTime: {
            type: Number, // بالدقائق
            default: null
        },
        technicianNotes: {
            type: String,
            maxlength: [500, 'ملاحظات التقني لا تتجاوز 500 حرف'],
            default: null
        }
    },
    {
        timestamps: true, // createdAt و updatedAt تلقائياً
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// ========== الفهارس (Indexes) لتحسين الأداء ==========
requestSchema.index({ userId: 1, createdAt: -1 });
requestSchema.index({ assignedTo: 1, status: 1 });
requestSchema.index({ status: 1, createdAt: -1 });
requestSchema.index({ priority: 1 });
requestSchema.index({ serviceType: 1 });
requestSchema.index({ createdAt: -1 });

// ========== العلاقات الافتراضية (Virtuals) ==========
// معلومات المستخدم الذي قدم الطلب
requestSchema.virtual('user', {
    ref: 'User',
    localField: 'userId',
    foreignField: '_id',
    justOne: true
});

// معلومات التقني المعين
requestSchema.virtual('technician', {
    ref: 'User',
    localField: 'assignedTo',
    foreignField: '_id',
    justOne: true
});

// ========== دوال مساعدة (Instance Methods) ==========
// قبول الطلب
requestSchema.methods.accept = async function(technicianId) {
    if (this.status !== 'pending') {
        throw new Error('لا يمكن قبول طلب غير معلق');
    }
    if (this.assignedTo) {
        throw new Error('الطلب معين بالفعل لتقني آخر');
    }
    
    this.status = 'accepted';
    this.assignedTo = technicianId;
    this.updatedAt = new Date();
    
    return await this.save();
};

// إنهاء الطلب
requestSchema.methods.finish = async function() {
    if (this.status !== 'accepted') {
        throw new Error('لا يمكن إنهاء طلب غير مقبول');
    }
    
    this.status = 'finished';
    this.finishedAt = new Date();
    this.updatedAt = new Date();
    
    // تحديث إحصائيات التقني والطالب
    const User = mongoose.model('User');
    const technician = await User.findById(this.assignedTo);
    const student = await User.findById(this.userId);
    
    if (technician) {
        technician.stats.completedRequests = (technician.stats.completedRequests || 0) + 1;
        await technician.save();
    }
    
    if (student && this.rating) {
        await student.updateStats();
    }
    
    return await this.save();
};

// تقييم الطلب
requestSchema.methods.rate = async function(rating, feedback = null) {
    if (this.status !== 'finished') {
        throw new Error('لا يمكن تقييم طلب غير منتهي');
    }
    if (this.rating !== null) {
        throw new Error('تم تقييم هذا الطلب مسبقاً');
    }
    if (rating < 1 || rating > 5) {
        throw new Error('التقييم يجب أن يكون بين 1 و 5');
    }
    
    this.rating = rating;
    if (feedback) this.feedback = feedback;
    this.updatedAt = new Date();
    
    const savedRequest = await this.save();
    
    // تحديث متوسط تقييم التقني
    if (this.assignedTo) {
        const User = mongoose.model('User');
        const technician = await User.findById(this.assignedTo);
        if (technician) {
            const avgResult = await mongoose.model('Request').aggregate([
                { $match: { assignedTo: technician._id, rating: { $ne: null } } },
                { $group: { _id: null, avg: { $avg: '$rating' } } }
            ]);
            technician.stats.averageRating = avgResult[0]?.avg || 0;
            await technician.save();
        }
    }
    
    return savedRequest;
};

// إعادة فتح طلب منتهي
requestSchema.methods.reopen = async function() {
    if (this.status !== 'finished') {
        throw new Error('لا يمكن إعادة فتح طلب غير منتهي');
    }
    
    this.status = 'accepted';
    this.finishedAt = null;
    this.updatedAt = new Date();
    
    return await this.save();
};

// تغيير الأولوية
requestSchema.methods.setPriority = async function(priority) {
    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    if (!validPriorities.includes(priority)) {
        throw new Error('أولوية غير صحيحة');
    }
    
    this.priority = priority;
    this.updatedAt = new Date();
    
    return await this.save();
};

// ========== دوال ثابتة (Static Methods) ==========
// جلب طلبات المستخدم
requestSchema.statics.findByUser = function(userId) {
    return this.find({ userId }).sort({ createdAt: -1 });
};

// جلب طلبات التقني
requestSchema.statics.findByTechnician = function(technicianId) {
    return this.find({ assignedTo: technicianId }).sort({ createdAt: -1 });
};

// جلب الطلبات المعلقة
requestSchema.statics.findPending = function() {
    return this.find({ status: 'pending' }).sort({ createdAt: 1 });
};

// جلب إحصائيات الطلبات
requestSchema.statics.getStats = async function() {
    const stats = await this.aggregate([
        { $group: {
            _id: '$status',
            count: { $sum: 1 }
        }}
    ]);
    
    const result = { pending: 0, accepted: 0, finished: 0 };
    stats.forEach(s => {
        if (s._id === 'pending') result.pending = s.count;
        if (s._id === 'accepted') result.accepted = s.count;
        if (s._id === 'finished') result.finished = s.count;
    });
    result.total = result.pending + result.accepted + result.finished;
    
    // متوسط التقييم العام
    const avgRating = await this.aggregate([
        { $match: { rating: { $ne: null } } },
        { $group: { _id: null, avg: { $avg: '$rating' } } }
    ]);
    result.averageRating = avgRating[0]?.avg || 0;
    
    return result;
};

// جلب الطلبات حسب القسم
requestSchema.statics.getByDepartmentStats = async function() {
    return await this.aggregate([
        {
            $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'user'
            }
        },
        { $unwind: '$user' },
        {
            $group: {
                _id: '$user.department',
                count: { $sum: 1 },
                pending: {
                    $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                },
                finished: {
                    $sum: { $cond: [{ $eq: ['$status', 'finished'] }, 1, 0] }
                }
            }
        },
        { $sort: { count: -1 } }
    ]);
};

// ========== Middleware قبل الحفظ ==========
requestSchema.pre('save', function(next) {
    // التأكد من أن finishedAt يتم تعيينه فقط عند التغيير إلى finished
    if (this.status === 'finished' && !this.finishedAt && this.isModified('status')) {
        this.finishedAt = new Date();
    }
    
    // حساب الوقت المستغرق إذا تم الإنتهاء
    if (this.status === 'finished' && this.finishedAt && this.createdAt) {
        const timeSpent = Math.floor((this.finishedAt - this.createdAt) / (1000 * 60));
        this.estimatedTime = timeSpent;
    }
    
    next();
});

// ========== Middleware بعد الحفظ ==========
requestSchema.post('save', async function(doc) {
    // تحديث إحصائيات المستخدم
    const User = mongoose.model('User');
    const user = await User.findById(doc.userId);
    if (user) {
        await user.updateStats();
    }
});

const Request = mongoose.model('Request', requestSchema);

export default Request;