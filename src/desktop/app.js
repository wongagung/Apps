// Desktop Client Logic for AirCast Pro
(function() {
  'use strict';

  // DOM Elements
  const btnMinimize = document.getElementById('btnMinimize');
  const btnMaximize = document.getElementById('btnMaximize');
  const btnClose = document.getElementById('btnClose');
  const headerStatusPill = document.getElementById('headerStatusPill');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');

  const pairingView = document.getElementById('pairingView');
  const mirrorView = document.getElementById('mirrorView');

  const qrImage = document.getElementById('qrImage');
  const networkSelect = document.getElementById('networkSelect');
  const pinText = document.getElementById('pinText');
  const btnCopyPin = document.getElementById('btnCopyPin');
  const urlInput = document.getElementById('urlInput');
  const btnCopyUrl = document.getElementById('btnCopyUrl');
  const btnRegenerate = document.getElementById('btnRegenerate');
  const btnOpenLocalTest = document.getElementById('btnOpenLocalTest');

  const videoStage = document.getElementById('videoStage');
  const videoWrapper = document.getElementById('videoWrapper');
  const remoteVideo = document.getElementById('remoteVideo');

  const hudDeviceIcon = document.getElementById('hudDeviceIcon');
  const hudDeviceName = document.getElementById('hudDeviceName');
  const hudLatency = document.getElementById('hudLatency');
  const hudFps = document.getElementById('hudFps');
  const hudResolution = document.getElementById('hudResolution');
  const hudBitrate = document.getElementById('hudBitrate');
  const recTimerBadge = document.getElementById('recTimerBadge');
  const hudRecTimer = document.getElementById('hudRecTimer');

  const btnFullscreen = document.getElementById('btnFullscreen');
  const btnScreenshot = document.getElementById('btnScreenshot');
  const btnRecord = document.getElementById('btnRecord');
  const recBtnLabel = document.getElementById('recBtnLabel');
  const btnRotate = document.getElementById('btnRotate');
  const rotateDegLabel = document.getElementById('rotateDegLabel');
  const btnFitToggle = document.getElementById('btnFitToggle');
  const fitLabel = document.getElementById('fitLabel');
  const btnAudioToggle = document.getElementById('btnAudioToggle');
  const audioLabel = document.getElementById('audioLabel');
  const btnDisconnect = document.getElementById('btnDisconnect');

  const toastNotification = document.getElementById('toastNotification');
  const toastMessage = document.getElementById('toastMessage');

  // State
  let serverInfo = null;
  let ws = null;
  let peerConnection = null;
  let currentRotation = 0;
  let isFitCover = false;
  let isMuted = false;

  // Recording & Replay State
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordStartTime = null;
  let recordTimerInterval = null;

  // Instant Replay 30s Buffer
  let replayRecorder = null;
  let replayHeader = null;
  let replayRollingChunks = [];

  // Annotation State
  let isAnnotating = false;
  let isDrawing = false;
  let penColor = '#06b6d4';

  // Audio Control & Gain State
  let audioCtx = null;
  let gainNode = null;
  let audioSource = null;
  let currentVolume = 100;

  // Gamepad Passthrough State
  let gamepadLoopActive = false;

  // Stats State
  let statsInterval = null;
  let prevBytesReceived = 0;
  let prevTimestamp = 0;

  // Initialize
  async function init() {
    setupWindowControls();
    setupEventListeners();
    setupAnnotation();
    setupInnovations();
    setupGamepad();
    await loadServerInfo();
  }

  function setupWindowControls() {
    btnMinimize.addEventListener('click', () => window.aircastAPI.minimizeWindow());
    btnMaximize.addEventListener('click', () => {
      window.aircastAPI.maximizeWindow();
      setTimeout(applyRotation, 200);
    });
    btnClose.addEventListener('click', () => window.aircastAPI.closeWindow());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'F10') {
        e.preventDefault();
        toggleObsClean();
      } else if (e.altKey && (e.key === 'F10' || e.code === 'KeyS')) {
        e.preventDefault();
        triggerInstantReplay();
      } else if (e.key === 'Escape') {
        if (document.body.classList.contains('obs-clean-mode')) {
          e.preventDefault();
          toggleObsClean();
        } else if (document.body.classList.contains('fullscreen-mode')) {
          e.preventDefault();
          toggleFullscreen();
        }
      }
    });

    // Double-click on stage to toggle Fullscreen
    videoStage.addEventListener('dblclick', (e) => {
      if (e.target.closest('.hud-top') || e.target.closest('.hud-bottom')) return;
      toggleFullscreen();
    });

    // Auto-hide HUDs during mouse inactivity in Fullscreen
    let mouseIdleTimer = null;
    window.addEventListener('mousemove', () => {
      document.body.classList.add('mouse-active');
      clearTimeout(mouseIdleTimer);
      mouseIdleTimer = setTimeout(() => {
        if (document.body.classList.contains('fullscreen-mode')) {
          document.body.classList.remove('mouse-active');
        }
      }, 2500);
    });

    // Auto-recalculate scaling on resize
    window.addEventListener('resize', () => {
      applyRotation();
    });
  }

  async function toggleFullscreen() {
    const isFull = await window.aircastAPI.toggleFullscreen();
    document.body.classList.toggle('fullscreen-mode', isFull);
    btnFullscreen.classList.toggle('active', isFull);
    const span = btnFullscreen.querySelector('span');
    if (span) span.textContent = isFull ? 'Kecilkan' : 'Layar Penuh';
    showToast(isFull ? 'Layar Penuh Aktif (Tekan F11 atau ESC untuk keluar)' : 'Layar Penuh Nonaktif');
    setTimeout(applyRotation, 200);
  }

  function showToast(msg, duration = 3000) {
    toastMessage.textContent = msg;
    toastNotification.classList.add('show');
    setTimeout(() => {
      toastNotification.classList.remove('show');
    }, duration);
  }

  async function loadServerInfo() {
    try {
      serverInfo = await window.aircastAPI.getServerInfo();
      if (!serverInfo) {
        setTimeout(loadServerInfo, 1000);
        return;
      }

      applyServerDetails(serverInfo);
      setupInterfaceDropdown(serverInfo.interfaces);
      connectSignaling();
    } catch (err) {
      console.error('Failed to get server info:', err);
    }
  }

  let isWebQrMode = false;
  const btnQrModeLocal = document.getElementById('btnQrModeLocal');
  const btnQrModeWeb = document.getElementById('btnQrModeWeb');

  function applyServerDetails(info) {
    serverInfo = info;
    updateQrDisplay();
    pinText.textContent = info.pin || '------';
  }

  function updateQrDisplay() {
    if (!serverInfo) return;
    if (isWebQrMode && serverInfo.webQrDataUrl) {
      qrImage.src = serverInfo.webQrDataUrl;
      urlInput.value = serverInfo.webUrl || '';
    } else {
      if (serverInfo.qrDataUrl) {
        qrImage.src = serverInfo.qrDataUrl;
      }
      urlInput.value = serverInfo.url || '';
    }
  }

  function setupInterfaceDropdown(interfaces) {
    networkSelect.innerHTML = '';
    if (!interfaces || interfaces.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = '127.0.0.1 (Localhost)';
      networkSelect.appendChild(opt);
      return;
    }

    interfaces.forEach(iface => {
      const opt = document.createElement('option');
      opt.value = iface.address;
      const typeLabel = iface.isLikelyWifi ? '📡 Wi-Fi' : (iface.isLikelyEthernet ? '🔌 Ethernet' : '🌐 LAN');
      opt.textContent = `${typeLabel}: ${iface.address} (${iface.name})`;
      if (iface.address === serverInfo.ip) {
        opt.selected = true;
      }
      networkSelect.appendChild(opt);
    });

    networkSelect.addEventListener('change', async (e) => {
      const selectedIp = e.target.value;
      const updated = await window.aircastAPI.selectNetworkInterface(selectedIp);
      applyServerDetails(updated);
      showToast(`Beralih ke IP: ${selectedIp}`);
    });
  }

  let ipcRegistered = false;

  function sendSignaling(msg) {
    // Prefer direct WebSocket if open
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(msg));
        return;
      } catch (e) {}
    }
    // Fallback to IPC bridge
    if (window.aircastAPI && window.aircastAPI.sendDesktopSignal) {
      window.aircastAPI.sendDesktopSignal(msg);
    }
  }

  function connectSignaling() {
    if (!serverInfo) return;

    // Listen to direct IPC mobile signals from local server (only register once)
    if (!ipcRegistered && window.aircastAPI && window.aircastAPI.onMobileSignal) {
      ipcRegistered = true;
      window.aircastAPI.onMobileSignal((msg) => {
        handleSignalingMessage(msg);
      });
    }

    updateStatus(true, 'Siap Scan QR Code');

    if (ws) {
      try { ws.close(); } catch (e) {}
      ws = null;
    }

    // Connect to WebSocket signaling server (try localhost first, then IP)
    const wsUrl = `wss://127.0.0.1:${serverInfo.port}/?role=desktop&session=${serverInfo.sessionToken}&pin=${serverInfo.pin}`;
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[Desktop Signaling] Connected via WSS.');
        updateStatus(true, 'Siap Scan QR Code');
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleSignalingMessage(msg);
        } catch (err) {
          console.error('Signaling message error:', err);
        }
      };

      ws.onclose = () => {
        console.log('[Desktop Signaling] WS closed, IPC bridge remains active.');
      };

      ws.onerror = (err) => {
        console.warn('[Desktop Signaling] WS fallback error, using direct IPC bridge.');
      };
    } catch (e) {
      console.warn('WS initialization error, running on IPC:', e);
    }
  }

  function updateStatus(connected, text) {
    statusText.textContent = text;
    if (connected) {
      statusDot.classList.add('connected');
      statusDot.classList.remove('pulse');
      headerStatusPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
      statusDot.classList.remove('connected');
      statusDot.classList.add('pulse');
      headerStatusPill.style.borderColor = 'rgba(255, 255, 255, 0.08)';
    }
  }

  async function handleSignalingMessage(msg) {
    console.log('[Desktop Signaling] Received:', msg.type);

    switch (msg.type) {
      case 'mobile_connected':
        updateStatus(false, 'Device Terdeteksi...');
        showToast('Device HP/Tablet terdeteksi. Memulai streaming...');
        break;

      case 'device_info':
        updateDeviceInfo(msg.info);
        break;

      case 'offer':
        await handleOffer(msg.offer);
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

      case 'mobile_clipboard':
        if (msg.text) {
          window.aircastAPI.copyToClipboard(msg.text);
          showToast(`📋 Teks dari HP disalin ke PC: "${msg.text.slice(0, 32)}..."`, 4000);
        }
        break;

      case 'mobile_file':
        if (msg.file && msg.file.data) {
          showToast(`📁 Menerima file ${msg.file.name}...`);
          try {
            const base64Content = msg.file.data.split(',')[1];
            const binaryString = atob(base64Content);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const res = await window.aircastAPI.saveReceivedFile(bytes.buffer, msg.file.name);
            if (res.success) {
              showToast(`📁 File tersimpan di: ${res.filePath}`, 5000);
            }
          } catch (e) {
            console.error('Save file error:', e);
            showToast('Gagal menyimpan file dari HP.');
          }
        }
        break;

      case 'mobile_disconnected':
        showToast('HP/Tablet memutuskan koneksi mirroring.');
        resetToPairingView();
        break;
    }
  }

  function updateDeviceInfo(info) {
    if (!info) return;
    if (info.os === 'ios') {
      hudDeviceIcon.textContent = '🍏';
      hudDeviceName.textContent = info.device || 'Apple iOS Device';
    } else if (info.os === 'android') {
      hudDeviceIcon.textContent = '🤖';
      hudDeviceName.textContent = info.device || 'Android Device';
    } else {
      hudDeviceIcon.textContent = '📱';
      hudDeviceName.textContent = info.device || 'Mobile Device';
    }
  }

  function optimizeSDP(sdp) {
    const lines = sdp.split('\r\n');
    const targetFps = 120;

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

      // Upgrade H.264 profile to Level 5.2
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

  let isHandlingOffer = false;

  async function handleOffer(offer) {
    if (isHandlingOffer) {
      console.warn('[WebRTC] Already negotiating an offer, ignoring duplicate');
      return;
    }
    isHandlingOffer = true;

    try {
      initPeerConnection();

      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peerConnection.createAnswer();
      
      // Optimize answer SDP for 0ms delay
      const optimizedSDP = optimizeSDP(answer.sdp);
      const finalAnswer = new RTCSessionDescription({
        type: 'answer',
        sdp: optimizedSDP
      });

      await peerConnection.setLocalDescription(finalAnswer);

      sendSignaling({
        type: 'answer',
        answer: finalAnswer
      });
    } catch (err) {
      console.error('[WebRTC] Error handling offer:', err);
    } finally {
      isHandlingOffer = false;
    }
  }

  function initPeerConnection() {
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
      if (event.candidate) {
        sendSignaling({
          type: 'candidate',
          candidate: event.candidate
        });
      }
    };

    peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind);
      
      // Eliminate receiver buffer delay: enforce 0ms playout delay & zero jitter buffer
      try {
        const receivers = peerConnection.getReceivers();
        receivers.forEach(r => {
          if ('playoutDelayHint' in r) {
            r.playoutDelayHint = 0; // 0ms playout delay
          }
          if ('jitterBufferTarget' in r) {
            r.jitterBufferTarget = 0; // 0ms jitter buffer target
          }
        });
      } catch (err) {
        console.warn('Could not set playoutDelayHint:', err);
      }

      if (event.streams && event.streams[0]) {
        const stream = event.streams[0];
        remoteVideo.srcObject = stream;
        remoteVideo.play().catch(e => console.log('Autoplay error:', e));

        // Start buffer & audio once when metadata is ready (prevents dual initialization)
        remoteVideo.onloadedmetadata = () => {
          console.log('[RemoteVideo] Metadata loaded:', remoteVideo.videoWidth, 'x', remoteVideo.videoHeight);
          applyRotation();
          startReplayBuffer(stream);
          setupWebAudio(stream);
        };

        // Debounced resize to avoid layout thrashing
        let resizeTimer = null;
        remoteVideo.onresize = () => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            console.log('[RemoteVideo] Stream resized:', remoteVideo.videoWidth, 'x', remoteVideo.videoHeight);
            applyRotation();
          }, 150);
        };

        switchToMirrorView();
        startStatsMonitor();
      }
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE Connection State:', peerConnection.iceConnectionState);
      if (peerConnection.iceConnectionState === 'connected') {
        updateStatus(true, 'Streaming Aktif (120 FPS Ready - 0ms)');
      } else if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
        updateStatus(false, 'Koneksi Terputus');
      }
    };
  }

  function switchToMirrorView() {
    pairingView.classList.add('hidden');
    mirrorView.classList.remove('hidden');
    updateStatus(true, 'Streaming Aktif (120 FPS Ready)');
    showToast('🚀 Layar berhasil di-mirroring!');
    setTimeout(applyRotation, 50);
  }

  function resetToPairingView() {
    stopRecording();
    stopReplayBuffer();
    stopStatsMonitor();

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    if (remoteVideo.srcObject) {
      remoteVideo.srcObject.getTracks().forEach(t => t.stop());
      remoteVideo.srcObject = null;
    }

    currentRotation = 0;
    applyRotation();

    mirrorView.classList.add('hidden');
    pairingView.classList.remove('hidden');
    updateStatus(false, 'Menunggu Scan QR');
  }

  function startStatsMonitor() {
    stopStatsMonitor();
    prevBytesReceived = 0;
    prevTimestamp = performance.now();

    statsInterval = setInterval(async () => {
      if (!peerConnection) return;

      try {
        // Enforce 0ms playout delay continuously
        const receivers = peerConnection.getReceivers();
        receivers.forEach(r => {
          if ('playoutDelayHint' in r) r.playoutDelayHint = 0;
          if ('jitterBufferTarget' in r) r.jitterBufferTarget = 0;
        });

        const stats = await peerConnection.getStats();
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime !== undefined) {
              const ms = Math.max(0, Math.round(report.currentRoundTripTime * 1000));
              hudLatency.textContent = `${ms} ms`;
              if (ms <= 5) {
                hudLatency.className = 'stat-value latency-zero';
                hudLatency.style.color = '';
              } else if (ms <= 18) {
                hudLatency.className = 'stat-value';
                hudLatency.style.color = '#38bdf8';
              } else {
                hudLatency.className = 'stat-value';
                hudLatency.style.color = '#facc15';
              }
            }
          }

          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            // FPS
            if (report.framesPerSecond !== undefined) {
              hudFps.textContent = Math.round(report.framesPerSecond);
            }

            // Resolution
            if (report.frameWidth && report.frameHeight) {
              hudResolution.textContent = `${report.frameWidth} x ${report.frameHeight}`;
            }

            // Bitrate calculation
            const now = performance.now();
            const timeDiff = (now - prevTimestamp) / 1000;
            if (timeDiff > 0 && report.bytesReceived !== undefined) {
              const bytesDiff = report.bytesReceived - prevBytesReceived;
              const bitrateMbps = ((bytesDiff * 8) / (timeDiff * 1000000)).toFixed(1);
              hudBitrate.textContent = `${bitrateMbps} Mbps`;
            }
            prevBytesReceived = report.bytesReceived || 0;
            prevTimestamp = now;
          }
        });
      } catch (e) {
        // Stats error ignore
      }
    }, 1000);
  }

  function stopStatsMonitor() {
    if (statsInterval) {
      clearInterval(statsInterval);
      statsInterval = null;
    }
  }

  function setupEventListeners() {
    // QR Mode Toggle (Local vs Web Online)
    if (btnQrModeLocal && btnQrModeWeb) {
      btnQrModeLocal.addEventListener('click', () => {
        isWebQrMode = false;
        btnQrModeLocal.classList.add('active');
        btnQrModeWeb.classList.remove('active');
        updateQrDisplay();
        showToast('Mode QR: IP Lokal (Jalur langsung Wi-Fi)');
      });

      btnQrModeWeb.addEventListener('click', () => {
        isWebQrMode = true;
        btnQrModeWeb.classList.add('active');
        btnQrModeLocal.classList.remove('active');
        updateQrDisplay();
        showToast('Mode QR: Web Online GitHub Pages (Bebas peringatan SSL)');
      });
    }

    // Copy URL
    btnCopyUrl.addEventListener('click', () => {
      navigator.clipboard.writeText(urlInput.value);
      showToast('Tautan mirroring disalin ke clipboard!');
    });

    // Copy PIN
    btnCopyPin.addEventListener('click', () => {
      navigator.clipboard.writeText(pinText.textContent);
      showToast('PIN berhasil disalin!');
    });

    // Regenerate QR
    btnRegenerate.addEventListener('click', async () => {
      const updated = await window.aircastAPI.regenerateSession();
      applyServerDetails(updated);
      connectSignaling();
      showToast('QR Code dan PIN baru telah dibuat.');
    });

    // Open Local Test
    btnOpenLocalTest.addEventListener('click', () => {
      if (serverInfo && serverInfo.url) {
        window.aircastAPI.openExternal(serverInfo.url);
      }
    });

    // Fullscreen
    btnFullscreen.addEventListener('click', () => {
      toggleFullscreen();
    });

    // Screenshot Capture
    btnScreenshot.addEventListener('click', captureScreenshot);

    // Screen Recording
    btnRecord.addEventListener('click', toggleRecording);

    // Rotate 90
    btnRotate.addEventListener('click', () => {
      currentRotation = (currentRotation + 90) % 360;
      applyRotation();
    });

    // Fit / Fill
    btnFitToggle.addEventListener('click', () => {
      isFitCover = !isFitCover;
      fitLabel.textContent = isFitCover ? 'Fill' : 'Fit';
      btnFitToggle.classList.toggle('active', isFitCover);
      applyRotation();
      showToast(isFitCover ? 'Mode Fill: Layar Penuh Tanpa Border Hitam' : 'Mode Fit: Proporsional');
    });

    // Audio Mute / Unmute
    btnAudioToggle.addEventListener('click', () => {
      isMuted = !isMuted;
      remoteVideo.muted = isMuted;
      audioLabel.textContent = isMuted ? 'Mute' : 'Aktif';
      btnAudioToggle.classList.toggle('active', !isMuted);
    });

    // Remote Control Modal
    const btnRemoteControl = document.getElementById('btnRemoteControl');
    const remoteControlModal = document.getElementById('remoteControlModal');
    const btnCloseRemoteModal = document.getElementById('btnCloseRemoteModal');
    if (btnRemoteControl && remoteControlModal) {
      btnRemoteControl.addEventListener('click', () => {
        remoteControlModal.classList.add('show');
      });
      btnCloseRemoteModal.addEventListener('click', () => {
        remoteControlModal.classList.remove('show');
      });
    }

    // Touch / Click transmission on mirrored video
    remoteVideo.addEventListener('pointerdown', (e) => {
      const rect = remoteVideo.getBoundingClientRect();
      const normX = ((e.clientX - rect.left) / rect.width).toFixed(4);
      const normY = ((e.clientY - rect.top) / rect.height).toFixed(4);

      if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
        sendSignaling({
          type: 'remote_input',
          action: 'down',
          x: parseFloat(normX),
          y: parseFloat(normY)
        });

        // Visual click ripple
        const ripple = document.createElement('div');
        ripple.className = 'touch-ripple';
        ripple.style.left = `${e.clientX}px`;
        ripple.style.top = `${e.clientY}px`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 500);
      }
    });

    // Disconnect
    btnDisconnect.addEventListener('click', () => {
      sendSignaling({ type: 'control', action: 'disconnect' });
      resetToPairingView();
      showToast('Koneksi mirroring ditutup.');
    });
  }

  function applyRotation() {
    rotateDegLabel.textContent = `${currentRotation}°`;

    const isRotated = (currentRotation === 90 || currentRotation === 270);
    const stageRect = videoStage.getBoundingClientRect();
    const stageW = stageRect.width || window.innerWidth;
    const stageH = stageRect.height || window.innerHeight;

    if (!isRotated) {
      if (isFitCover) {
        remoteVideo.style.width = '100%';
        remoteVideo.style.height = '100%';
        remoteVideo.style.objectFit = 'cover';
      } else {
        remoteVideo.style.width = '100%';
        remoteVideo.style.height = '100%';
        remoteVideo.style.objectFit = 'contain';
      }
      videoWrapper.style.width = '100%';
      videoWrapper.style.height = '100%';
      videoWrapper.style.transform = `rotate(${currentRotation}deg)`;

      const annotationCanvas = document.getElementById('annotationCanvas');
      if (annotationCanvas) {
        const rect = annotationCanvas.getBoundingClientRect();
        if (rect.width && rect.height) {
          annotationCanvas.width = rect.width;
          annotationCanvas.height = rect.height;
        }
      }
      return;
    }

    // Rotated 90° or 270° (e.g. landscape game from portrait iPhone screen capture)
    const vidW = remoteVideo.videoWidth || 1080;
    const vidH = remoteVideo.videoHeight || 1920;

    // After 90/270deg rotation, displayed width is vidH, and displayed height is vidW
    const scaleX = stageW / vidH;
    const scaleY = stageH / vidW;

    // Fit preserves aspect ratio, Cover/Fill expands to fill whole monitor
    const scale = isFitCover ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

    remoteVideo.style.width = `${vidW}px`;
    remoteVideo.style.height = `${vidH}px`;
    remoteVideo.style.objectFit = 'contain';

    videoWrapper.style.width = 'auto';
    videoWrapper.style.height = 'auto';
    videoWrapper.style.transform = `rotate(${currentRotation}deg) scale(${scale.toFixed(4)})`;
  }

  // Screenshot capture
  async function captureScreenshot() {
    if (!remoteVideo.videoWidth || !remoteVideo.videoHeight) {
      showToast('Tidak ada frame video aktif.');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = remoteVideo.videoWidth;
      canvas.height = remoteVideo.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);

      const base64Data = canvas.toDataURL('image/png');
      showToast('Menyimpan screenshot...');
      const res = await window.aircastAPI.saveScreenshot(base64Data);

      if (res.success) {
        showToast(`Screenshot tersimpan: ${res.filePath}`);
      } else if (!res.canceled) {
        showToast('Gagal menyimpan screenshot.');
      }
    } catch (err) {
      console.error('Screenshot error:', err);
      showToast('Terjadi kesalahan saat capture screenshot.');
    }
  }

  // Recording
  function toggleRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function getSupportedMimeType(stream) {
    const hasAudio = stream && stream.getAudioTracks().length > 0;
    const candidates = hasAudio ? [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4'
    ] : [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm;codecs=h264',
      'video/webm',
      'video/mp4'
    ];

    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) {
        return c;
      }
    }
    return '';
  }

  function startRecording() {
    if (!remoteVideo.srcObject) {
      showToast('Tidak ada stream video untuk direkam.');
      return;
    }

    recordedChunks = [];
    const stream = remoteVideo.srcObject;

    try {
      const mime = getSupportedMimeType(stream);
      const options = mime ? { mimeType: mime } : {};
      mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        clearInterval(recordTimerInterval);
        recTimerBadge.style.display = 'none';
        btnRecord.classList.remove('recording');
        recBtnLabel.textContent = 'Rekam';

        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const arrayBuffer = await blob.arrayBuffer();

        showToast('Menyimpan file rekaman video...');
        const res = await window.aircastAPI.saveRecording(arrayBuffer, `AirCast_Record_${Date.now()}.webm`);
        if (res.success) {
          showToast(`Rekaman tersimpan di: ${res.filePath}`);
        } else if (!res.canceled) {
          showToast('Gagal menyimpan rekaman.');
        }
      };

      mediaRecorder.start(1000); // 1-second chunks
      recordStartTime = Date.now();
      recTimerBadge.style.display = 'flex';
      btnRecord.classList.add('recording');
      recBtnLabel.textContent = 'Berhenti';

      recordTimerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - recordStartTime) / 1000);
        const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        hudRecTimer.textContent = `${mins}:${secs}`;
      }, 1000);

      showToast('🔴 Perekaman video dimulai!');
    } catch (err) {
      console.error('Record start error:', err);
      showToast('Tidak dapat memulai perekaman: ' + err.message);
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  }

  // =========================================================================
  // Innovation 1: Instant Replay (30s Rolling Buffer) & OBS Clean Feed
  // =========================================================================
  function startReplayBuffer(stream) {
    if (replayRecorder) {
      try { replayRecorder.stop(); } catch (e) {}
      replayRecorder = null;
    }
    replayHeader = null;
    replayRollingChunks = [];

    if (!stream) return;

    try {
      const mime = getSupportedMimeType(stream);
      let recorder;
      try {
        const options = mime ? { mimeType: mime } : {};
        recorder = new MediaRecorder(stream, options);
      } catch (mimeErr) {
        console.warn('[ReplayBuffer] Codec failed, fallback to native MediaRecorder:', mimeErr);
        recorder = new MediaRecorder(stream);
      }

      let isFirst = true;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          if (isFirst) {
            replayHeader = e.data;
            isFirst = false;
          } else {
            replayRollingChunks.push({
              data: e.data,
              timestamp: Date.now()
            });
            // Keep roughly 30 seconds
            const cutoff = Date.now() - 32000;
            while (replayRollingChunks.length > 0 && replayRollingChunks[0].timestamp < cutoff) {
              replayRollingChunks.shift();
            }
          }
        }
      };

      recorder.onerror = (err) => {
        console.error('[ReplayBuffer] MediaRecorder error:', err);
      };

      recorder.start(1000);
      replayRecorder = recorder;
      console.log('[ReplayBuffer] Started recording buffer with mime:', mime || 'native');
    } catch (err) {
      console.warn('Replay buffer initialization error:', err);
    }
  }

  function stopReplayBuffer() {
    if (replayRecorder && replayRecorder.state !== 'inactive') {
      try { replayRecorder.stop(); } catch (e) {}
    }
    replayRecorder = null;
    replayHeader = null;
    replayRollingChunks = [];
  }

  async function triggerInstantReplay() {
    const btnReplay30s = document.getElementById('btnReplay30s');
    if (btnReplay30s) {
      btnReplay30s.classList.add('saving');
    }

    const stream = remoteVideo.srcObject;
    if (!stream) {
      showToast('⚠️ Belum ada stream video aktif.');
      if (btnReplay30s) btnReplay30s.classList.remove('saving');
      return;
    }

    if (!replayRecorder || replayRecorder.state === 'inactive') {
      startReplayBuffer(stream);
      await new Promise(r => setTimeout(r, 600));
    }

    // Force flush current data into ondataavailable
    if (replayRecorder && replayRecorder.state === 'recording') {
      try {
        replayRecorder.requestData();
      } catch (e) {
        console.warn('requestData error:', e);
      }
    }

    // Wait 120ms for requestData callback
    await new Promise(r => setTimeout(r, 120));

    const parts = [];
    if (replayHeader) parts.push(replayHeader);
    for (const item of replayRollingChunks) {
      parts.push(item.data);
    }

    if (parts.length === 0) {
      showToast('⚡ Mengumpulkan buffer video... silakan tekan lagi dalam 1-2 detik.');
      if (btnReplay30s) btnReplay30s.classList.remove('saving');
      return;
    }

    showToast('⚡ Menyimpan Instant Replay 30 detik...');

    try {
      const blob = new Blob(parts, { type: 'video/webm' });
      const arrayBuffer = await blob.arrayBuffer();

      const res = await window.aircastAPI.saveReplayDirect(arrayBuffer);
      if (res && res.success) {
        const mb = res.size ? (res.size / (1024 * 1024)).toFixed(1) : (blob.size / (1024 * 1024)).toFixed(1);
        showToast(`⚡ Instant Replay tersimpan (${mb} MB): ${res.filePath}`, 5000);
      } else {
        showToast('Gagal menyimpan replay: ' + (res ? res.error : 'Unknown error'));
      }
    } catch (err) {
      console.error('Save replay error:', err);
      showToast('Error menyimpan replay: ' + err.message);
    } finally {
      if (btnReplay30s) {
        setTimeout(() => btnReplay30s.classList.remove('saving'), 800);
      }
    }
  }

  function toggleObsClean() {
    const isClean = document.body.classList.toggle('obs-clean-mode');
    const btnObsClean = document.getElementById('btnObsClean');
    if (btnObsClean) btnObsClean.classList.toggle('active', isClean);
    showToast(isClean ? '🎬 OBS Clean Feed Aktif (Tekan ESC untuk keluar)' : 'Mode Normal');
  }

  // =========================================================================
  // Innovation 2: Floating PiP (Always-on-Top) & Live Annotation (Pen Tool)
  // =========================================================================
  async function togglePip() {
    const isPip = await window.aircastAPI.togglePip();
    const btnTogglePip = document.getElementById('btnTogglePip');
    const pipLabel = document.getElementById('pipLabel');
    if (btnTogglePip) btnTogglePip.classList.toggle('active', isPip);
    if (pipLabel) pipLabel.textContent = isPip ? 'Restore' : 'PiP';
    showToast(isPip ? '📌 Floating PiP Aktif (Always on Top)' : 'Jendela Normal');
  }

  function setupAnnotation() {
    const annotationCanvas = document.getElementById('annotationCanvas');
    const annotationPalette = document.getElementById('annotationPalette');
    if (!annotationCanvas) return;
    const ctx = annotationCanvas.getContext('2d');

    function resizeCanvas() {
      const rect = annotationCanvas.getBoundingClientRect();
      annotationCanvas.width = rect.width;
      annotationCanvas.height = rect.height;
    }
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    annotationCanvas.addEventListener('pointerdown', (e) => {
      if (!isAnnotating) return;
      isDrawing = true;
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
    });

    annotationCanvas.addEventListener('pointermove', (e) => {
      if (!isAnnotating || !isDrawing) return;
      ctx.strokeStyle = penColor;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = penColor;
      ctx.shadowBlur = 8;
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
    });

    window.addEventListener('pointerup', () => {
      isDrawing = false;
    });

    const btnAnnotation = document.getElementById('btnAnnotation');
    const btnCloseAnnotation = document.getElementById('btnCloseAnnotation');
    const btnClearAnnotation = document.getElementById('btnClearAnnotation');

    function toggleAnnotationMode(force) {
      isAnnotating = typeof force === 'boolean' ? force : !isAnnotating;
      document.body.classList.toggle('annotating', isAnnotating);
      if (btnAnnotation) btnAnnotation.classList.toggle('active', isAnnotating);
      if (annotationPalette) annotationPalette.classList.toggle('hidden', !isAnnotating);
      resizeCanvas();
      if (isAnnotating) {
        showToast('✏️ Mode Coret Layar Aktif (Klik & drag untuk menggambar)');
      }
    }

    if (btnAnnotation) btnAnnotation.addEventListener('click', () => toggleAnnotationMode());
    if (btnCloseAnnotation) btnCloseAnnotation.addEventListener('click', () => toggleAnnotationMode(false));
    if (btnClearAnnotation) {
      btnClearAnnotation.addEventListener('click', () => {
        ctx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
        showToast('🧹 Coretan dibersihkan');
      });
    }

    const colorDots = document.querySelectorAll('.color-dot');
    colorDots.forEach(dot => {
      dot.addEventListener('click', () => {
        colorDots.forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        penColor = dot.getAttribute('data-color') || '#06b6d4';
      });
    });
  }

  // =========================================================================
  // Innovation 4 & 5: Clipboard Sync, Quick File Drop & Real-Time Visual Filters
  // =========================================================================
  function setupInnovations() {
    // 1. Replay 30s & OBS Clean Feed
    const btnReplay30s = document.getElementById('btnReplay30s');
    if (btnReplay30s) btnReplay30s.addEventListener('click', triggerInstantReplay);

    const btnObsClean = document.getElementById('btnObsClean');
    const obsCleanExit = document.getElementById('obsCleanExit');
    if (btnObsClean) btnObsClean.addEventListener('click', toggleObsClean);
    if (obsCleanExit) obsCleanExit.addEventListener('click', toggleObsClean);

    // 2. PiP
    const btnTogglePip = document.getElementById('btnTogglePip');
    if (btnTogglePip) btnTogglePip.addEventListener('click', togglePip);

    // 4. Universal Clipboard Sync
    const btnSyncClipboard = document.getElementById('btnSyncClipboard');
    if (btnSyncClipboard) {
      btnSyncClipboard.addEventListener('click', async () => {
        let text = '';
        if (window.aircastAPI && window.aircastAPI.readClipboard) {
          text = await window.aircastAPI.readClipboard();
        } else if (navigator.clipboard && navigator.clipboard.readText) {
          try { text = await navigator.clipboard.readText(); } catch (e) {}
        }

        if (!text) {
          showToast('Clipboard PC kosong.');
          return;
        }

        sendSignaling({ type: 'pc_clipboard', text });
        showToast(`📋 Clipboard PC dikirim ke HP: "${text.slice(0, 30)}..."`);
      });
    }

    // 4. Quick File Drop PC -> Mobile
    const fileDropOverlay = document.getElementById('fileDropOverlay');
    window.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!mirrorView.classList.contains('hidden') && fileDropOverlay) {
        fileDropOverlay.classList.remove('hidden');
      }
    });

    window.addEventListener('dragleave', (e) => {
      if (e.relatedTarget === null && fileDropOverlay) {
        fileDropOverlay.classList.add('hidden');
      }
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (fileDropOverlay) fileDropOverlay.classList.add('hidden');

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        showToast(`📤 Mengirim file ${file.name} ke HP...`);

        const reader = new FileReader();
        reader.onload = (event) => {
          sendSignaling({
            type: 'pc_file',
            file: {
              name: file.name,
              type: file.type,
              size: file.size,
              data: event.target.result
            }
          });
          showToast(`File ${file.name} terkirim ke HP! ✓`);
        };
        reader.readAsDataURL(file);
      }
    });

    // 5. Visual Filters Cycling (Normal -> Vivid Gaming -> HDR Sharp -> Dark OLED)
    const visualFilters = [
      { name: 'Normal', className: '' },
      { name: 'Vivid Gaming', className: 'filter-vivid' },
      { name: 'HDR Sharp', className: 'filter-hdr' },
      { name: 'Dark OLED', className: 'filter-oled' }
    ];
    let currentFilterIndex = 0;

    const btnFilter = document.getElementById('btnFilter');
    const filterLabel = document.getElementById('filterLabel');

    if (btnFilter) {
      btnFilter.addEventListener('click', () => {
        currentFilterIndex = (currentFilterIndex + 1) % visualFilters.length;
        const current = visualFilters[currentFilterIndex];

        visualFilters.forEach(f => {
          if (f.className) remoteVideo.classList.remove(f.className);
        });

        if (current.className) {
          remoteVideo.classList.add(current.className);
          btnFilter.classList.add('active');
        } else {
          btnFilter.classList.remove('active');
        }

        if (filterLabel) {
          filterLabel.textContent = current.name === 'Normal' ? 'Filter' : current.name;
        }

        showToast(`🎨 Filter: ${current.name}`);
      });
    }

    // Audio Volume Slider & 200% Gain Boost
    const audioControlWrapper = document.getElementById('audioControlWrapper');
    const audioSliderPopover = document.getElementById('audioSliderPopover');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumePercent = document.getElementById('volumePercent');

    if (btnAudioToggle && audioSliderPopover) {
      btnAudioToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        audioSliderPopover.classList.toggle('hidden');
      });

      document.addEventListener('click', (e) => {
        if (audioControlWrapper && !audioControlWrapper.contains(e.target)) {
          audioSliderPopover.classList.add('hidden');
        }
      });

      if (volumeSlider) {
        volumeSlider.addEventListener('input', (e) => {
          currentVolume = parseInt(e.target.value, 10);
          if (volumePercent) volumePercent.textContent = `${currentVolume}%`;
          if (audioLabel) audioLabel.textContent = `${currentVolume}%`;

          if (gainNode) {
            gainNode.gain.value = currentVolume / 100;
          } else {
            remoteVideo.volume = Math.min(1, currentVolume / 100);
          }

          btnAudioToggle.classList.toggle('active', currentVolume > 0);
        });
      }
    }

    // Remote Mobile Screen Dimmer (Save OLED Battery)
    const btnRemoteDimmer = document.getElementById('btnRemoteDimmer');
    if (btnRemoteDimmer) {
      btnRemoteDimmer.addEventListener('click', () => {
        sendSignaling({ type: 'toggle_dimmer' });
        showToast('🌙 Perintah redup layar OLED dikirim ke HP!');
      });
    }
  }

  // Web Audio API with 200% Gain Booster
  function setupWebAudio(stream) {
    if (!stream || stream.getAudioTracks().length === 0) return;
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      gainNode = audioCtx.createGain();
      gainNode.gain.value = currentVolume / 100;

      audioSource = audioCtx.createMediaStreamSource(stream);
      audioSource.connect(gainNode);
      gainNode.connect(audioCtx.destination);
    } catch (e) {
      console.warn('Web Audio API setup fallback to video volume:', e);
      remoteVideo.volume = Math.min(1, currentVolume / 100);
    }
  }

  // PC Controller / Gamepad Passthrough (Web Gamepad API)
  function setupGamepad() {
    window.addEventListener('gamepadconnected', (e) => {
      const badge = document.getElementById('hudGamepadBadge');
      const name = document.getElementById('hudGamepadName');
      if (badge && name) {
        name.textContent = `🎮 ${e.gamepad.id.slice(0, 18)}...`;
        badge.classList.remove('hidden');
      }
      showToast(`🎮 Stik terhubung: ${e.gamepad.id.slice(0, 24)}`);
      startGamepadLoop();
    });

    window.addEventListener('gamepaddisconnected', () => {
      const badge = document.getElementById('hudGamepadBadge');
      if (badge) badge.classList.add('hidden');
      gamepadLoopActive = false;
      showToast('🎮 Stik terputus.');
    });
  }

  function startGamepadLoop() {
    if (gamepadLoopActive) return;
    gamepadLoopActive = true;

    let lastSent = 0;
    function poll() {
      if (!gamepadLoopActive) return;

      const gps = navigator.getGamepads ? navigator.getGamepads() : [];
      let anyConnected = false;
      for (const gp of gps) {
        if (gp && gp.connected) {
          anyConnected = true;
          const now = Date.now();
          if (now - lastSent > 66) { // 15Hz sampling (smooth & lightweight)
            const pressed = [];
            gp.buttons.forEach((b, idx) => {
              if (b.pressed) pressed.push(idx);
            });
            const axes = gp.axes.map(a => Math.abs(a) > 0.25 ? parseFloat(a.toFixed(2)) : 0);

            if (pressed.length > 0 || axes.some(a => a !== 0)) {
              sendSignaling({
                type: 'gamepad_input',
                action: 'gamepad_state',
                buttons: pressed,
                axes: axes
              });
              lastSent = now;
            }
          }
        }
      }

      if (!anyConnected) {
        gamepadLoopActive = false;
        return;
      }

      requestAnimationFrame(poll);
    }
    requestAnimationFrame(poll);
  }

  // Start initialization on DOM ready
  document.addEventListener('DOMContentLoaded', init);
})();

