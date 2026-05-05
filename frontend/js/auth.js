/**
 * BrainCode Support System - Authentication Module
 * إدارة التسجيل وتسجيل الدخول والجلسات
 */

import { fetchAPI, currentUser, token, renderDashboardPage, logout } from './main.js';
import { showToast, showLoading } from './ui.js';
import { Notifications } from './notifications.js';

export const Auth = {
    // تسجيل الدخول
    handleLogin: async function() {
        const username = document.getElementById('loginUsername')?.value.trim();
        const password = document.getElementById('loginPassword')?.value.trim();
        
        if (!username || !password) {
            showToast('يرجى إدخال اسم المستخدم وكلمة المرور', true);
            return;
        }
        
        showLoading(true);
        const data = await fetchAPI('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
        showLoading(false);
        
        if (data.status) {
            // حفظ البيانات
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // تحديث المتغيرات العامة
            window.token = data.token;
            window.currentUser = data.user;
            
            showToast('تم تسجيل الدخول بنجاح');
            
            // تهيئة الإشعارات
            await Notifications.init();
            
            // عرض لوحة التحكم
            renderDashboardPage();
        } else {
            showToast(data.message || 'فشل تسجيل الدخول', true);
        }
    },
    
    // تسجيل مستخدم جديد
    handleRegister: async function() {
        const username = document.getElementById('regUsername')?.value.trim();
        const email = document.getElementById('regEmail')?.value.trim();
        const phone = document.getElementById('regPhone')?.value.trim();
        const password = document.getElementById('regPassword')?.value;
        const confirm = document.getElementById('regConfirmPassword')?.value;
        const department = document.getElementById('regDepartment')?.value;
        const academicYear = document.getElementById('regYear')?.value;
        
        // التحقق من البيانات
        if (!username || !email || !phone || !password || !department || !academicYear) {
            showToast('جميع الحقول مطلوبة', true);
            return;
        }
        
        if (password !== confirm) {
            showToast('كلمة المرور غير متطابقة', true);
            return;
        }
        
        if (password.length < 6) {
            showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', true);
            return;
        }
        
        const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
        if (!emailRegex.test(email)) {
            showToast('البريد الإلكتروني غير صالح', true);
            return;
        }
        
        const phoneRegex = /^[0-9]{8,15}$/;
        if (!phoneRegex.test(phone)) {
            showToast('رقم الهاتف يجب أن يكون 8-15 رقم فقط', true);
            return;
        }
        
        showLoading(true);
        const data = await fetchAPI('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, phone, password, department, academicYear })
        });
        showLoading(false);
        
        if (data.status) {
            showToast('تم إنشاء الحساب بنجاح، يمكنك تسجيل الدخول');
            // تبديل إلى تبويب تسجيل الدخول
            const loginTab = document.querySelector('.tab-btn[data-tab="login"]');
            if (loginTab) loginTab.click();
            document.getElementById('loginUsername').value = username;
        } else {
            showToast(data.message || 'فشل إنشاء الحساب', true);
        }
    },
    
    // تسجيل الخروج
    logout: function() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.token = null;
        window.currentUser = null;
        showToast('تم تسجيل الخروج');
        // إعادة تحميل الصفحة لتصفير الحالة
        window.location.reload();
    },
    
    // التحقق من حالة المستخدم
    isAuthenticated: function() {
        const token = localStorage.getItem('token');
        const user = localStorage.getItem('user');
        return !!(token && user);
    },
    
    // الحصول على المستخدم الحالي
    getCurrentUser: function() {
        const userStr = localStorage.getItem('user');
        return userStr ? JSON.parse(userStr) : null;
    },
    
    // تحديث بيانات المستخدم
    updateUserData: async function() {
        const data = await fetchAPI('/auth/profile');
        if (data.status && data.user) {
            localStorage.setItem('user', JSON.stringify(data.user));
            window.currentUser = data.user;
            return data.user;
        }
        return null;
    }
};