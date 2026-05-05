/**
 * BrainCode Support System - UI Module
 * دوال مساعدة للواجهة وإظهار التنبيهات والتحميل
 */

// ========== Toast Notifications ==========
let toastTimeout = null;

export function showToast(message, isError = false, duration = 3000) {
    let toast = document.getElementById('toast');
    
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.classList.remove('error', 'success');
    
    if (isError) {
        toast.classList.add('error');
    } else {
        toast.classList.add('success');
    }
    
    toast.classList.add('show');
    
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// ========== Loading Overlay ==========
let loadingOverlay = null;

export function showLoading(show = true) {
    if (!loadingOverlay) {
        loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loadingOverlay';
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = `
            <div class="loading-spinner">
                <i class="fas fa-spinner fa-pulse fa-3x"></i>
                <p>جاري التحميل...</p>
            </div>
        `;
        document.body.appendChild(loadingOverlay);
    }
    
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

// ========== Modal Helpers ==========
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        modal.remove();
    }
}

export function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.remove();
    });
    document.body.style.overflow = '';
}

// ========== Form Validation ==========
export const Validators = {
    required: (value, fieldName = 'هذا الحقل') => {
        if (!value || value.toString().trim() === '') {
            return `${fieldName} مطلوب`;
        }
        return null;
    },
    
    minLength: (value, min, fieldName = 'هذا الحقل') => {
        if (value && value.length < min) {
            return `${fieldName} يجب أن يكون ${min} أحرف على الأقل`;
        }
        return null;
    },
    
    maxLength: (value, max, fieldName = 'هذا الحقل') => {
        if (value && value.length > max) {
            return `${fieldName} يجب أن لا يتجاوز ${max} حرف`;
        }
        return null;
    },
    
    email: (value) => {
        const emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/;
        if (value && !emailRegex.test(value)) {
            return 'البريد الإلكتروني غير صالح';
        }
        return null;
    },
    
    phone: (value) => {
        const phoneRegex = /^[0-9]{8,15}$/;
        if (value && !phoneRegex.test(value)) {
            return 'رقم الهاتف يجب أن يكون 8-15 رقم فقط';
        }
        return null;
    },
    
    password: (value) => {
        if (value && value.length < 6) {
            return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
        }
        return null;
    },
    
    passwordMatch: (password, confirm) => {
        if (password !== confirm) {
            return 'كلمة المرور غير متطابقة';
        }
        return null;
    }
};

export function validateForm(formData, rules) {
    const errors = {};
    
    for (const [field, value] of Object.entries(formData)) {
        const fieldRules = rules[field];
        if (fieldRules) {
            for (const rule of fieldRules) {
                const error = rule(value);
                if (error) {
                    errors[field] = error;
                    break;
                }
            }
        }
    }
    
    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

// ========== Confirmation Dialog ==========
export function confirmDialog(message, onConfirm, onCancel = null) {
    const modalHtml = `
        <div class="modal-overlay" id="confirmModal">
            <div class="modal-content" style="max-width: 320px;">
                <i class="fas fa-question-circle" style="font-size: 48px; color: var(--warning); margin-bottom: 16px;"></i>
                <p style="margin-bottom: 24px;">${message}</p>
                <div class="modal-buttons">
                    <button class="btn-primary" id="confirmBtn">تأكيد</button>
                    <button class="btn-secondary" id="cancelBtn">إلغاء</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    document.getElementById('confirmBtn').onclick = () => {
        closeModal('confirmModal');
        if (onConfirm) onConfirm();
    };
    
    document.getElementById('cancelBtn').onclick = () => {
        closeModal('confirmModal');
        if (onCancel) onCancel();
    };
}

// ========== Scroll to Top ==========
export function scrollToTop(smooth = true) {
    window.scrollTo({
        top: 0,
        behavior: smooth ? 'smooth' : 'auto'
    });
}

// ========== Copy to Clipboard ==========
export async function copyToClipboard(text, successMessage = 'تم النسخ') {
    try {
        await navigator.clipboard.writeText(text);
        showToast(successMessage);
        return true;
    } catch (error) {
        showToast('فشل النسخ', true);
        return false;
    }
}