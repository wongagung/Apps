# 📱 AirCast Pro Mobile (Android APK & iOS IPA / PWA)

Panduan lengkap instalasi aplikasi mobile transmitter **AirCast Pro** untuk Android dan iPhone/iPad (iOS).

---

## ⚡ 1. Metode Instan (PWA Standalone - Sangat Direkomendasikan)
Metode ini **tidak memerlukan Android Studio, Xcode, sertifikat Apple Developer, ataupun sideloading**. Aplikasi akan langsung terpasang di layar utama HP dengan ikon resmi dan berjalan **100% Fullscreen tanpa address bar browser**.

### 🍏 Untuk iPhone / iPad (iOS):
1. Buka browser **Safari** di iPhone, lalu scan QR Code atau buka tautan AirCast Pro (contoh: `https://192.168.18.242:8443`).
2. Jika muncul sertifikat lokal: Tap **Tampilkan Detail** ➔ **Kunjungi Situs Ini**.
3. Di bagian bawah Safari, tap tombol **Bagikan (Ikon Kotak dengan Panah ke Atas: ↑)**.
4. Gulir ke bawah lalu pilih **"Tambahkan ke Layar Utama" (Add to Home Screen)**.
5. Tap **Tambah** di pojok kanan atas.
6. 🎉 **Selesai!** Ikon **AirCast Pro** akan muncul di Home Screen iPhone kamu. Saat dibuka, aplikasi langsung berjalan *Standalone Full Screen* seperti aplikasi App Store!

### 🤖 Untuk Android:
1. Buka **Google Chrome** di Android, lalu scan QR Code dari PC.
2. Tap titik tiga di pojok kanan atas Chrome.
3. Pilih **"Instal Aplikasi"** atau **"Tambahkan ke Layar Utama"**.
4. Ikon aplikasi native akan langsung terpasang di App Drawer dan Layar Utama HP kamu.

---

## 🤖 2. Source Code Native Android APK (`mobile-app/android`)
Proyek ini berisi kode sumber aplikasi Android native lengkap dengan `WebView` terakselerasi hardware, auto-grant izin WebRTC, dan penanganan sertifikat TLS lokal.

### Cara Build APK Sendiri (Lokal):
1. Buka folder `mobile-app/android` menggunakan **Android Studio**.
2. Tunggu Gradle Sync selesai.
3. Klik menu **Build** ➔ **Build Bundle(s) / APK(s)** ➔ **Build APK(s)**.
4. File output `app-debug.apk` akan siap di:
   `mobile-app/android/app/build/outputs/apk/debug/app-debug.apk`.
5. Pindahkan file `.apk` ke HP Android dan langsung pasang (Install).

---

## ☁️ 3. Build Otomatis di Cloud (GitHub Actions CI/CD)
Proyek ini sudah dilengkapi file workflow otomatis di [`.github/workflows/build-mobile.yml`](../.github/workflows/build-mobile.yml).

Setiap kali kamu melakukan `git push` ke GitHub:
1. GitHub Actions akan menjalankan mesin virtual **Ubuntu** untuk meng-compile **Android APK**.
2. GitHub Actions akan menjalankan mesin virtual **macOS** dengan **Xcode** untuk mem-package **iOS IPA**.
3. Hasil file `.apk` dan `.ipa` dapat langsung kamu download di tab **Actions ➔ Artifacts** di repositori GitHub kamu!

---

## 💡 Mengapa iOS Memerlukan PWA atau Akun Apple Developer?
Sistem keamanan Apple (iOS) **melarang** instalasi file `.ipa` secara sembarangan di luar App Store tanpa penandatanganan sertifikat (*Code Signing*). 
- Jika ingin memasang file `.ipa` mentah, pengguna memerlukan Mac + Xcode atau aplikasi sideloading seperti **AltStore**, **Sideloadly**, atau **TrollStore**.
- Oleh karena itu, pendekatan **PWA Standalone** adalah metode resmi standar industri (seperti yang digunakan GeForce NOW dan Xbox Cloud Gaming di iOS) yang memberikan pengalaman native penuh tanpa batasan penandatanganan sertifikat 7 hari.

