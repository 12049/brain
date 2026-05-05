/**
 * BrainCode Support System - Dashboard Module
 * عرض لوحة التحكم والطلبات والإحصائيات
 */

import { fetchAPI, currentUser, renderLoginPage } from './main.js';
import { showToast, showLoading } from './ui.js';
import { RequestManager } from './request.js';
import { Notifications } from './notifications.js';
import { Auth } from './auth.js';

export const Dashboard = {
    // متغيرات محلية
    requests: [],
    stats: { pending: 0, accepted: 0, finished: 0 },
    
    // عرض لوحة التحكم
    render: async function() {
        showLoading(true);
        
        // جلب البيانات
        const [profileData, requestsData] = await Promise.all([
            fetchAPI('/auth/profile'),
            fetchAPI('/requests/my')
        ]);
        
        showLoading(false);
        
        const user = profileData.user || currentUser;
        this.requests = requestsData.requests || [];
        
        // حساب الإحصائيات
        this.stats = {
            pending: this.requests.filter(r => r.status === 'pending').length,
            accepted: this.requests.filter(r => r.status === 'accepted').length,
            finished: this.requests.filter(r => r.status === 'finished').length
        };
        
        const app = document.getElementById('app');
        app.innerHTML = `
            <div class="header">
                <div class="logo small"><i class="fas fa-brain"></i></div>
                <div class="user-info">
                    <h2>مرحباً ${this.escapeHtml(user.username)}</h2>
                    <p class="user-role">${this.getRoleText(user.role)}</p>
                </div>
                <button class="logout-btn" id="logoutBtn"><i class="fas fa-sign-out-alt"></i></button>
            </div>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-number ${this.stats.pending > 0 ? 'pending' : ''}">${this.stats.pending}</div>
                    <div class="stat-label">قيد الانتظار</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number accepted">${this.stats.accepted}</div>
                    <div class="stat-label">تم القبول</div>
                </div>
                <div class="stat-card">
                    <div class="stat-number finished">${this.stats.finished}</div>
                    <div class="stat-label">تم الإنجاز</div>
                </div>
            </div>
            
            <div class="notification-banner" id="notifBanner" style="display:${Notifications.isSupported() ? 'flex' : 'none'}">
                <span><i class="fas fa-bell"></i> فعّل الإشعارات لتصلك تحديثات طلباتك</span>
                <button id="enableNotifBtn" class="btn-small">تفعيل</button>
            </div>
            
            <button class="btn btn-primary" id="newRequestBtn"><i class="fas fa-plus"></i> طلب خدمة جديدة</button>
            
            <div class="section-title"><i class="fas fa-list"></i> طلباتي</div>
            <div id="requestsList" class="requests-list">
                ${this.renderRequestsList()}
            </div>
        `;
        
        // ربط الأحداث
        document.getElementById('logoutBtn').onclick = () => Auth.logout();
        document.getElementById('newRequestBtn').onclick = () => RequestManager.showServiceModal();
        
        const enableNotifBtn = document.getElementById('enableNotifBtn');
        if (enableNotifBtn) {
            enableNotifBtn.onclick = () => Notifications.requestPermission();
        }
        
        // ربط التقييمات
        this.bindRatingEvents();
    },
    
    // عرض قائمة الطلبات
    renderRequestsList: function() {
        if (this.requests.length === 0) {
            return `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <p>لا توجد طلبات حالياً</p>
                    <p class="empty-sub">اضغط على "طلب خدمة جديدة" لإنشاء أول طلب</p>
                </div>
            `;
        }
        
        return this.requests.map(request => `
            <div class="request-card status-${request.status}" data-request-id="${request.id}">
                <div class="request-header">
                    <span class="request-type">
                        <i class="fas ${request.serviceType === 'maintenance' ? 'fa-tools' : 'fa-code'}"></i>
                        ${request.serviceType === 'maintenance' ? 'صيانة' : 'برمجة'}
                    </span>
                    <span class="request-status ${request.status}">
                        ${this.getStatusText(request.status)}
                    </span>
                </div>
                <div class="request-service"><strong>${this.escapeHtml(request.subService)}</strong></div>
                <div class="request-details">${this.truncate(this.escapeHtml(request.details), 120)}</div>
                ${request.assignedTo ? `
                    <div class="request-assigned">
                        <i class="fas fa-user-cog"></i> التقني: ${this.escapeHtml(request.assignedTo)}
                    </div>
                ` : ''}
                <div class="request-date">
                    <i class="fas fa-calendar"></i> ${this.formatDate(request.createdAt)}
                </div>
                ${request.status === 'finished' && !request.rating ? `
                    <div class="rating-section">
                        <label>تقييم الخدمة:</label>
                        <div class="stars" data-request-id="${request.id}">
                            ${[1, 2, 3, 4, 5].map(s => `<i class="far fa-star" data-rating="${s}"></i>`).join('')}
                        </div>
                    </div>
                ` : request.rating ? `
                    <div class="request-rating">
                        <i class="fas fa-star"></i> تقييمك: ${request.rating}/5
                    </div>
                ` : ''}
            </div>
        `).join('');
    },
    
    // ربط أحداث التقييم
    bindRatingEvents: function() {
        document.querySelectorAll('.stars').forEach(starContainer => {
            const requestId = starContainer.dataset.requestId;
            const stars = starContainer.querySelectorAll('i');
            
            stars.forEach(star => {
                star.onclick = async () => {
                    const rating = parseInt(star.dataset.rating);
                    showLoading(true);
                    const data = await fetchAPI('/requests/rate', {
                        method: 'POST',
                        body: JSON.stringify({ requestId, rating })
                    });
                    showLoading(false);
                    
                    if (data.status) {
                        showToast('شكراً لتقييمك');
                        this.render();
                    } else {
                        showToast(data.message || 'فشل التقييم', true);
                    }
                };
                
                star.onmouseover = () => {
                    const val = parseInt(star.dataset.rating);
                    stars.forEach((s, i) => {
                        if (i < val) s.className = 'fas fa-star';
                        else s.className = 'far fa-star';
                    });
                };
                
                star.onmouseout = () => {
                    stars.forEach(s => s.className = 'far fa-star');
                };
            });
        });
    },
    
    // تحديث لوحة التحكم
    refresh: async function() {
        await this.render();
    },
    
    // دوال مساعدة
    getRoleText: function(role) {
        const roles = {
            'student': 'طالب',
            'technician': 'تقني',
            'admin': 'مدير'
        };
        return roles[role] || role;
    },
    
    getStatusText: function(status) {
        const statuses = {
            'pending': 'قيد الانتظار',
            'accepted': 'تم القبول',
            'finished': 'تم الإنجاز'
        };
        return statuses[status] || status;
    },
    
    formatDate: function(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ar-EG', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    truncate: function(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    },
    
    escapeHtml: function(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};