import { validationResult } from 'express-validator';
import xss from 'xss';
import Request from '../models/Request.js';
import User from '../models/User.js';
import { sendNotification, notifyTechnicians } from '../utils/notifications.js';

// @desc    إنشاء طلب جديد
// @route   POST /api/requests/create
export const createRequest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: false,
            message: 'بيانات غير صحيحة',
            errors: errors.array()
        });
    }

    try {
        const { serviceType, subService, details } = req.body;

        const newRequest = new Request({
            userId: req.user._id,
            serviceType,
            subService: xss(subService.trim()),
            details: xss(details.trim()),
            status: 'pending'
        });

        await newRequest.save();

        // إرسال إشعارات لجميع التقنيين
        await notifyTechnicians(
            '📢 طلب دعم جديد',
            `${req.user.username} يطلب خدمة ${serviceType === 'maintenance' ? 'صيانة' : 'برمجة'}`,
            newRequest._id.toString().slice(-6)
        );

        res.status(201).json({
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
        console.error('Create request error:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
};

// @desc    جلب طلبات المستخدم الحالي
// @route   GET /api/requests/my
export const getMyRequests = async (req, res) => {
    try {
        const requests = await Request.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .populate('assignedTo', 'username phone');

        res.json({
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
        console.error('Get my requests error:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
};

// @desc    جلب جميع الطلبات (للمدير فقط)
// @route   GET /api/requests/all
export const getAllRequests = async (req, res) => {
    try {
        const { status, department } = req.query;
        let filter = {};
        if (status) filter.status = status;

        const requests = await Request.find(filter)
            .sort({ createdAt: -1 })
            .populate('userId', 'username email phone department academicYear')
            .populate('assignedTo', 'username phone');

        let filteredRequests = requests;
        if (department) {
            filteredRequests = requests.filter(r => r.userId?.department === department);
        }

        res.json({
            status: true,
            count: filteredRequests.length,
            requests: filteredRequests.map(r => ({
                id: r._id,
                user: {
                    id: r.userId?._id,
                    username: r.userId?.username,
                    email: r.userId?.email,
                    phone: r.userId?.phone,
                    department: r.userId?.department,
                    academicYear: r.userId?.academicYear
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
        console.error('Get all requests error:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
};

// @desc    قبول طلب (للتقنيين)
// @route   POST /api/requests/accept
export const acceptRequest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: false,
            message: errors.array()[0].msg
        });
    }

    try {
        const { requestId } = req.body;

        // استخدام atomic update لضمان أن تقني واحد فقط يقبل الطلب
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
        ).populate('userId', 'username pushSubscription');

        if (!request) {
            return res.status(404).json({
                status: false,
                message: 'الطلب غير موجود أو تم قبوله من قبل تقني آخر'
            });
        }

        // إرسال إشعار للطالب
        if (request.userId?.pushSubscription) {
            await sendNotification(
                request.userId.pushSubscription,
                '✅ تم قبول طلبك',
                `التقني ${req.user.username} قام بقبول طلبك رقم #${request._id.toString().slice(-6)}`
            );
        }

        res.json({
            status: true,
            message: 'تم قبول الطلب بنجاح',
            request: {
                id: request._id,
                status: request.status,
                assignedTo: req.user.username
            }
        });

    } catch (error) {
        console.error('Accept request error:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
};

// @desc    إنهاء طلب
// @route   POST /api/requests/finish
export const finishRequest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: false,
            message: errors.array()[0].msg
        });
    }

    try {
        const { requestId } = req.body;

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
        ).populate('userId', 'pushSubscription');

        if (!request) {
            return res.status(404).json({
                status: false,
                message: 'الطلب غير موجود أو ليس من مهامك أو ليس بحالة مقبول'
            });
        }

        // إرسال إشعار للطالب
        if (request.userId?.pushSubscription) {
            await sendNotification(
                request.userId.pushSubscription,
                '🎉 تم إكمال طلبك',
                `طلبك رقم #${request._id.toString().slice(-6)} قد اكتمل بنجاح`
            );
        }

        res.json({
            status: true,
            message: 'تم إنهاء الطلب بنجاح',
            request: {
                id: request._id,
                status: request.status,
                finishedAt: request.finishedAt
            }
        });

    } catch (error) {
        console.error('Finish request error:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
};

// @desc    تقييم طلب
// @route   POST /api/requests/rate
export const rateRequest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: false,
            message: errors.array()[0].msg
        });
    }

    try {
        const { requestId, rating } = req.body;

        const request = await Request.findOneAndUpdate(
            {
                _id: requestId,
                userId: req.user._id,
                status: 'finished',
                rating: null
            },
            { rating },
            { new: true }
        ).populate('assignedTo', 'username');

        if (!request) {
            return res.status(404).json({
                status: false,
                message: 'الطلب غير موجود أو لم يتم إنهاؤه أو سبق تقييمه'
            });
        }

        res.json({
            status: true,
            message: 'شكراً لتقييمك',
            rating: request.rating
        });

    } catch (error) {
        console.error('Rate request error:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
};

// @desc    حذف طلب (للمدير أو صاحب الطلب)
// @route   DELETE /api/requests/delete
export const deleteRequest = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            status: false,
            message: errors.array()[0].msg
        });
    }

    try {
        const { requestId } = req.query;

        const request = await Request.findById(requestId);

        if (!request) {
            return res.status(404).json({
                status: false,
                message: 'الطلب غير موجود'
            });
        }

        // التحقق من الصلاحية
        if (req.user.role !== 'admin' && request.userId.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                status: false,
                message: 'غير مصرح لك بحذف هذا الطلب'
            });
        }

        await Request.findByIdAndDelete(requestId);

        res.json({
            status: true,
            message: 'تم حذف الطلب بنجاح'
        });

    } catch (error) {
        console.error('Delete request error:', error);
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
};