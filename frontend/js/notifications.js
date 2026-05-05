/**
 * BrainCode Support System - Notifications Module
 * إدارة إشعارات المتصفح وخدمة Web Push
 */

import { fetchAPI, currentUser } from './main.js';
import { showToast } from './ui.js';

export const Notifications = {
    swRegistration: null,
    isSupported: false,
    vapidPublicKey: 'BCv6xXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxXxX',
    
    // التحقق من دعم الإشعارات
    isSupported: function() {
        return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    },
    
    // تهيئة الإشعارات
    init: async function() {
        if (!this.isSupported()) {
            console.log('المتصفح لا يدعم الإشعارات');
            return false;
        }
        
        if (Notification.permission === 'granted') {
            await this.registerServiceWorker();
            await this.subscribePush();
            return true;
        }
        
        if (Notification.permission !== 'denied' && currentUser) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                await this.registerServiceWorker();
                await this.subscribePush();
                showToast('✅ تم تفعيل الإشعارات بنجاح');
                return true;
            }
        }
        
        return false;
    },
    
    // طلب صلاحية الإشعارات يدوياً
    requestPermission: async function() {
        if (!this.isSupported()) {
            showToast('المتصفح لا يدعم الإشعارات', true);
            return false;
        }
        
        if (Notification.permission === 'granted') {
            showToast('الإشعارات مفعلة بالفعل');
            return true;
        }
        
        if (Notification.permission === 'denied') {
            showToast('الرجاء تفعيل الإشعارات من إعدادات المتصفح', true);
            return false;
        }
        
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            await this.registerServiceWorker();
            await this.subscribePush();
            showToast('✅ تم تفعيل الإشعارات');
            
            // إخفاء البانر
            const banner = document.getElementById('notifBanner');
            if (banner) banner.style.display = 'none';
            
            return true;
        } else {
            showToast('تم رفض الإشعارات، يمكنك تفعيلها لاحقاً من الإعدادات', true);
            return false;
        }
    },
    
    // تسجيل Service Worker
    registerServiceWorker: async function() {
        try {
            this.swRegistration = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered');
            return this.swRegistration;
        } catch (error) {
            console.error('Service Worker registration failed:', error);
            return null;
        }
    },
    
    // الاشتراك في Push Notifications
    subscribePush: async function() {
        if (!this.swRegistration) return false;
        if (!currentUser) return false;
        
        try {
            const existingSubscription = await this.swRegistration.pushManager.getSubscription();
            if (existingSubscription) {
                return true;
            }
            
            const subscription = await this.swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey)
            });
            
            // حفظ الاشتراك في الخادم
            const data = await fetchAPI('/auth/subscribe', {
                method: 'POST',
                body: JSON.stringify({ subscription })
            });
            
            return data.status;
        } catch (error) {
            console.error('Push subscription error:', error);
            return false;
        }
    },
    
    // إلغاء الاشتراك
    unsubscribePush: async function() {
        if (!this.swRegistration) return false;
        
        try {
            const subscription = await this.swRegistration.pushManager.getSubscription();
            if (subscription) {
                await subscription.unsubscribe();
                
                // إزالة من الخادم
                await fetchAPI('/auth/unsubscribe', { method: 'POST' });
            }
            return true;
        } catch (error) {
            console.error('Unsubscribe error:', error);
            return false;
        }
    },
    
    // إرسال إشعار فوري
    sendNotification: function(title, body, icon = '/favicon.ico') {
        if (!this.swRegistration) return false;
        
        this.swRegistration.showNotification(title, {
            body: body,
            icon: icon,
            badge: icon,
            vibrate: [200, 100, 200],
            timestamp: Date.now(),
            data: {
                url: window.location.href
            }
        });
    },
    
    // تحويل مفتاح VAPID من base64 إلى Uint8Array
    urlBase64ToUint8Array: function(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }
};