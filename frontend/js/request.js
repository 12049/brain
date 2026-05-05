/**
 * BrainCode Support System - Request Module
 * إدارة إنشاء الطلبات وخيارات الخدمات
 */

import { fetchAPI } from './main.js';
import { showToast, showLoading, closeModal } from './ui.js';
import { Dashboard } from './dashboard.js';

export const RequestManager = {
    // إظهار نموذج اختيار نوع الخدمة
    showServiceModal: function() {
        const modalHtml = `
            <div class="modal-overlay" id="serviceModal">
                <div class="modal-content">
                    <h3><i class="fas fa-cog"></i> اختر نوع الخدمة</h3>
                    <button class="service-option" data-type="maintenance">
                        <i class="fas fa-tools"></i> صيانة
                    </button>
                    <button class="service-option" data-type="programming">
                        <i class="fas fa-code"></i> برمجة
                    </button>
                    <button class="btn-secondary close-modal">إلغاء</button>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.querySelectorAll('.service-option').forEach(btn => {
            btn.onclick = () => {
                const modal = document.getElementById('serviceModal');
                modal.remove();
                this.showRequestForm(btn.dataset.type);
            };
        });
        
        document.querySelector('.close-modal').onclick = () => {
            document.getElementById('serviceModal').remove();
        };
    },
    
    // إظهار نموذج إنشاء الطلب
    showRequestForm: function(serviceType) {
        const subServices = serviceType === 'maintenance' 
            ? ['مكافحة فيروسات', 'تثبيت برنامج', 'تثبيت نظام', 'حل مشكلة لابتوب', 'غير ذلك']
            : ['تطوير موقع', 'تطوير تطبيق', 'حل مشكلة برمجية', 'قاعدة بيانات', 'تصحيح أخطاء', 'غير ذلك'];
        
        const modalHtml = `
            <div class="modal-overlay" id="requestModal">
                <div class="modal-content request-form">
                    <h3><i class="fas ${serviceType === 'maintenance' ? 'fa-tools' : 'fa-code'}"></i> 
                        طلب ${serviceType === 'maintenance' ? 'صيانة' : 'برمجة'}
                    </h3>
                    <select id="subServiceSelect" class="select-field">
                        <option value="">اختر الخدمة المطلوبة</option>
                        ${subServices.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                    <textarea id="detailsInput" class="textarea-field" 
                        placeholder="اكتب تفاصيل الطلب هنا...&#10;مثال: نوع المشكلة، التفاصيل التقنية، المواصفات..." 
                        rows="5"></textarea>
                    <div class="modal-buttons">
                        <button class="btn-primary" id="submitRequestBtn">إرسال الطلب</button>
                        <button class="btn-secondary close-modal">إلغاء</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        document.getElementById('submitRequestBtn').onclick = async () => {
            await this.submitRequest(serviceType);
        };
        
        document.querySelector('.close-modal').onclick = () => {
            document.getElementById('requestModal').remove();
        };
    },
    
    // إرسال الطلب
    submitRequest: async function(serviceType) {
        const subService = document.getElementById('subServiceSelect')?.value;
        const details = document.getElementById('detailsInput')?.value.trim();
        
        if (!subService) {
            showToast('يرجى اختيار الخدمة المطلوبة', true);
            return;
        }
        
        if (!details) {
            showToast('يرجى كتابة تفاصيل الطلب', true);
            return;
        }
        
        if (details.length < 10) {
            showToast('يرجى كتابة تفاصيل أكثر عن المشكلة (10 أحرف على الأقل)', true);
            return;
        }
        
        showLoading(true);
        const data = await fetchAPI('/requests/create', {
            method: 'POST',
            body: JSON.stringify({ serviceType, subService, details })
        });
        showLoading(false);
        
        const modal = document.getElementById('requestModal');
        if (modal) modal.remove();
        
        if (data.status) {
            showToast('✅ تم إرسال الطلب بنجاح، سيتم التواصل معك قريباً');
            Dashboard.refresh();
        } else {
            showToast(data.message || 'فشل إرسال الطلب', true);
        }
    }
};