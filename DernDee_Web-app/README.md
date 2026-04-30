# Derndee - Health Tech Platform

Derndee เป็นแพลตฟอร์ม Health Tech ที่ปฏิวัติการทำกายภาพบำบัดการเดิน โดยใช้ระบบอุปกรณ์สวมใส่ (Wearable Sensors) ร่วมกับปัญญาประดิษฐ์ (AI) เพื่อมอบประสบการณ์การฟื้นฟูที่แม่นยำและสามารถทำได้จากที่บ้าน

## 🚀 ระบบประกอบด้วย

### 1. ฝ่ายฮาร์ดแวร์ (Hardware)
- **สมองกลหลัก**: ESP32-C3 สำหรับประมวลผล Sensor Fusion
- **เซ็นเซอร์**: 9-axis ICM-20948 ในรูปแบบ Quaternion
- **การเชื่อมต่อ**: Bluetooth Low Energy (BLE) เพื่อประหยัดแบตเตอรี่
- **ตำแหน่งติดตั้ง**: อก, ต้นขาซ้าย, ต้นขาขวา, ข้อเท้าซ้าย, ข้อเท้าขวา

### 2. ฝ่ายปัญญาประดิษฐ์ (AI & Data Processing)
- **อัลกอริทึม**: Dynamic Time Warping (DTW)
- **ข้อมูล Input**: ข้อมูลการหมุน (Quaternion) จากอุปกรณ์
- **การเปรียบเทียบ**: ท่าเดินของผู้ใช้กับคลังข้อมูลท่าเดินต้นแบบ (Gait Library)
- **การวินิจฉัย**: แยกแยะท่าที่ "ถูก" (Golden Template) และ "ผิด" (Error Templates)

### 3. ฝ่ายซอฟต์แวร์ (Software & Technology Stack)
- **Frontend**: React Native (JavaScript/TypeScript)
- **Backend**: Firebase
- **สถาปัตยกรรม**: Hybrid Processing
  - **On-Device**: ประมวลผล Real-time (Avatar, AI)
  - **Server-Side**: คลังข้อมูล, จัดการบัญชี, รายงานสำหรับนักกายภาพบำบัด

## 🛠️ การติดตั้งและรันโปรเจค

### Prerequisites
- Node.js (v16 หรือสูงกว่า)
- npm หรือ yarn
- Firebase project

### ขั้นตอนการติดตั้ง

1. **Clone โปรเจค**
```bash
git clone <repository-url>
cd Database
```

2. **ติดตั้ง Dependencies**
```bash
npm install
```

3. **ตั้งค่า Firebase**
   - สร้าง Firebase project ใหม่
   - เปิดใช้งาน Authentication และ Firestore
   - เปิดใช้งาน Google Sign-in ใน Authentication
   - แก้ไขไฟล์ `src/firebase.js` ด้วย Firebase config ของคุณ

4. **รันโปรเจค**
```bash
npm run dev
```

5. **เปิดเบราว์เซอร์**
   - Patient app: `http://localhost:5174`
   - Clinic app: `http://localhost:5174/clinic/`
   - Gait dashboard: `http://localhost:5174/clinic/gait-dashboard/`

## 🔐 ระบบ Authentication

### Google Sign-in
- ใช้ Firebase Authentication
- รองรับ Google Sign-in
- สร้างโปรไฟล์ผู้ใช้ใหม่ใน Firestore อัตโนมัติ
- จัดเก็บข้อมูลกายภาพบำบัดสำหรับผู้ใช้แต่ละคน

### การจัดการผู้ใช้
- **ผู้ใช้ใหม่**: สร้างโปรไฟล์พร้อมข้อมูลกายภาพบำบัด
- **ผู้ใช้เก่า**: อัปเดตเวลาล็อกอินล่าสุด
- **ข้อมูลที่เก็บ**: UID, อีเมล, ชื่อ, รูปโปรไฟล์, เวลาสร้าง, เวลาล็อกอินล่าสุด

