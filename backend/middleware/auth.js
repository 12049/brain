import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({
                status: false,
                message: 'غير مصرح، يرجى تسجيل الدخول'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return res.status(401).json({
                status: false,
                message: 'المستخدم غير موجود'
            });
        }

        req.user = user;
        req.token = token;
        next();

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                status: false,
                message: 'توكن غير صالح'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                status: false,
                message: 'انتهت صلاحية التوكن، يرجى تسجيل الدخول مرة أخرى'
            });
        }
        return res.status(500).json({
            status: false,
            message: 'خطأ في المصادقة: ' + error.message
        });
    }
};

export const adminMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            status: false,
            message: 'غير مصرح، هذه الخاصية للمدير فقط'
        });
    }
    next();
};

export const technicianMiddleware = (req, res, next) => {
    if (req.user.role !== 'technician' && req.user.role !== 'admin') {
        return res.status(403).json({
            status: false,
            message: 'غير مصرح، هذه الخاصية للتقنيين فقط'
        });
    }
    next();
};