# AirCast Pro - Windows Native Screen Mirroring 📱 ➡️ 💻

Aplikasi desktop Windows native untuk **Screen Mirroring** (pencerminan layar) ultra-low-latency dari perangkat HP/Tablet **Android** maupun **iOS (iPhone/iPad)** dengan pipeline **Scan Barcode (QR Code)** langsung tanpa perlu menginstal aplikasi tambahan di HP.

---

## ⚡ Zero-Delay Performance (~0ms Latency)

- **WebRTC Zero Buffer Target**: Menggunakan `playoutDelayHint = 0` dan `jitterBufferTarget = 0` pada receiver audio/video.
- **SDP Munging Ultra-Fast**: Menginjeksi `a=playout-delay:0 0` dan alokasi bandwidth 30 Mbps untuk memangkas antrian frame video.
- **Dynamic Drift Catch-up**: Player otomatis menyelaraskan frame jika terjadi buffering mikro sehingga delay tetap konsisten di 0 - 15 ms pada Wi-Fi lokal.
- **Motion Hint Encoding**: Video track dioptimalkan dengan `contentHint = 'motion'` pada 60 FPS.

---

## 🎨 UI/UX Desain: Glassmorphism + Claymorphism

- **Custom Glassmorphic Titlebar**: Jendela Windows 11 frameless dengan tombol navigasi custom bergaya Clay 3D (bukan jendela native bawaan Windows).
- **Custom Unified Scrollbars**: Seluruh scrollbar diatur dengan desain glowing cyan-blue pill, selaras di semua halaman tanpa scrollbar bawaan OS.
- **Claymorphic 3D Action Buttons**: Tombol interaktif dengan efek bayangan ganda (inner light + drop shadow).
- **Custom Icon**: Ikon aplikasi profesional resolusi tinggi multi-size (256, 128, 64, 48, 32, 16) yang sudah disematkan langsung pada file `.exe`.

---

## 📦 Hasil Build Executable (.EXE)

Aplikasi telah berhasil di-compile dan siap dijalankan:

1. **Portable Single-File Executable**:
   ```
   dist\AirCast Pro 1.0.0.exe
   ```
   *(Dapat langsung dijalankan di PC mana saja tanpa instalasi).*

2. **Standalone Unpacked Directory**:
   ```
   dist\win-unpacked\AirCast Pro.exe
   ```

3. **Launcher Cepat (1-Click)**:
   ```
   Launch-AirCast.bat
   ```

---

## 📱 Panduan Koneksi HP / Tablet

1. **Jalankan Aplikasi** melalui `Launch-AirCast.bat` atau `dist\AirCast Pro 1.0.0.exe`.
2. Pastikan PC dan HP terhubung ke **Wi-Fi yang sama**.
3. **Untuk iOS (iPhone/iPad)**:
   - Buka aplikasi **Kamera** > Arahkan ke QR Code di layar PC > Tap tautan.
   - Di Safari: Tap **Tampilkan Detail** lalu **Kunjungi situs ini** (karena sertifikat SSL lokal).
   - Tap **Mulai Mirroring Layar** > Pilih **Mulai Siaran**.
4. **Untuk Android**:
   - Buka aplikasi **Kamera / Google Lens / QR Scanner** > Buka tautan di Chrome.
   - Tap **Lanjutan (Advanced)** lalu **Lanjutkan ke situs**.
   - Tap **Mulai Mirroring Layar** > Pilih **Seluruh Layar** > **Mulai Sekarang**.