## 🎨 UI/UX Features

### Design System
- **สีหลัก**: สีเขียว (#4CAF50) และสีฟ้า (#2196F3)
- **Typography**: Inter font family
- **Layout**: Responsive design สำหรับทุกขนาดหน้าจอ
- **Animations**: Smooth transitions และ hover effects

### Components
- **Logo**: ไอคอนรูปคนพร้อมสัญลักษณ์ Wi-Fi
- **Social Login**: Google, Facebook, Apple (พร้อมใช้งาน)
- **Forms**: Input fields พร้อม validation
- **Cards**: Feature cards และ user info cards
- **Buttons**: Primary, secondary, และ action buttons

## 📱 หน้าจอหลัก

### 1. Welcome Page (/)
- Hero section พร้อมโลโก้และคำอธิบาย
- Features preview
- Action buttons สำหรับ Login และ Register

### 2. Login Page (/login)
- Social login options
- Traditional email/password login
- Validation และ error handling

### 3. Register Page (/register)
- Social sign-up options
- Email/password registration
- Password confirmation

### 4. Home Page (/home)
- User profile information
- Features overview
- Quick action buttons
- Responsive dashboard

## 🔧 การพัฒนา

### Project Structure
```
clinic/
├── index.html                  # Clinic React entry for clinician dashboard
└── gait-dashboard/
    ├── index.html              # Live gait visualization entry
    ├── main.js
    ├── data/
    ├── dsp/
    ├── styles/
    └── ui/

src/
├── apps/
│   ├── patient/
│   │   └── main.jsx            # Patient app route entry
│   └── clinic/
│       ├── main.jsx            # Clinic app route entry
│       ├── components/         # Doctor dashboard screens
│       └── data/               # Clinic mock data, to be replaced by Supabase
├── components/                 # Patient pages, games, and shared legacy screens
│   ├── Login.jsx
│   ├── Register.jsx
│   ├── Home.jsx
│   └── games/
├── context/
│   └── UserAuthContext.jsx
├── auth/
│   └── ProtectedRoute.jsx
├── firebase.js
└── index.css
```

### Key Features
- **Protected Routes**: การป้องกันเส้นทางที่ต้องล็อกอิน
- **Loading States**: แสดงสถานะการโหลดระหว่างการทำงาน
- **Error Handling**: จัดการข้อผิดพลาดและแสดงข้อความที่เหมาะสม
- **Responsive Design**: รองรับทุกขนาดหน้าจอ
- **Modern UI**: ใช้ CSS Grid, Flexbox, และ CSS Variables

## 🚀 การ Deploy

### Build สำหรับ Production
```bash
npm run build
```

### Deploy บน Vercel
```bash
npm run build
```

The current Vite build emits separate entries for the patient app, clinic app, and clinic gait dashboard. This is the first step toward mapping them to `app.derndee.com` and `clinic.derndee.com`.

## 🔮 Roadmap

### Phase 1: Authentication & Basic UI ✅
- [x] Google Sign-in
- [x] User profile management
- [x] Responsive design
- [x] Modern UI components

### Phase 2: Hardware Integration
- [ ] BLE device connection
- [ ] Sensor data processing
- [ ] Real-time data streaming

### Phase 3: AI Implementation
- [ ] DTW algorithm integration
- [ ] Gait analysis
- [ ] Real-time feedback

### Phase 4: Physical Therapy Features
- [ ] Session management
- [ ] Progress tracking
- [ ] Therapist dashboard

## 📞 ติดต่อ

สำหรับคำถามหรือการสนับสนุนเพิ่มเติม กรุณาติดต่อทีมพัฒนา Derndee

---

**หมายเหตุ**: โปรเจคนี้เป็นส่วนหนึ่งของระบบ Health Tech ที่กำลังพัฒนา โปรดติดตามการอัปเดตและฟีเจอร์ใหม่ๆ
