/**
 * BrainCode Support System - Main Application File
 * الإدارة الرئيسية للتطبيق والتحكم بين الصفحات
 */

import { Auth } from './auth.js';
import { Dashboard } from './dashboard.js';
import { RequestManager } from './request.js';
import { Notifications } from './notifications.js';
import { UI, showToast, showLoading } from './ui.js';

// ========== Application State ==========
export let currentUser = null;
export let token = localStorage.getItem('token');
let currentPage = 'login';

// ========== API Configuration ==========
export const API_BASE = window.location.origin + '/api';

// ========== Helper Functions ==========
export async function fetchAPI(endpoint, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
        }
    };
    
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, { ...defaultOptions, ...options });
        const data = await res.json();
        
        // التحقق من صلاحية التوكن
        if (!data.status && (data.message === 'توكن غير صالح' || data.message === 'انتهت صلاحية التوكن')) {
            logout();
            showToast('انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى', true);
        }
        
        return data;
    } catch (error) {
        console.error('API Error:', error);
        showToast('خطأ في الاتصال بالخادم', true);
        return { status: false, message: error.message };
    }
}

// ========== Logout Function ==========
export function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    token = null;
    currentUser = null;
    renderLoginPage();
    showToast('تم تسجيل الخروج');
}

// ========== Page Rendering Functions ==========
export function renderLoginPage() {
    currentPage = 'login';
    const app = document.getElementById('app');
    
    app.innerHTML = `
        <div class="header">
            <div class="logo"><i class="fas fa-brain"></i></div>
            <h1>BrainCode</h1>
            <p class="subtitle">نظام الدعم التقني</p>
            <p class="tagline"><i class="fas fa-code"></i> THE MIND CODES TOMORROW</p>
        </div>
        
        <div class="tabs">
            <button class="tab-btn active" data-tab="login">تسجيل دخول</button>
            <button class="tab-btn" data-tab="register">حساب جديد</button>
        </div>
        
        <div id="loginForm" class="form-card">
            <div class="input-group">
                <i class="fas fa-user"></i>
                <input type="text" id="loginUsername" placeholder="اسم المستخدم أو البريد الإلكتروني">
            </div>
            <div class="input-group">
                <i class="fas fa-lock"></i>
                <input type="password" id="loginPassword" placeholder="كلمة المرور">
            </div>
            <button class="btn btn-primary" id="doLoginBtn"><i class="fas fa-arrow-left"></i> دخول</button>
        </div>
        
        <div id="registerForm" class="form-card" style="display:none">
            <div class="input-group">
                <i class="fas fa-user"></i>
                <input type="text" id="regUsername" placeholder="اسم المستخدم">
            </div>
            <div class="input-group">
                <i class="fas fa-envelope"></i>
                <input type="email" id="regEmail" placeholder="البريد الإلكتروني">
            </div>
            <div class="input-group">
                <i class="fas fa-phone"></i>
                <input type="tel" id="regPhone" placeholder="رقم الهاتف">
            </div>
            <div class="input-group">
                <i class="fas fa-lock"></i>
                <input type="password" id="regPassword" placeholder="كلمة المرور">
            </div>
            <div class="input-group">
                <i class="fas fa-check-circle"></i>
                <input type="password" id="regConfirmPassword" placeholder="تأكيد كلمة المرور">
            </div>
            <select id="regDepartment" class="select-field">
                <option value="">القسم</option>
                <option>ميكاترونيكس</option>
                <option>اتصالات</option>
                <option>حواسيب</option>
                <option>الكترون</option>
                <option>قيادة</option>
                <option>تحكم</option>
                <option>نظم قدرة</option>
            </select>
            <select id="regYear" class="select-field">
                <option value="">السنة الدراسية</option>
                <option>سنة أولى</option>
                <option>سنة ثانية</option>
                <option>سنة ثالثة</option>
                <option>سنة رابعة</option>
                <option>سنة خامسة</option>
            </select>
            <button class="btn btn-primary" id="doRegisterBtn">إنشاء حساب <i class="fas fa-user-plus"></i></button>
        </div>
        
        <div class="info-section">
            <div class="info-card"><i class="fas fa-tools"></i><h3>الدعم التقني</h3><p>نقدم حلولاً سريعة لمشاكلك التقنية</p></div>
            <div class="info-card"><i class="fas fa-users"></i><h3>فريق متخصص</h3><p>تقنيون مؤهلون لحل جميع المشاكل</p></div>
            <div class="info-card"><i class="fas fa-clock"></i><h3>خدمة سريعة</h3><p>استجابة فورية لطلبات الدعم</p></div>
        </div>
    `;
    
    // ربط الأحداث
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
            document.getElementById('registerForm').style.display = tab === 'register' ? 'block' : 'none';
        };
    });
    
    document.getElementById('doLoginBtn').onclick = () => Auth.handleLogin();
    document.getElementById('doRegisterBtn').onclick = () => Auth.handleRegister();
}

export function renderDashboardPage() {
    currentPage = 'dashboard';
    Dashboard.render();
}

// ========== Initialize App ==========
export async function initApp() {
    // التحقق من وجود مستخدم مسجل
    const savedUser = localStorage.getItem('user');
    const savedToken = localStorage.getItem('token');
    
    if (savedToken && savedUser) {
        token = savedToken;
        currentUser = JSON.parse(savedUser);
        
        // التحقق من صلاحية التوكن
        const profile = await fetchAPI('/auth/profile');
        if (profile.status && profile.user) {
            currentUser = profile.user;
            renderDashboardPage();
            // تهيئة الإشعارات
            Notifications.init();
        } else {
            renderLoginPage();
        }
    } else {
        renderLoginPage();
    }
}

// بدء التطبيق عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', initApp);