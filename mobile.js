// Mobile Client Screen Mirroring Transmitter
(function() {
  'use strict';

  // Parse URL Parameters
  const urlParams = new URLSearchParams(window.location.search);
  const sessionToken = urlParams.get('session') || '';
  const pin = urlParams.get('pin') || '';

  // DOM Elements
  const connStatus = document.getElementById('connStatus');
  const connStatusText = document.getElementById('connStatusText');
  const osIcon = document.getElementById('osIcon');
  const osTitle = document.getElementById('osTitle');
  const osSubtitle = document.getElementById('osSubtitle');
  const instructionText = document.getElementById('instructionText');

  const readyCard = document.getElementById('readyCard');
  const activeCard = document.getElementById('activeCard');
  const cameraFallbackCard = document.getElementById('cameraFallbackCard');

  const qualitySelect = document.getElementById('qualitySelect');
  const audioToggle = document.getElementById('audioToggle');
  const btnStartMirror = document.getElementById('btnStartMirror');
  const btnStopMirror = document.getElementById('btnStopMirror');
  const btnCameraMirror = document.getElementById('btnCameraMirror');

  const streamTimer = document.getElementById('streamTimer');
  const mobileFps = document.getElementById('mobileFps');
  const mobileRes = document.getElementById('mobileRes');

  const errorModal = document.getElementById('errorModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalMsg = document.getElementById('modalMsg');
  const btnModalClose = document.getElementById('btnModalClose');

  // WebRTC & Streaming State
  let ws = null;
  let peerConnection = null;
  let localStream = null;
  let timerInterval = null;
  let startTime = null;
  let deviceOS = 'unknown';
  let wakeLock = null;

  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('[WakeLock] Screen Wake Lock activated');
      } catch (err) {
        console.warn('[WakeLock] Request failed:', err);
      }
    }
  }

  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
      console.log('[WakeLock] Screen Wake Lock released');
    }
  }

  document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible' && localStream) {
      await requestWakeLock();
    }
  });

  function toggleOledDimmer(force) {
    const oledDimmerOverlay = document.getElementById('oledDimmerOverlay');
    if (!oledDimmerOverlay) return;
    if (typeof force === 'boolean') {
      oledDimmerOverlay.classList.toggle('hidden', !force);
    } else {
      oledDimmerOverlay.classList.toggle('hidden');
    }
  }

  // Initialize
  function init() {
    detectDevice();
    checkScreenShareSupport();
    setupEventListeners();
    setupPwaInstallation();
    connectWebSocket();
  }

  function setupPwaInstallation() {
    const pwaInstruction = document.getElementById('pwaInstruction');
    const btnPwaInstall = document.getElementById('btnPwaInstall');

    if (deviceOS === 'ios') {
      if (pwaInstruction) {
        pwaInstruction.textContent = 'iPhone/iPad: Tap tombol Bagikan (↑) di bawah Safari > Pilih "Tambahkan ke Layar Utama" (Bisa dibuka full screen layaknya aplikasi native)';
      }
    } else if (deviceOS === 'android') {
      if (pwaInstruction) {
        pwaInstruction.textContent = 'Android: Tap titik tiga di pojok Chrome > Pilih "Instal Aplikasi" / "Tambahkan ke Layar Utama"';
      }
    }

    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (btnPwaInstall) {
        btnPwaInstall.classList.remove('hidden');
        btnPwaInstall.onclick = async () => {
          if (deferredPrompt) {
            deferredPrompt.prompt();
            deferredPrompt = null;
          }
        };
      }
    });

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
          console.log('[SW] Registration skipped:', err);
        });
      });
    }
  }

  function detectDevice() {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);

    if (isIOS) {
      deviceOS = 'ios';
      osIcon.textContent = '🍏';
      osTitle.textContent = 'Perangkat Apple iOS Terdeteksi';
      osSubtitle.textContent = 'iPhone / iPad Screen Broadcast';
      instructionText.innerHTML = '1. Tap tombol <strong>"Mulai Mirroring Layar"</strong>.<br>2. Di menu pop-up iOS, pilih <strong>"Mulai Siaran"</strong> (Start Broadcast).';
    } else if (isAndroid) {
      deviceOS = 'android';
      osIcon.textContent = '🤖';
      osTitle.textContent = 'Perangkat Android Terdeteksi';
      osSubtitle.textContent = 'Android Screen Casting';
      instructionText.innerHTML = '1. Tap tombol <strong>"Mulai Mirroring Layar"</strong>.<br>2. Pilih <strong>"Seluruh Layar"</strong> &gt; Tekan <strong>"Mulai Sekarang"</strong>.';
    } else {
      deviceOS = 'other';
      osIcon.textContent = '📱';
      osTitle.textContent = 'Perangkat Mobile Terdeteksi';
      osSubtitle.textContent = 'Universal WebRTC Stream';
    }
  }

  function checkScreenShareSupport() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      cameraFallbackCard.style.display = 'block';
      instructionText.innerHTML = '⚠️ Browser ini membatasi rekam layar langsung. Gunakan <strong>Mirroring Kamera</strong> di bawah atau buka lewat Safari/Chrome terbaru.';
    }
  }

  function showModal(title, msg) {
    modalTitle.textContent = title;
    modalMsg.textContent = msg;
    errorModal.classList.add('show');
  }

  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/?role=mobile&session=${sessionToken}&pin=${pin}`;

    connStatusText.textContent = 'Menghubungkan...';
    connStatus.classList.remove('connected');

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[Mobile WS] Connected to PC');
      connStatusText.textContent = 'Terhubung ke PC';
      connStatus.classList.add('connected');

      // Send device info to desktop
      ws.send(JSON.stringify({
        type: 'device_info',
        info: {
          os: deviceOS,
          device: navigator.userAgent.includes('iPhone') ? 'iPhone' : 
                  (navigator.userAgent.includes('iPad') ? 'iPad' : 
                  (deviceOS === 'android' ? 'Android Device' : 'Mobile Browser')),
          userAgent: navigator.userAgent
        }
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleSignalingMessage(msg);
      } catch (err) {
        console.error('Error handling message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[Mobile WS] Connection closed');
      connStatusText.textContent = 'Terputus';
      connStatus.classList.remove('connected');
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
      console.error('[Mobile WS] Error:', err);
    };
  }

  async function handleSignalingMessage(msg) {
    switch (msg.type) {
      case 'answer':
        if (peerConnection) {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.answer));
        }
        break;

      case 'candidate':
        if (peerConnection && msg.candidate) {
          try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (e) {
            console.error('Error adding ICE candidate:', e);
          }
        }
        break;

      case 'control':
        if (msg.action === 'disconnect') {
          stopMirroring();
          showModal('Koneksi Selesai', 'PC telah menutup sesi screen mirroring.');
        }
        break;

      case 'pc_clipboard':
        handleReceivedClipboard(msg.text);
        break;

      case 'pc_file':
        handleReceivedFile(msg.file);
        break;

      case 'toggle_dimmer':
        toggleOledDimmer();
        break;

      case 'gamepad_input':
        // Gamepad inputs received from PC controller
        break;

      case 'error':
        showModal('Koneksi Ditolak', msg.message);
        break;
    }
  }

  function getStreamConstraints() {
    const quality = qualitySelect.value;
    const isLandscape = window.innerWidth > window.innerHeight;

    let targetW = 1920;
    let targetH = 1080;
    let frameRate = 60;

    if (quality === 'native4k') {
      targetW = 3840;
      targetH = 2160;
      frameRate = 60;
    } else if (quality === '2k120') {
      targetW = 2560;
      targetH = 1440;
      frameRate = 120;
    } else if (quality === '1080p120' || quality === '120fps') {
      targetW = 1920;
      targetH = 1080;
      frameRate = 120;
    } else if (quality === '1080p60' || quality === '1080p') {
      targetW = 1920;
      targetH = 1080;
      frameRate = 60;
    } else if (quality === '720p60') {
      targetW = 1280;
      targetH = 720;
      frameRate = 60;
    }

    let constraints;
    if (deviceOS === 'ios') {
      // WebKit Bug 263015: NEVER supply width/height/max constraints to getDisplayMedia on iOS Safari!
      // Passing resolution constraints causes WebKit to immediately collapse capture down to 220x480 thumbnail!
      // Passing { video: true } captures the FULL native Retina display resolution of the iPhone (e.g. 1170x2532)!
      constraints = {
        video: true
      };
    } else {
      // Android / Chrome
      const idealWidth = isLandscape ? targetW : targetH;
      const idealHeight = isLandscape ? targetH : targetW;
      constraints = {
        video: {
          width: { ideal: idealWidth },
          height: { ideal: idealHeight },
          frameRate: { ideal: frameRate }
        }
      };
      if (audioToggle.checked) {
        constraints.audio = true;
      }
    }

    return constraints;
  }

  async function startMirroring(useCamera = false) {
    try {
      const constraints = getStreamConstraints();

      if (useCamera) {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 } },
          audio: audioToggle.checked
        });
      } else {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
          throw new Error('Screen sharing API tidak didukung di browser ini.');
        }

        if (deviceOS === 'ios') {
          // Pure unconstrained native Retina capture on iOS (bypasses WebKit Bug 263015)
          localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        } else {
          // Android / Chrome: Multi-tier capture
          try {
            localStream = await navigator.mediaDevices.getDisplayMedia(constraints);
          } catch (constraintErr) {
            console.warn('[ScreenCapture] Tier 1 rejected, attempting Tier 2 (1080p Full HD)...', constraintErr);
            try {
              localStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                  width: { ideal: 1920 },
                  height: { ideal: 1080 },
                  frameRate: { ideal: 60 }
                }
              });
            } catch (tier2Err) {
              console.warn('[ScreenCapture] Tier 2 rejected, falling back to clean video...', tier2Err);
              localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            }
          }
        }
      }

      // Handle when user stops sharing via browser/system banner
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        // Enforce zero latency motion hint
        if ('contentHint' in videoTrack) {
          videoTrack.contentHint = 'motion';
        }

        videoTrack.onended = () => {
          stopMirroring();
        };

        // Poll track settings to catch dynamic WebKit resolution upgrade from initial placeholder
        const updateTrackSettings = () => {
          if (!videoTrack || videoTrack.readyState === 'ended') return;
          const settings = videoTrack.getSettings();
          if (settings.width && settings.height) {
            mobileRes.textContent = `${settings.width}x${settings.height}`;
          }
          if (settings.frameRate) {
            mobileFps.textContent = Math.round(settings.frameRate);
          }
        };

        updateTrackSettings();
        const settingsPoller = setInterval(updateTrackSettings, 1000);
        localStream.addEventListener('inactive', () => clearInterval(settingsPoller));
      }

      // Create WebRTC PeerConnection
      setupPeerConnection();

      // Switch UI
      readyCard.classList.add('hidden');
      activeCard.classList.remove('hidden');

      // Request Screen Wake Lock (Prevent phone from sleeping)
      requestWakeLock();

      // Start Timer
      startTime = Date.now();
      timerInterval = setInterval(updateTimer, 1000);

    } catch (err) {
      console.error('Failed to get media:', err);
      if (err.name !== 'NotAllowedError') {
        showModal('Izin Diperlukan', `Gagal mengakses layar: ${err.message}`);
      }
    }
  }

  function optimizeOfferSDP(sdp) {
    const lines = sdp.split('\r\n');
    const is120 = qualitySelect.value === '120fps' || qualitySelect.value === '2k120' || qualitySelect.value === '1080p120';
    const targetFps = is120 ? 120 : 60;

    // 1. Prioritize H.264 Hardware Acceleration over VP8/VP9
    const h264Pts = [];
    const rtxMap = {};
    let hasPlayoutExt = false;
    let maxExtId = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('a=rtpmap:')) {
        const parts = line.substring(9).split(' ');
        if (parts.length >= 2 && parts[1].includes('H264/90000')) {
          h264Pts.push(parts[0]);
        }
      } else if (line.startsWith('a=fmtp:')) {
        const parts = line.substring(7).split(' ');
        const pt = parts[0];
        if (parts.length > 1 && parts[1].includes('apt=')) {
          const params = parts[1].split(';');
          for (let j = 0; j < params.length; j++) {
            if (params[j].startsWith('apt=')) {
              rtxMap[pt] = params[j].split('=')[1];
            }
          }
        }
      } else if (line.startsWith('a=extmap:')) {
        if (line.includes('playout-delay')) {
          hasPlayoutExt = true;
        }
        try {
          const extId = parseInt(line.substring(9).split(' ')[0].split('/')[0], 10);
          if (extId > maxExtId && extId < 15) {
            maxExtId = extId;
          }
        } catch (e) {}
      }
    }

    const h264Ordered = [];
    for (let i = 0; i < h264Pts.length; i++) {
      const pt = h264Pts[i];
      if (!h264Ordered.includes(pt)) {
        h264Ordered.push(pt);
      }
      for (const rtxPt in rtxMap) {
        if (rtxMap[rtxPt] === pt && !h264Ordered.includes(rtxPt)) {
          h264Ordered.push(rtxPt);
        }
      }
    }

    const newLines = [];
    for (let i = 0; i < lines.length; i++) {
      let l = lines[i].trim();
      if (!l) continue;

      // Upgrade H.264 profile-level-id to Level 5.2 (42e034) so WebKit/VideoToolbox unlocks 60/120 FPS high bitrate
      if (l.includes('profile-level-id=42e01f')) {
        l = l.replace('profile-level-id=42e01f', 'profile-level-id=42e034');
      } else if (l.includes('profile-level-id=42001f')) {
        l = l.replace('profile-level-id=42001f', 'profile-level-id=420034');
      }

      // Inject max-fr and max-fs into fmtp lines for ALL video codecs
      if (l.startsWith('a=fmtp:') && !l.includes('apt=')) {
        if (!l.includes('max-fr=')) {
          l += `;max-fr=${targetFps};max-fs=12288`;
        }
      }

      if (l.startsWith('m=video')) {
        const parts = l.split(' ');
        const prefix = parts.slice(0, 3);
        const currentPts = parts.slice(3);
        const reordered = h264Ordered.filter(pt => currentPts.includes(pt));
        const remaining = currentPts.filter(pt => !reordered.includes(pt));
        newLines.push(prefix.concat(reordered, remaining).join(' '));

        // Inject extmap for 0ms playout delay
        if (!hasPlayoutExt) {
          const playoutId = Math.min(14, maxExtId + 1);
          newLines.push(`a=extmap:${playoutId} http://www.webrtc.org/experiments/rtp-hdrext/playout-delay`);
          hasPlayoutExt = true;
        }

        // Playout delay 0ms & sweet-spot bitrates to prevent Wi-Fi bufferbloat
        newLines.push('a=playout-delay:0 0');
        newLines.push(`a=framerate:${targetFps}`);
        newLines.push('a=x-google-min-bitrate=4000');
        newLines.push('a=x-google-start-bitrate=10000');
        newLines.push('a=x-google-max-bitrate=22000');
        newLines.push('a=x-google-flag:conference');
        newLines.push('b=AS:22000');
        newLines.push('b=TIAS:22000000');
        continue;
      }

      newLines.push(l);
    }
    return newLines.join('\r\n');
  }

  async function setupPeerConnection() {
    if (peerConnection) {
      peerConnection.close();
    }

    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ],
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    };

    peerConnection = new RTCPeerConnection(config);

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'candidate',
          candidate: event.candidate
        }));
      }
    };

    // Add local tracks to send to PC
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });

    // Enforce 60/120 FPS target & high bitrate up to 22 Mbps without Wi-Fi bufferbloat
    const is120 = qualitySelect.value === '120fps' || qualitySelect.value === '2k120' || qualitySelect.value === '1080p120';
    const targetFps = is120 ? 120 : 60;
    const maxBitrate = qualitySelect.value === 'native4k' ? 25000000 : 20000000;
    const videoSender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
    if (videoSender) {
      try {
        const params = videoSender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxFramerate = targetFps;
        params.encodings[0].maxBitrate = maxBitrate;
        params.encodings[0].networkPriority = 'high';
        params.encodings[0].priority = 'high';
        // Maintain high resolution (prevents WebRTC from downscaling to 480p preview)
        params.degradationPreference = 'maintain-resolution';
        await videoSender.setParameters(params);
        console.log('[WebRTC Sender] Unlocked framerate to:', targetFps, 'bitrate:', maxBitrate, 'pref: maintain-resolution');
      } catch (e) {
        console.warn('Set sender parameters error:', e);
      }
    }

    // Create Offer
    const offer = await peerConnection.createOffer();
    const optimizedSDP = optimizeOfferSDP(offer.sdp);
    const finalOffer = new RTCSessionDescription({
      type: 'offer',
      sdp: optimizedSDP
    });

    await peerConnection.setLocalDescription(finalOffer);

    // Send Offer to desktop
    ws.send(JSON.stringify({
      type: 'offer',
      offer: finalOffer
    }));
  }

  function stopMirroring() {
    releaseWakeLock();
    toggleOledDimmer(false);

    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'mobile_disconnected' }));
    }

    activeCard.classList.add('hidden');
    readyCard.classList.remove('hidden');
    streamTimer.textContent = '00:00';
  }

  function updateTimer() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    streamTimer.textContent = `${m}:${s}`;
  }

  // Universal Clipboard & File Handling
  function handleReceivedClipboard(text) {
    if (!text) return;
    const clipReceivedBanner = document.getElementById('clipReceivedBanner');
    const clipReceivedText = document.getElementById('clipReceivedText');
    if (clipReceivedBanner && clipReceivedText) {
      clipReceivedText.textContent = text;
      clipReceivedBanner.classList.remove('hidden');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      }
    }
  }

  function handleReceivedFile(file) {
    if (!file || !file.data) return;
    const a = document.createElement('a');
    a.href = file.data;
    a.download = file.name || 'received_file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    showModal('File Diterima', `File ${file.name} dari PC telah diunduh ke HP.`);
  }

  function setupEventListeners() {
    btnStartMirror.addEventListener('click', () => startMirroring(false));
    btnStopMirror.addEventListener('click', stopMirroring);
    btnCameraMirror.addEventListener('click', () => startMirroring(true));
    btnModalClose.addEventListener('click', () => errorModal.classList.remove('show'));

    // Mobile Clipboard Sync
    const mobileClipInput = document.getElementById('mobileClipInput');
    const btnSendClipToPc = document.getElementById('btnSendClipToPc');
    const btnCopyReceivedClip = document.getElementById('btnCopyReceivedClip');
    const clipReceivedText = document.getElementById('clipReceivedText');

    if (btnSendClipToPc && mobileClipInput) {
      btnSendClipToPc.addEventListener('click', () => {
        const text = mobileClipInput.value.trim();
        if (!text) return;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'mobile_clipboard', text }));
          mobileClipInput.value = '';
          btnSendClipToPc.textContent = 'Terkirim! ✓';
          setTimeout(() => { btnSendClipToPc.textContent = 'Kirim ke PC'; }, 1500);
        }
      });
    }

    if (btnCopyReceivedClip && clipReceivedText) {
      btnCopyReceivedClip.addEventListener('click', () => {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(clipReceivedText.textContent).then(() => {
            btnCopyReceivedClip.textContent = 'Tersalin! ✓';
            setTimeout(() => { btnCopyReceivedClip.textContent = 'Salin'; }, 1500);
          });
        }
      });
    }

    // Mobile File Transfer
    const btnPickFileMobile = document.getElementById('btnPickFileMobile');
    const mobileFileInput = document.getElementById('mobileFileInput');
    const fileUploadStatus = document.getElementById('fileUploadStatus');

    if (btnPickFileMobile && mobileFileInput) {
      btnPickFileMobile.addEventListener('click', () => mobileFileInput.click());
      mobileFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        fileUploadStatus.textContent = `Mengirim: ${file.name}...`;
        fileUploadStatus.classList.remove('hidden');

        const reader = new FileReader();
        reader.onload = (event) => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'mobile_file',
              file: {
                name: file.name,
                type: file.type,
                size: file.size,
                data: event.target.result
              }
            }));
            fileUploadStatus.textContent = `Terkirim: ${file.name} ✓`;
            setTimeout(() => { fileUploadStatus.classList.add('hidden'); }, 3000);
          }
        };
        reader.readAsDataURL(file);
      });
    }

    // OLED Battery Saver Dimmer
    const btnToggleDimmer = document.getElementById('btnToggleDimmer');
    const btnWakeDimmer = document.getElementById('btnWakeDimmer');
    if (btnToggleDimmer) {
      btnToggleDimmer.addEventListener('click', () => toggleOledDimmer(true));
    }
    if (btnWakeDimmer) {
      btnWakeDimmer.addEventListener('click', () => toggleOledDimmer(false));
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();

