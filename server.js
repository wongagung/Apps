const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const selfsigned = require('selfsigned');
const QRCode = require('qrcode');
const EventEmitter = require('events');

class MirrorServer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.port = options.port || 8443;
    this.httpPort = options.httpPort || 8080;
    this.app = express();
    this.httpsServer = null;
    this.httpServer = null;
    this.wss = null;
    this.sessions = new Map(); // sessionToken -> { desktopWs, mobileWs, info }
    this.currentSessionToken = this.generateSessionToken();
    this.currentPin = this.generatePin();
  }

  generateSessionToken() {
    return Math.random().toString(36).substring(2, 10);
  }

  generatePin() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  getNetworkInterfaces() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push({
            name,
            address: iface.address,
            isLikelyWifi: /wi-?fi|wlan|wireless/i.test(name),
            isLikelyEthernet: /ethernet|lan/i.test(name)
          });
        }
      }
    }

    // Sort so Wi-Fi / LAN comes first
    addresses.sort((a, b) => {
      if (a.isLikelyWifi && !b.isLikelyWifi) return -1;
      if (!a.isLikelyWifi && b.isLikelyWifi) return 1;
      if (a.isLikelyEthernet && !b.isLikelyEthernet) return -1;
      if (!a.isLikelyEthernet && b.isLikelyEthernet) return 1;
      return 0;
    });

    return addresses;
  }

  getPrimaryIP() {
    const list = this.getNetworkInterfaces();
    return list.length > 0 ? list[0].address : '127.0.0.1';
  }

  async generateCertificates() {
    const primaryIp = this.getPrimaryIP();
    const attrs = [{ name: 'commonName', value: primaryIp }];
    const altNames = [
      { type: 2, value: 'localhost' },
      { type: 7, ip: '127.0.0.1' },
      { type: 7, ip: primaryIp }
    ];

    // Add all discovered IPv4s to SAN
    for (const item of this.getNetworkInterfaces()) {
      altNames.push({ type: 7, ip: item.address });
    }

    const pems = await selfsigned.generate(attrs, {
      days: 365,
      algorithm: 'sha256',
      keySize: 2048,
      extensions: [{ name: 'subjectAltName', altNames }]
    });

    return {
      key: pems.private,
      cert: pems.cert
    };
  }

  async generateQRCode(url) {
    try {
      return await QRCode.toDataURL(url, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        },
        errorCorrectionLevel: 'M'
      });
    } catch (err) {
      console.error('Error generating QR code:', err);
      return null;
    }
  }

  async start() {
    const certs = await this.generateCertificates();

    // Serve static mobile app directory
    const mobilePath = path.join(__dirname, 'src', 'mobile');
    this.app.use(express.static(mobilePath));

    // API Endpoint for server configuration and session info
    this.app.get('/api/session-info', (req, res) => {
      const ip = this.getPrimaryIP();
      const mirrorUrl = `https://${ip}:${this.port}/?session=${this.currentSessionToken}&pin=${this.currentPin}`;
      res.json({
        sessionToken: this.currentSessionToken,
        pin: this.currentPin,
        ip,
        port: this.port,
        url: mirrorUrl,
        allInterfaces: this.getNetworkInterfaces()
      });
    });

    return new Promise((resolve, reject) => {
      try {
        // Create HTTPS Server (Required by iOS Safari and Android Chrome for getDisplayMedia)
        this.httpsServer = https.createServer(certs, this.app);

        // Also create HTTP redirect server
        this.httpServer = http.createServer((req, res) => {
          const host = req.headers.host ? req.headers.host.split(':')[0] : this.getPrimaryIP();
          res.writeHead(301, { Location: `https://${host}:${this.port}${req.url}` });
          res.end();
        });

        // Create unified WebSocketServer with noServer: true
        this.wss = new WebSocketServer({ noServer: true });

        const onUpgrade = (request, socket, head) => {
          this.wss.handleUpgrade(request, socket, head, (ws) => {
            this.wss.emit('connection', ws, request);
          });
        };

        this.httpsServer.on('upgrade', onUpgrade);
        this.httpServer.on('upgrade', onUpgrade);

        this.setupWebSocket();

        this.httpsServer.listen(this.port, '0.0.0.0', () => {
          const ip = this.getPrimaryIP();
          console.log(`[AirCast Server] HTTPS & WSS running on https://${ip}:${this.port}`);
          console.log(`[AirCast Server] Current Session Token: ${this.currentSessionToken} | PIN: ${this.currentPin}`);

          // Listen HTTP redirect port
          this.httpServer.listen(this.httpPort, '0.0.0.0', () => {
            console.log(`[AirCast Server] HTTP redirect running on http://${ip}:${this.httpPort}`);
          }).on('error', (err) => {
            console.log(`[AirCast Server] HTTP redirect port ${this.httpPort} busy, continuing on HTTPS.`);
          });

          resolve({
            ip,
            port: this.port,
            sessionToken: this.currentSessionToken,
            pin: this.currentPin,
            url: `https://${ip}:${this.port}/?session=${this.currentSessionToken}&pin=${this.currentPin}`
          });
        });

        this.httpsServer.on('error', (err) => {
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url, 'https://localhost');
      const role = url.searchParams.get('role'); // 'desktop' or 'mobile'
      const session = url.searchParams.get('session');
      const pin = url.searchParams.get('pin');

      console.log(`[AirCast WSS] New connection: role=${role}, session=${session}`);

      // Authenticate session or pin (allow auto-pair if opened directly on LAN)
      const isValid = (session && session === this.currentSessionToken) || 
                      (pin && pin === this.currentPin) || 
                      (!session && !pin);

      if (!isValid && role === 'mobile') {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Sesi atau PIN tidak valid. Silakan scan ulang QR code terbaru.'
        }));
        ws.close();
        return;
      }

      let sessionData = this.sessions.get(this.currentSessionToken);
      if (!sessionData) {
        sessionData = { desktopWs: null, mobileWs: null, deviceInfo: null };
        this.sessions.set(this.currentSessionToken, sessionData);
      }

      if (role === 'desktop') {
        sessionData.desktopWs = ws;
        ws.send(JSON.stringify({
          type: 'desktop_ready',
          sessionToken: this.currentSessionToken,
          pin: this.currentPin
        }));
      } else if (role === 'mobile') {
        sessionData.mobileWs = ws;
        
        // Notify desktop via WebSocket if open, fallback to IPC
        if (sessionData.desktopWs && sessionData.desktopWs.readyState === WebSocket.OPEN) {
          sessionData.desktopWs.send(JSON.stringify({
            type: 'mobile_connected'
          }));
        } else {
          this.emit('mobile-signal', { type: 'mobile_connected' });
        }

        ws.send(JSON.stringify({
          type: 'mobile_ready',
          sessionToken: this.currentSessionToken
        }));
      }

      // Handle incoming messages
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          const current = this.sessions.get(this.currentSessionToken);
          if (!current) return;

          if (role === 'mobile') {
            if (msg.type === 'device_info') {
              current.deviceInfo = msg.info;
            }

            // Forward to desktop WebSocket if open, fallback to IPC if WS is closed
            if (current.desktopWs && current.desktopWs.readyState === WebSocket.OPEN) {
              current.desktopWs.send(JSON.stringify(msg));
            } else {
              this.emit('mobile-signal', msg);
            }

          } else if (role === 'desktop') {
            // Forward desktop messages to mobile
            if (current.mobileWs && current.mobileWs.readyState === WebSocket.OPEN) {
              current.mobileWs.send(JSON.stringify(msg));
            }
          }
        } catch (e) {
          console.error('[AirCast WSS] Message handling error:', e);
        }
      });

      ws.on('close', () => {
        const current = this.sessions.get(this.currentSessionToken);
        if (!current) return;

        if (role === 'mobile') {
          console.log('[AirCast WSS] Mobile disconnected');
          current.mobileWs = null;
          if (current.desktopWs && current.desktopWs.readyState === WebSocket.OPEN) {
            current.desktopWs.send(JSON.stringify({ type: 'mobile_disconnected' }));
          } else {
            this.emit('mobile-signal', { type: 'mobile_disconnected' });
          }
          this.emit('mobile-signal', { type: 'mobile_disconnected' });
        } else if (role === 'desktop') {
          console.log('[AirCast WSS] Desktop disconnected');
          current.desktopWs = null;
        }
      });
    });
  }

  // Send message directly to connected mobile device
  sendToMobile(msg) {
    const current = this.sessions.get(this.currentSessionToken);
    if (current && current.mobileWs && current.mobileWs.readyState === WebSocket.OPEN) {
      current.mobileWs.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  regenerateSession() {
    this.currentSessionToken = this.generateSessionToken();
    this.currentPin = this.generatePin();
    const sessionData = { desktopWs: null, mobileWs: null, deviceInfo: null };
    this.sessions.set(this.currentSessionToken, sessionData);

    const ip = this.getPrimaryIP();
    return {
      sessionToken: this.currentSessionToken,
      pin: this.currentPin,
      ip,
      port: this.port,
      url: `https://${ip}:${this.port}/?session=${this.currentSessionToken}&pin=${this.currentPin}`
    };
  }

  stop() {
    if (this.wss) this.wss.close();
    if (this.httpsServer) this.httpsServer.close();
    if (this.httpServer) this.httpServer.close();
    this.sessions.clear();
  }
}

module.exports = MirrorServer;
