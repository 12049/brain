braincode-project/
├── index.js                    ← ملف التشغيل الرئيسي (API + Frontend معًا)
├── .env                        ← المتغيرات السرية
├── package.json                
├── vercel.json                 ← إعدادات Vercel
├── backend/
│   ├── routes/
│   │   ├── authRoutes.js
│   │   └── requestRoutes.js
│   ├── controllers/
│   │   ├── authController.js
│   │   └── requestController.js
│   ├── models/
│   │   ├── User.js
│   │   └── Request.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── errorHandler.js
│   └── utils/
│       └── db.js
└── frontend/                   ← الملفات الثابتة (HTML/CSS/JS)
    ├── index.html
    ├── css/
    │   └── style.css
    └── js/
        ├── main.js
        ├── auth.js
        ├── dashboard.js
        ├── request.js
        └── notifications.js