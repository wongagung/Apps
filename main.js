const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const MirrorServer = require('./server');

// Prevent multiple instances running simultaneously and fighting over ports
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// Ignore self-signed TLS errors inside Electron Chromium & Unlock High Refresh Rate (60/120 FPS)
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-insecure-localhost');
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-accelerated-video-encode');
app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,D3D11VideoDecoder,ZeroCopy');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

let mainWindow = null;
let mirrorServer = null;
let currentChosenIp = null;
let tray = null;
let isQuitting = false;

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// Handle SSL certificate verification
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#090d16',
    title: 'AirCast Pro - Windows Native Screen Mirroring',
    frame: false, // Modern frameless Windows 11 look
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: process.platform === 'win32'
      ? path.join(__dirname, 'src', 'desktop', 'icon.ico')
      : path.join(__dirname, 'src', 'desktop', 'icon.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'desktop', 'index.html'));

  mainWindow.on('close', () => {
    isQuitting = true;
    if (mirrorServer) {
      mirrorServer.stop();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupTray() {
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, 'src', 'desktop', 'icon.ico')
    : path.join(__dirname, 'src', 'desktop', 'icon.png');

  tray = new Tray(iconPath);
  tray.setToolTip('AirCast Pro - Windows Native Screen Mirroring');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Buka AirCast Pro',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Mode Layar Penuh',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.setFullScreen(!mainWindow.isFullScreen());
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Keluar (Quit)',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// Ensure Pictures/AirCast, Videos/AirCast, and Downloads/AirCast directories exist
function getAirCastDir(type) {
  let baseDir;
  if (type === 'videos') baseDir = path.join(os.homedir(), 'Videos');
  else if (type === 'downloads') baseDir = path.join(os.homedir(), 'Downloads');
  else baseDir = path.join(os.homedir(), 'Pictures');
  const targetDir = path.join(baseDir, 'AirCast');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

app.whenReady().then(async () => {
  mirrorServer = new MirrorServer({ port: 8443, httpPort: 8080 });

  try {
    const serverDetails = await mirrorServer.start();
    console.log('[AirCast Main] Server started successfully:', serverDetails);
  } catch (err) {
    console.error('[AirCast Main] Failed to start server:', err);
  }

  await createWindow();
  setupTray();

  // Bi-directional IPC Bridge between MirrorServer and Desktop Window
  mirrorServer.on('mobile-signal', (msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mobile-signal', msg);
    }
  });

  ipcMain.on('desktop-signal', (event, msg) => {
    if (mirrorServer) {
      mirrorServer.sendToMobile(msg);
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (mirrorServer) {
    mirrorServer.stop();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('get-server-info', async () => {
  if (!mirrorServer) return null;
  const ip = currentChosenIp || mirrorServer.getPrimaryIP();
  const url = `https://${ip}:${mirrorServer.port}/?session=${mirrorServer.currentSessionToken}&pin=${mirrorServer.currentPin}`;
  const qrDataUrl = await mirrorServer.generateQRCode(url);

  return {
    ip,
    port: mirrorServer.port,
    sessionToken: mirrorServer.currentSessionToken,
    pin: mirrorServer.currentPin,
    url,
    qrDataUrl,
    interfaces: mirrorServer.getNetworkInterfaces()
  };
});

ipcMain.handle('regenerate-session', async () => {
  if (!mirrorServer) return null;
  const session = mirrorServer.regenerateSession();
  const ip = currentChosenIp || session.ip;
  const url = `https://${ip}:${mirrorServer.port}/?session=${session.sessionToken}&pin=${session.pin}`;
  const qrDataUrl = await mirrorServer.generateQRCode(url);

  return {
    ...session,
    ip,
    url,
    qrDataUrl
  };
});

ipcMain.handle('get-network-interfaces', () => {
  return mirrorServer ? mirrorServer.getNetworkInterfaces() : [];
});

ipcMain.handle('select-network-interface', async (event, ip) => {
  currentChosenIp = ip;
  const url = `https://${ip}:${mirrorServer.port}/?session=${mirrorServer.currentSessionToken}&pin=${mirrorServer.currentPin}`;
  const qrDataUrl = await mirrorServer.generateQRCode(url);

  return {
    ip,
    port: mirrorServer.port,
    sessionToken: mirrorServer.currentSessionToken,
    pin: mirrorServer.currentPin,
    url,
    qrDataUrl
  };
});

ipcMain.handle('save-screenshot', async (event, base64Data) => {
  try {
    const dir = getAirCastDir('pictures');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultPath = path.join(dir, `AirCast_Screenshot_${timestamp}.png`);

    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Simpan Screenshot Layar',
      defaultPath,
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const base64Image = base64Data.replace(/^data:image\/png;base64,/, '');
    await fs.promises.writeFile(filePath, Buffer.from(base64Image, 'base64'));

    return { success: true, filePath };
  } catch (err) {
    console.error('Error saving screenshot:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('save-recording', async (event, arrayBuffer, filename) => {
  try {
    const dir = getAirCastDir('videos');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const defaultPath = path.join(dir, filename || `AirCast_Recording_${timestamp}.webm`);

    const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
      title: 'Simpan Rekaman Layar',
      defaultPath,
      filters: [
        { name: 'WebM Video', extensions: ['webm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const buffer = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
    await fs.promises.writeFile(filePath, buffer);
    return { success: true, filePath };
  } catch (err) {
    console.error('Error saving recording:', err);
    return { success: false, error: err.message };
  }
});

let prePipBounds = null;
let isPipMode = false;

ipcMain.handle('toggle-pip', () => {
  if (!mainWindow) return false;
  isPipMode = !isPipMode;
  if (isPipMode) {
    prePipBounds = mainWindow.getBounds();
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const pipW = 420;
    const pipH = 260;
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setBounds({
      x: width - pipW - 24,
      y: height - pipH - 24,
      width: pipW,
      height: pipH
    });
  } else {
    mainWindow.setAlwaysOnTop(false);
    if (prePipBounds) {
      mainWindow.setBounds(prePipBounds);
    } else {
      mainWindow.setSize(1200, 800);
      mainWindow.center();
    }
  }
  return isPipMode;
});

ipcMain.handle('save-replay-direct', async (event, arrayBuffer) => {
  try {
    const dir = getAirCastDir('videos');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(dir, `AirCast_Replay_30s_${timestamp}.webm`);
    const buffer = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
    await fs.promises.writeFile(filePath, buffer);
    console.log('[Main IPC] Saved Instant Replay 30s:', filePath, 'size:', buffer.length);
    return { success: true, filePath, size: buffer.length };
  } catch (err) {
    console.error('[Main IPC] Error saving replay direct:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('copy-to-clipboard', (event, text) => {
  try {
    const { clipboard } = require('electron');
    clipboard.writeText(text || '');
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('read-clipboard', () => {
  try {
    const { clipboard } = require('electron');
    return clipboard.readText();
  } catch (e) {
    return '';
  }
});

ipcMain.handle('save-received-file', async (event, arrayBuffer, filename) => {
  try {
    const dir = getAirCastDir('downloads');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = filename || `AirCast_File_${timestamp}.bin`;
    const filePath = path.join(dir, safeName);
    const buffer = Buffer.isBuffer(arrayBuffer) ? arrayBuffer : Buffer.from(arrayBuffer);
    await fs.promises.writeFile(filePath, buffer);
    return { success: true, filePath, filename: safeName };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('toggle-fullscreen', () => {
  if (mainWindow) {
    const isFull = mainWindow.isFullScreen();
    mainWindow.setFullScreen(!isFull);
    return !isFull;
  }
  return false;
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('close-window', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('open-external', (event, url) => {
  shell.openExternal(url);
});

