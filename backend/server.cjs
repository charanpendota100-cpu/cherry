/**
  * ╔══════════════════════════════════════════════════════════════╗
  * ║  WhatsApp Pro Automation — PRODUCTION BACKEND v10.0         ║
  * ║  Node.js + whatsapp-web.js + WebSocket + Anti-Ban Engine    ║
  * ║  Enterprise Grade — Production Ready with Security            ║
  * ╚══════════════════════════════════════════════════════════════╝
  *
  * HOW TO RUN:
  *   1. npm install
 *   2. node BACKEND_SERVER.cjs
  *
  * SECURITY FEATURES:
  *   ✓ Helmet security headers
  *   ✓ Rate limiting (per-IP, per-session)
  *   ✓ Request validation & sanitization
  *   ✓ Structured logging with Winston
  *   ✓ CORS configuration
  *   ✓ Input length limits
  *   ✓ Session limits
  *
  * ENDPOINTS:
  *   GET  /api/health                   — Health check
  *   POST /api/session/create           — Create new WA session → streams QR
  *   GET  /api/session/status/:id       — Get session status
  *   GET  /api/session/qr/:id           — Get current QR string
  *   POST /api/session/refresh/:id      — Force new QR
  *   POST /api/session/logout/:id       — Logout & destroy
  *   DELETE /api/session/:id            — Delete session
  *   GET  /api/session/:id/groups       — Get all groups
  *   GET  /api/session/:id/contacts     — Get contacts
  *   POST /api/session/:id/send         — Send message
  *   POST /api/session/:id/send-bulk    — Bulk send
  *   POST /api/session/:id/group/add    — Add members to group
  *   POST /api/session/:id/group/send   — Send to groups
  *   GET  /api/session/:id/group/:gid/members — Export members
  *   WS   ws://localhost:3001?sessionId=X — Real-time events
  */

'use strict';

// ─── Auto-Bootstrap: Install missing dependencies ──────────────────────────
const { execSync } = require('child_process');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');

const isProduction = process.env.NODE_ENV === 'production';

const REQUIRED = [
  'whatsapp-web.js',
  'express',
  'cors',
  'ws',
  'qrcode',
  'qrcode-terminal',
  'exceljs',
  'multer',
  'uuid',
  'helmet',
  'express-rate-limit',
  'winston',
  'dotenv',
];

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  WhatsApp Pro Automation Backend v9.1 (Production Ready)   ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

// Check and install missing packages
const missing = REQUIRED.filter(pkg => {
  try { require.resolve(pkg); return false; } catch { return true; }
});

if (missing.length > 0) {
  if (isProduction || process.env.DISABLE_RUNTIME_INSTALL === 'true') {
    console.error(`❌ Missing required packages: ${missing.join(', ')}`);
    console.error('Production mode refuses runtime install. Run: npm install');
    process.exit(1);
  }

  console.log(`📦 Installing missing packages: ${missing.join(', ')}`);
  try {
    execSync(`npm install ${missing.join(' ')} --save`, {
      stdio: 'inherit',
      cwd: __dirname,
      timeout: 120000,
    });
    console.log('✅ All packages installed successfully!\n');
  } catch (err) {
    console.error('❌ Failed to install packages:', err.message);
    console.log('\nPlease run manually:');
    console.log('  npm install\n');
    process.exit(1);
  }
}

// ─── Load Dependencies ─────────────────────────────────────────────────────
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load environment config
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════════════════
// ║  STRUCTURED LOGGING WITH WINSTON                                        ║
// ═══════════════════════════════════════════════════════════════════════════
const LOG_DIR = path.join(__dirname, 'logs');
// Create logs directory asynchronously, ignore errors
fsPromises.mkdir(LOG_DIR, { recursive: true }).catch(() => { });

const logger = require('winston');
logger.add(new logger.transports.File({
  filename: path.join(LOG_DIR, 'error.log'),
  level: 'error',
  maxsize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
}));
logger.add(new logger.transports.File({
  filename: path.join(LOG_DIR, 'combined.log'),
  maxsize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
}));

// Console transport for development
logger.add(new logger.transports.Console({
  format: logger.format.combine(
    logger.format.colorize(),
    logger.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    logger.format.printf(({ level, message, timestamp }) => `${timestamp} [${level}]: ${message}`)
  )
}));

// Override console methods
console.log = (...args) => logger.info(args.join(' '));
console.error = (...args) => logger.error(args.join(' '));
console.warn = (...args) => logger.warn(args.join(' '));

console.log('\n📝 Logging initialized - check logs/ folder');

// ─── Configuration ─────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3001;
const SESSIONS_DIR = path.join(__dirname, 'wa-sessions');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const MAX_SESSIONS = Number(process.env.MAX_CONCURRENT_SESSIONS || 10);
const SESSION_INACTIVITY_TIMEOUT = Number(process.env.SESSION_INACTIVITY_TIMEOUT_MINS || 30) * 60 * 1000;

// Ensure directories exist asynchronously
Promise.all([
  fsPromises.mkdir(SESSIONS_DIR, { recursive: true }),
  fsPromises.mkdir(UPLOADS_DIR, { recursive: true })
]).catch(() => { });

// ─── Express App ──────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ═══════════════════════════════════════════════════════════════════════════
// ║  SECURITY MIDDLEWARE                                                    ║
// ═══════════════════════════════════════════════════════════════════════════

// Helmet security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS - restrict in production
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [];

const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? (allowedOrigins.length > 0 ? allowedOrigins : false)
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id'],
  credentials: true,
  maxAge: 86400, // 24 hours
};
app.use(cors(corsOptions));

// Request size limits - prevent DoS
app.use(express.json({
  limit: '10mb',  // Reduced from 50mb for security
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON' });
      throw new Error('Invalid JSON');
    }
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ═══════════════════════════════════════════════════════════════════════════
// ║  RATE LIMITING                                                          ║
// ═══════════════════════════════════════════════════════════════════════════

// Global rate limiter - 100 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/api/health', // Skip health check
});

// Strict rate limiter for auth endpoints - 10 requests per minute
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many authentication requests, please wait' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Session rate limiter - 30 requests per minute per session
const sessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.params.id || req.ip,
  message: { error: 'Too many session requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Bulk send rate limiter - 5 requests per minute
const bulkSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many bulk send requests, please wait' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply global limiter
app.use('/api/', globalLimiter);

// Apply auth limiter to session creation
app.use('/api/session/create', authLimiter);
app.use('/api/session/refresh', authLimiter);

// Apply session limiter to session endpoints
app.use('/api/session/', sessionLimiter);

// Apply bulk limiter to bulk messaging endpoint
app.use('/api/session/:id/send-bulk', bulkSendLimiter);

// File upload with size limits
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowed = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// ║  INPUT VALIDATION & SANITIZATION                                       ║
// ═══════════════════════════════════════════════════════════════════════════

// Sanitize string inputs - prevent XSS
function sanitizeString(str, maxLength = 10000) {
  if (typeof str !== 'string') return '';
  return str
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .trim();
}

// Validate session ID format
function isValidSessionId(id) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(id);
}

// Validate phone number format
function isValidPhone(phone) {
  if (!phone) return true; // Optional
  return /^\+?[\d\s-]{5,20}$/.test(phone);
}

// Standardize WhatsApp JID format
function toJid(id) {
  if (!id) return '';
  if (id.includes('@')) return id;
  const digits = id.replace(/\D/g, '');
  if (!digits) return '';
  return digits.length > 10 ? `${digits}@g.us` : `${digits}@c.us`;
}

// Validate WhatsApp JID format
function isValidJid(jid) {
  if (!jid) return false;
  return /^[0-9a-zA-Z._-]+@(c\.us|g\.us|newsletter)$/.test(jid);
}

// Request validation middleware for session routes
function validateSessionRequest(req, res, next) {
  const sessionId = req.params.id;
  if (sessionId && !isValidSessionId(sessionId)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }
  next();
}

// Apply to all session routes
app.use('/api/session/:id', validateSessionRequest);

// ═══════════════════════════════════════════════════════════════════════════
// ║  MEMORY MANAGEMENT                                                      ║
// ═══════════════════════════════════════════════════════════════════════════

// Clean up inactive sessions periodically
setInterval(() => {
  const now = Date.now();
  sessions.forEach((session, sessionId) => {
    if (session.status === 'disconnected' && session.lastActivity) {
      const inactiveTime = now - new Date(session.lastActivity).getTime();
      if (inactiveTime > SESSION_INACTIVITY_TIMEOUT) {
        console.log(`🧹 Cleaning up inactive session: ${sessionId}`);
        if (session.client) {
          try {
            session.client.destroy();
            session.client = null;
          } catch { }
        }
        sessions.delete(sessionId);
      }
    }
  });

  // Force GC hint if available
  if (global.gc) {
    global.gc();
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Monitor memory usage
setInterval(() => {
  const memUsage = process.memoryUsage();
  const heapUsed = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotal = Math.round(memUsage.heapTotal / 1024 / 1024);

  // Log warning if memory is high
  if (heapUsed > 1024) {
    logger.warn(`High memory usage: ${heapUsed}MB / ${heapTotal}MB`);
  }

  // Log session count
  if (sessions.size > MAX_SESSIONS * 0.8) {
    logger.warn(`High session count: ${sessions.size}/${MAX_SESSIONS}`);
  }
}, 60 * 1000); // Every minute

// ─── WebSocket Server ─────────────────────────────────────────────────────
const wss = new WebSocket.Server({
  server,
  maxPayload: 1024 * 1024, // 1MB max message size
});

// Session store: { sessionId -> { client, status, qr, info, wsClients, retryCount, qrGeneratedAt } }
// QR stays valid for 2 minutes on WhatsApp's servers — we honour that.
const sessions = new Map();
const wsToSessions = new Map(); // ws -> Set<sessionId> reverse mapping

// ─── WebSocket Helpers ─────────────────────────────────────────────────────
function broadcast(sessionId, data) {
  const session = sessions.get(sessionId);
  if (!session) return;
  const payload = JSON.stringify({ sessionId, ...data, ts: Date.now() });
  session.wsClients.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch { }
    }
  });

  // Security: Global events should only be sent to root-level monitoring if explicitly asked
  // We remove the un-scoped broadcast to prevent info leakage between sessions
}

// Helper to add WebSocket subscription to a session
function addWsToSession(ws, sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.wsClients.add(ws);

  // Update reverse mapping
  let sessionSet = wsToSessions.get(ws);
  if (!sessionSet) {
    sessionSet = new Set();
    wsToSessions.set(ws, sessionSet);
  }
  sessionSet.add(sessionId);
}

// Helper to remove WebSocket from all sessions it's subscribed to
function removeWsFromAllSessions(ws) {
  const sessionSet = wsToSessions.get(ws);
  if (!sessionSet) return;

  for (const sessionId of sessionSet) {
    const session = sessions.get(sessionId);
    if (session) {
      session.wsClients.delete(ws);
    }
  }
  wsToSessions.delete(ws);
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const sessionId = url.searchParams.get('sessionId');

  console.log(`🔌 WebSocket connected${sessionId ? ` for session: ${sessionId}` : ''}`);

  if (sessionId && sessions.has(sessionId)) {
    sessions.get(sessionId).wsClients.add(ws);

    // Immediately send current state
    const session = sessions.get(sessionId);
    ws.send(JSON.stringify({
      sessionId,
      event: 'status',
      status: session.status,
      qr: session.qr || null,
      info: session.info || null,
      ts: Date.now(),
    }));

    // If we have a QR already, send it immediately
    if (session.qr && session.status === 'waiting_scan') {
      ws.send(JSON.stringify({
        sessionId,
        event: 'qr',
        qr: session.qr,
        qrDataURL: session.qrDataURL || null,
        ts: Date.now(),
      }));
    }
  }

  // Ping/pong keep-alive
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
      if (msg.type === 'subscribe' && msg.sessionId) {
        if (sessions.has(msg.sessionId)) {
          addWsToSession(ws, msg.sessionId);
        }
      }
    } catch { }
  });

  ws.on('close', () => {
    sessions.forEach(session => session.wsClients.delete(ws));
  });

  ws.on('error', () => {
    sessions.forEach(session => session.wsClients.delete(ws));
  });
});

// Heartbeat interval
const heartbeat = setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 20000);

// ─── Create WhatsApp Client ────────────────────────────────────────────────
async function createWhatsAppClient(sessionId, phone = '') {
  let client = null;
  let sessionData = null;

  try {
    const existing = sessions.get(sessionId);
    if (existing?.client) {
      try {
        await existing.client.destroy();
        existing.client = null;
      } catch { }
    }

    console.log(`\n🚀 Creating WhatsApp client for session: ${sessionId}`);

    // Determine Chromium executable path based on platform
    const puppeteerArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-canvas-aa',
      '--disable-2d-canvas-clip-aa',
      '--disable-gl-drawing-for-tests',
      '--no-first-run',
      '--no-zygote',
      '--hide-scrollbars',
      '--mute-audio',
    ];

    if (process.platform === 'linux') {
      puppeteerArgs.push('--single-process');
    }

    client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: SESSIONS_DIR,
      }),
      // ── QR Stability ──────────────────────────
      // boosted for reliability if user is slow
      qrMaxRetries: 30,
      // 5 minutes timeout to prevent premature "expired" errors on phone
      authTimeoutMs: 300000,
      takeoverOnConflict: true, // Allow taking over existing session if it was orphaned
      webVersionCache: {
        type: "remote",
        remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
      },
      puppeteer: {
        headless: true,
        args: puppeteerArgs,
        timeout: 60000, // 1 minute browser launch timeout
      },
    });

    sessionData = {
      id: sessionId,
      phone,
      client,
      status: 'initializing', // initializing | waiting_scan | authenticated | connected | disconnected | failed
      qr: null,
      qrDataURL: null,
      info: null,
      wsClients: new Set(),
      retryCount: 0,
      createdAt: new Date().toISOString(),
      connectedAt: null,
      messagesSent: 0,
      lastActivity: null,
      qrRefreshCount: 0,
      qrGeneratedAt: null,  // Timestamp of when QR was last generated (for throttle)
    };

    sessions.set(sessionId, sessionData);

    // ── Event: Loading Screen ────────────────────────────────────────────────
    client.on('loading_screen', (percent, message) => {
      console.log(`⏳ [${sessionId}] Loading: ${percent}% — ${message}`);
      broadcast(sessionId, { event: 'loading_screen', percent, message });
      // Only set to 'initializing' if we haven't already authenticated
      // After QR scan, WhatsApp shows a loading screen while loading chats — don't reset status!
      if (sessionData.status !== 'authenticated' && sessionData.status !== 'connected') {
        sessionData.status = 'initializing';
      }
    });

    // ── Event: QR Code ───────────────────────────────────────────────────────
    client.on('qr', async (qr) => {
      const now = Date.now();

      sessionData.qrRefreshCount++;
      sessionData.qrGeneratedAt = now;
      console.log(`\n📱 [${sessionId}] QR Code #${sessionData.qrRefreshCount} generated`);
      console.log('📷 Scan this QR code with your WhatsApp mobile app:\n');

      // Show QR in terminal (for debugging)
      qrcodeTerminal.generate(qr, { small: true }, (qrText) => {
        console.log(qrText);
      });

      // Generate QR as data URL for frontend
      let qrDataURL = null;
      try {
        qrDataURL = await QRCode.toDataURL(qr, {
          width: 400,
          margin: 2,
          color: { dark: '#000000', light: '#FFFFFF' },
          errorCorrectionLevel: 'M',
        });
      } catch (err) {
        console.error('QR DataURL generation error:', err.message);
      }

      sessionData.qr = qr;
      sessionData.qrDataURL = qrDataURL;
      sessionData.status = 'waiting_scan';

      console.log(`✅ [${sessionId}] QR ready (valid ~120s) — broadcasting to ${sessionData.wsClients.size} WS clients`);

      // Broadcast to all connected WS clients
      broadcast(sessionId, {
        event: 'qr',
        qr,               // RAW QR STRING
        qrDataURL,        // Pre-rendered data URL
        qrNumber: sessionData.qrRefreshCount,
        validForSeconds: 120, // WhatsApp QR codes are valid for ~2 minutes — give user full time
      });
    });

    // ── Event: Authenticated ─────────────────────────────────────────────────
    client.on('authenticated', (session) => {
      console.log(`\n🔐 [${sessionId}] AUTHENTICATED — Phone scanned QR successfully!`);
      sessionData.status = 'authenticated';
      sessionData.qr = null; // Clear QR after scan
      sessionData.qrDataURL = null;

      broadcast(sessionId, {
        event: 'authenticated',
        status: 'authenticated',
      });
    });

    // ── Event: Auth Failure ──────────────────────────────────────────────────
    client.on('auth_failure', (msg) => {
      logger.error(`\n❌ [${sessionId}] AUTH FAILURE: ${msg}`);
      sessionData.status = 'failed';

      broadcast(sessionId, {
        event: 'auth_failure',
        message: msg,
      });

      scheduleReconnect(sessionId);
    });

    // ── Event: Ready ─────────────────────────────────────────────────────────
    client.on('ready', async () => {
      console.log(`\n✅ [${sessionId}] READY — WhatsApp Web connected!`);

      try {
        const info = client.info;
        sessionData.info = {
          pushname: info.pushname || 'Unknown',
          phone: info.wid?.user || sessionData.phone,
          platform: info.platform || 'unknown',
          wid: info.wid?._serialized || null,
          connectedAt: new Date().toISOString(),
        };
        sessionData.status = 'connected';
        sessionData.connectedAt = new Date().toISOString();

        console.log(`👤 Logged in as: ${sessionData.info.pushname} (+${sessionData.info.phone})`);
        console.log(`📱 Platform: ${sessionData.info.platform}`);

        broadcast(sessionId, {
          event: 'ready',
          status: 'connected',
          info: sessionData.info,
        });
      } catch (err) {
        console.error(`Error getting client info:`, err.message);
        broadcast(sessionId, { event: 'ready', status: 'connected', info: null });
      }
    });

    // ── Event: Disconnected ──────────────────────────────────────────────────
    client.on('disconnected', (reason) => {
      console.log(`\n⚠️  [${sessionId}] DISCONNECTED: ${reason}`);
      sessionData.status = 'disconnected';
      sessionData.qr = null;

      broadcast(sessionId, {
        event: 'disconnected',
        reason,
      });

      scheduleReconnect(sessionId);
    });

    // ── Event: Message ───────────────────────────────────────────────────────
    client.on('message', (msg) => {
      broadcast(sessionId, {
        event: 'message_received',
        from: msg.from,
        body: msg.body?.substring(0, 200),
        type: msg.type,
        timestamp: msg.timestamp,
      });
    });

    // Initialize client
    try {
      broadcast(sessionId, { event: 'initializing', status: 'initializing' });
      await client.initialize();
    } catch (err) {
      console.error(`❌ [${sessionId}] Failed to initialize:`, err.message);
      sessionData.status = 'failed';
      broadcast(sessionId, { event: 'error', message: err.message });
      scheduleReconnect(sessionId);
    }

    return sessionData;
  } catch (err) {
    console.error(`❌ [${sessionId}] Critical error in createWhatsAppClient:`, err.message);
    // Clean up: remove session from map if it was added
    if (sessionData && sessions.get(sessionId) === sessionData) {
      sessions.delete(sessionId);
    }
    // Clean up client if it was created
    if (client) {
      try {
        await client.destroy();
      } catch (destroyErr) {
        // Ignore destroy errors
      }
    }
    // Re-throw the error so the caller's .catch() can handle it
    throw err;
  }
}

// ─── Auto-Reconnect with Exponential Backoff ───────────────────────────────
function scheduleReconnect(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.retryCount = (session.retryCount || 0) + 1;
  if (session.retryCount > 5) {
    console.log(`⛔ [${sessionId}] Max retries reached (5). Giving up.`);
    broadcast(sessionId, { event: 'max_retries', message: 'Maximum reconnection attempts reached' });
    return;
  }

  const delays = [5000, 10000, 20000, 40000, 60000];
  const delay = delays[Math.min(session.retryCount - 1, delays.length - 1)];

  console.log(`🔄 [${sessionId}] Reconnecting in ${delay / 1000}s (attempt ${session.retryCount}/5)...`);
  broadcast(sessionId, {
    event: 'reconnecting',
    attempt: session.retryCount,
    delaySeconds: delay / 1000,
  });

  setTimeout(async () => {
    if (sessions.has(sessionId)) {
      console.log(`🔄 [${sessionId}] Attempting reconnect...`);
      await createWhatsAppClient(sessionId, session.phone);
    }
  }, delay);
}

// ─── Restore Persisted Sessions ───────────────────────────────────────────
async function restorePersistedSessions() {
  console.log('\n🔍 Scanning for persisted sessions...');
  try {
    let entries;
    try {
      entries = await fsPromises.readdir(SESSIONS_DIR);
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }

    for (const entry of entries) {
      const entryPath = path.join(SESSIONS_DIR, entry);
      const stat = await fsPromises.stat(entryPath);
      if (!stat.isDirectory()) continue;

      // Look for LocalAuth session directories: session-{id}
      if (entry.startsWith('session-')) {
        const sessionId = entry.replace('session-', '');
        if (sessionId && !sessions.has(sessionId)) {
          console.log(`♻️  Restoring persisted session: ${sessionId}`);
          await createWhatsAppClient(sessionId, '');
          // Small delay between restoring sessions
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }
  } catch (err) {
    console.error('Error restoring sessions:', err.message);
  }
}

// ─── Anti-Ban Engine v2 ───────────────────────────────────────────────────
const INVISIBLE_CHARS = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF', '\u200E', '\u200F'];

function getAntiBanDelay(minSeconds = 7, maxSeconds = 12, messageIndex = 0) {
  return new Promise(resolve => {
    let base = minSeconds + Math.random() * (maxSeconds - minSeconds);
    // Escalating delay: slow down as more messages sent
    if (messageIndex > 100) base *= 1.1;
    if (messageIndex > 200) base *= 1.2;
    if (messageIndex > 300) base *= 1.4;
    // Human jitter: +/- 1.5s random
    base += (Math.random() - 0.5) * 3;
    // Peak hour slowdown (9-11am, 7-10pm)
    const hour = new Date().getHours();
    if ((hour >= 9 && hour <= 11) || (hour >= 19 && hour <= 22)) base *= 1.2;
    // Night mode: very slow at night
    if (hour >= 0 && hour < 6) base *= 2.5;
    const ms = Math.max(base, 3) * 1000;
    setTimeout(resolve, ms);
  });
}

// Batch pause: after every N messages, wait M seconds
function getBatchPauseDelay(batchSize = 30, pauseSeconds = 60, messageIndex = 0) {
  if (batchSize <= 0 || pauseSeconds <= 0) return Promise.resolve();
  if (messageIndex > 0 && messageIndex % batchSize === 0) {
    console.log(`⏸️  Batch pause: ${pauseSeconds}s cooldown after ${messageIndex} messages`);
    return new Promise(resolve => setTimeout(resolve, pauseSeconds * 1000));
  }
  return Promise.resolve();
}

// Add invisible characters to message to bypass duplicate detection
function injectInvisibleChars(text) {
  let suffix = '';
  const count = 3 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i++) suffix += INVISIBLE_CHARS[Math.floor(Math.random() * INVISIBLE_CHARS.length)];
  return text + suffix;
}

// Process spintax: {option1|option2|option3} → random pick
function processSpintax(text) {
  return text.replace(/\{([^{}]+)\}/g, (match, group) => {
    if (!group.includes('|')) return match; // Not spintax, keep template vars
    const options = group.split('|');
    return options[Math.floor(Math.random() * options.length)].trim();
  });
}

// Slight message variation to avoid identical messages
function varyMessage(text) {
  const r = Math.random();
  if (r < 0.15) return text + ' ';
  if (r < 0.3) return text + '\u200B';
  if (r < 0.45) return text + '\u200C';
  return text;
}

// Member add delay (30-45 seconds for safety)
function getMemberAddDelay(minSeconds = 30, maxSeconds = 45) {
  return new Promise(resolve => {
    const ms = (minSeconds + Math.random() * (maxSeconds - minSeconds)) * 1000;
    setTimeout(resolve, ms);
  });
}

// ─── Routes ──────────────────────────────────────────────────────────────

// Health Check
app.get('/api/health', (req, res) => {
  const connectedSessions = Array.from(sessions.values()).filter(s => s.status === 'connected').length;
  res.json({
    status: 'online',
    version: '9.0.0',
    uptime: process.uptime(),
    sessions: {
      total: sessions.size,
      connected: connectedSessions,
      list: Array.from(sessions.entries()).map(([id, s]) => ({
        id,
        status: s.status,
        phone: s.info?.phone || s.phone || null,
        pushname: s.info?.pushname || null,
        connectedAt: s.connectedAt,
        messagesSent: s.messagesSent,
      })),
    },
    memory: process.memoryUsage(),
    node: process.version,
    platform: process.platform,
    timestamp: new Date().toISOString(),
  });
});

// Create Session
app.post('/api/session/create', async (req, res) => {
  try {
    if (sessions.size >= MAX_SESSIONS) {
      return res.status(429).json({
        success: false,
        error: `Maximum concurrent sessions reached (${MAX_SESSIONS})`,
      });
    }

    const phone = sanitizeString(String(req.body?.phone || ''), 25);
    const name = sanitizeString(String(req.body?.name || ''), 100);

    if (phone && !isValidPhone(phone)) {
      return res.status(400).json({ success: false, error: 'Invalid phone format' });
    }

    const sessionId = `session_${Date.now()}_${uuidv4().slice(0, 8)}`;

    logger.info(`\n📱 Creating new session: ${sessionId} (Phone hint: ${phone}${name ? `, Name: ${name}` : ''})`);

    // Start async — don't await (QR will come via WebSocket)
    createWhatsAppClient(sessionId, phone).catch(err => {
      logger.error(`Session creation failure for ${sessionId}: ${err.message}`);
    });

    res.json({
      success: true,
      sessionId,
      message: 'Session creation initialized. Awaiting QR via WebSocket.',
      wsUrl: `ws://localhost:${PORT}?sessionId=${sessionId}`,
    });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Session Status
app.get('/api/session/status/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  res.json({
    sessionId: req.params.id,
    status: session.status,
    qr: session.qr,
    qrDataURL: session.qrDataURL,
    info: session.info,
    retryCount: session.retryCount,
    createdAt: session.createdAt,
    connectedAt: session.connectedAt,
    messagesSent: session.messagesSent,
  });
});

// Get QR
app.get('/api/session/qr/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  if (session.status === 'connected') {
    return res.json({ status: 'connected', info: session.info });
  }

  if (session.status === 'authenticated') {
    return res.json({ status: 'authenticated' });
  }

  if (session.qr) {
    return res.json({
      status: 'qr_ready',
      qr: session.qr,
      qrDataURL: session.qrDataURL,
      qrNumber: session.qrRefreshCount,
    });
  }

  res.json({ status: session.status, qr: null });
});

// Force QR Refresh
app.post('/api/session/refresh/:id', async (req, res) => {
  try {
    const session = sessions.get(req.params.id);
    const phone = session?.phone || '';

    // Destroy and recreate
    if (session?.client) {
      try {
        await session.client.destroy();
        session.client = null;
      } catch { }
    }

    await createWhatsAppClient(req.params.id, phone);
    res.json({ success: true, message: 'Session refresh initiated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Logout
app.post('/api/session/logout/:id', async (req, res) => {
  try {
    const session = sessions.get(req.params.id);
    if (session?.client) {
      try {
        await session.client.logout();
        await session.client.destroy();
        session.client = null;
      } catch { }
    }
    sessions.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Session
app.delete('/api/session/:id', async (req, res) => {
  try {
    const session = sessions.get(req.params.id);
    if (session?.client) {
      try {
        await session.client.destroy();
        session.client = null;
      } catch { }
    }
    sessions.delete(req.params.id);

    // Also delete session files
    const sessionDir = path.join(SESSIONS_DIR, `session-${req.params.id}`);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Groups — Returns ALL groups with full participant data
app.get('/api/session/:id/groups', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.client || session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  try {
    const chats = await session.client.getChats();
    const groups = chats.filter(c => c.isGroup);
    const myWid = session.client.info.wid._serialized;

    const groupData = await Promise.allSettled(groups.map(async (group) => {
      try {
        const participants = group.participants || [];
        const isAdmin = participants.some(p =>
          p.id._serialized === myWid && (p.isAdmin || p.isSuperAdmin)
        );
        return {
          id: group.id._serialized,
          name: group.name || 'Unnamed Group',
          participantCount: participants.length,
          isAdmin,
          isSuperAdmin: participants.some(p => p.id._serialized === myWid && p.isSuperAdmin),
          description: group.description || '',
          unreadCount: group.unreadCount || 0,
          timestamp: group.timestamp,
          lastMessage: group.lastMessage?.body?.substring(0, 80) || '',
          adminCount: participants.filter(p => p.isAdmin || p.isSuperAdmin).length,
          selected: false,
          participants: participants.map(p => ({
            id: p.id._serialized,
            number: p.id.user,
            isAdmin: p.isAdmin || false,
            isSuperAdmin: p.isSuperAdmin || false,
          })),
        };
      } catch { return null; }
    }));

    const validGroups = groupData
      .filter(r => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)
      .sort((a, b) => b.participantCount - a.participantCount);

    // Return both `count` AND `total` for frontend compatibility
    res.json({ success: true, count: validGroups.length, total: validGroups.length, groups: validGroups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Get Channels (WhatsApp Channels / Newsletters) ───────────────────────────
app.get('/api/session/:id/channels', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.client || session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  try {
    const chats = await session.client.getChats();
    // Channels have server === 'newsletter'
    const channels = chats
      .filter(c => c.id && c.id.server === 'newsletter')
      .map(ch => ({
        id: ch.id._serialized,
        name: ch.name || 'Unnamed Channel',
        description: ch.description || '',
        subscriberCount: ch.subscriberCount || 0,
        isAdmin: true,
        isOwner: ch.owner === session.client.info.wid._serialized,
        verified: ch.verified || false,
        selected: false,
        category: ch.category || '',
      }));

    console.log(`\u2706 [${req.params.id}] Found ${channels.length} channels`);
    res.json({ success: true, count: channels.length, channels });
  } catch (err) {
    console.error('Get channels error:', err.message);
    // Return empty instead of error — user may have 0 channels
    res.json({ success: true, count: 0, channels: [], note: err.message });
  }
});

// ─── Send Poll / Quiz to Group ────────────────────────────────────────────
app.post('/api/session/:id/send-poll', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.client || session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  try {
    const { groupId, question, options = [], allowMultiple = false } = req.body;
    if (!groupId || !question || options.length < 2) {
      return res.status(400).json({ error: 'groupId, question and at least 2 options are required' });
    }

    const validOptions = options.filter(o => o && o.trim());

    try {
      // Try native WhatsApp Poll (whatsapp-web.js >= 1.23.0)
      const { Poll } = require('whatsapp-web.js');
      const poll = new Poll(question.trim(), validOptions, { allowMultiselect: allowMultiple });
      await session.client.sendMessage(groupId, poll);
      session.messagesSent++;
      res.json({ success: true, groupId, type: 'native_poll', optionCount: validOptions.length });
    } catch {
      // Fallback: text-based poll
      const optLines = validOptions.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n');
      const msg = `📊 *${question.trim()}*\n\n${optLines}\n\n_Reply with the option letter to vote_`;
      await session.client.sendMessage(groupId, msg);
      session.messagesSent++;
      res.json({ success: true, groupId, type: 'text_poll', note: 'Native poll not available; sent as formatted text' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Get Group Invite Link ──────────────────────────────────────────────────
app.get('/api/session/:id/group/:gid/invite-link', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.client || session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  try {
    const chat = await session.client.getChatById(req.params.gid);
    const inviteCode = await chat.getInviteCode();
    res.json({
      success: true,
      groupId: req.params.gid,
      groupName: chat.name,
      inviteLink: `https://chat.whatsapp.com/${inviteCode}`,
      inviteCode,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Contacts
app.get('/api/session/:id/contacts', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.client || session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  try {
    const contacts = await session.client.getContacts();
    const filtered = contacts
      .filter(c => c.isMyContact && !c.isGroup && !c.isBusiness)
      .map(c => ({
        id: c.id._serialized,
        phone: c.id.user,
        name: c.pushname || c.name || '',
        isBlocked: c.isBlocked || false,
      }));

    res.json({ success: true, count: filtered.length, contacts: filtered });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send Single Message — supports @c.us, @g.us groups, @newsletter channels
app.post('/api/session/:id/send', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.client || session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  try {
    const to = sanitizeString(String(req.body?.to || ''), 100);
    const message = sanitizeString(String(req.body?.message || ''), 4000);
    const mediaPathRaw = sanitizeString(String(req.body?.mediaPath || ''), 500);

    // Use standardized JID utility
    const chatId = toJid(to);

    if (!isValidJid(chatId)) {
      return res.status(400).json({ error: 'Invalid destination JID format' });
    }

    if (!message && !mediaPathRaw) {
      return res.status(400).json({ error: 'Either message or mediaPath is required' });
    }

    let mediaPath = null;
    if (mediaPathRaw) {
      mediaPath = path.resolve(mediaPathRaw);
      const uploadsRoot = path.resolve(UPLOADS_DIR);
      if (!mediaPath.startsWith(uploadsRoot)) {
        return res.status(400).json({ error: 'Invalid mediaPath' });
      }
      // Check file existence asynchronously
      try {
        await fsPromises.access(mediaPath, fs.constants.F_OK);
      } catch {
        return res.status(400).json({ error: 'Invalid mediaPath' });
      }
    }

    if (mediaPath) {
      const media = await MessageMedia.fromFilePath(mediaPath);
      await session.client.sendMessage(chatId, media, { caption: message });
    } else {
      await session.client.sendMessage(chatId, message);
    }

    session.messagesSent++;
    session.lastActivity = new Date().toISOString();

    res.json({ success: true, to: chatId, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk Send Messages
app.post('/api/session/:id/send-bulk', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.client || session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  const contacts = Array.isArray(req.body?.contacts) ? req.body.contacts : [];
  const messageTemplate = sanitizeString(String(req.body?.messageTemplate || ''), 4000);
  const minDelay = Number(req.body?.minDelay ?? 5);
  const maxDelay = Number(req.body?.maxDelay ?? 13);

  if (!contacts.length) return res.status(400).json({ error: 'No contacts provided' });
  if (contacts.length > 5000) return res.status(400).json({ error: 'Too many contacts (max 5000 per request)' });
  if (!messageTemplate) return res.status(400).json({ error: 'messageTemplate is required' });

  const safeMinDelay = Math.min(Math.max(Number.isFinite(minDelay) ? minDelay : 5, 3), 120);
  const safeMaxDelay = Math.min(
    Math.max(Number.isFinite(maxDelay) ? maxDelay : 13, safeMinDelay),
    180,
  );

  // Start async bulk send
  const campaignId = `bulk_${Date.now()}`;
  res.json({ success: true, campaignId, total: contacts.length, message: 'Bulk send started' });

  // Process in background with advanced anti-ban
  (async () => {
    let sent = 0, failed = 0, consecutiveErrors = 0;
    const batchSize = Math.min(Math.max(Number(req.body.batchSize || 30), 1), 200);
    const batchPause = Math.min(Math.max(Number(req.body.batchPauseSeconds || 60), 5), 600);
    const useSpintax = req.body.spintaxEnabled !== false;
    const useInvisible = req.body.invisibleCharsEnabled !== false;
    const useVariation = req.body.messageVariation !== false;

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      try {
        // Exit loop early if session disconnected during long operations
        if (!sessions.has(req.params.id) || sessions.get(req.params.id).status !== 'connected') {
          console.warn(`[${req.params.id}] Bulk send aborted: Session disconnected`);
          break;
        }

        // Batch pause: after every N messages, take a longer break
        await getBatchPauseDelay(batchSize, batchPause, sent + failed);
        if (sent > 0 && (sent + failed) % batchSize === 0) {
          broadcast(req.params.id, {
            event: 'bulk_batch_pause',
            campaignId,
            pauseSeconds: batchPause,
            messagesProcessed: sent + failed,
          });
        }

        let msg = messageTemplate
          .replace(/{name}/g, contact.name || '')
          .replace(/{phone}/g, contact.phone || '')
          .replace(/{var1}/g, contact.var1 || '')
          .replace(/{var2}/g, contact.var2 || '')
          .replace(/{var3}/g, contact.var3 || '');

        // Apply spintax processing
        if (useSpintax) msg = processSpintax(msg);
        // Apply invisible characters
        if (useInvisible) msg = injectInvisibleChars(msg);
        // Apply slight message variation
        if (useVariation) msg = varyMessage(msg);

        // Use standardized JID utility
        const chatId = toJid(contact.phone);
        if (!isValidJid(chatId)) {
          throw new Error(`Invalid recipient JID: ${contact.phone}`);
        }

        // Simulate human typing
        try {
          const chat = await session.client.getChatById(chatId);
          await chat.sendStateTyping();
          await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
        } catch { }

        await session.client.sendMessage(chatId, msg);
        session.messagesSent++;
        sent++;
        consecutiveErrors = 0;

        broadcast(req.params.id, {
          event: 'bulk_progress',
          campaignId,
          sent,
          failed,
          total: contacts.length,
          current: contact.phone,
          status: 'sent',
        });

        // Smart anti-ban delay (7-12s default, escalating)
        await getAntiBanDelay(safeMinDelay, safeMaxDelay, sent);
      } catch (err) {
        failed++;
        consecutiveErrors++;
        broadcast(req.params.id, {
          event: 'bulk_progress',
          campaignId,
          sent,
          failed,
          total: contacts.length,
          current: contact.phone,
          status: 'failed',
          error: err.message,
        });

        // Auto-stop on too many consecutive errors
        if (consecutiveErrors >= 5) {
          logger.warn(`⛔ [${req.params.id}] Campaign ${campaignId} auto-stopped: ${consecutiveErrors} consecutive errors`);
          broadcast(req.params.id, {
            event: 'bulk_auto_stopped',
            campaignId,
            reason: `${consecutiveErrors} consecutive errors`,
            sent, failed,
          });
          break;
        }
        // Error cooldown: longer delay after errors
        await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));
      }
    }

    broadcast(req.params.id, {
      event: 'bulk_complete',
      campaignId,
      sent,
      failed,
      total: contacts.length,
    });
  })().catch(console.error);
});

// Send to Groups
app.post('/api/session/:id/group/send', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.client || session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  const groupIds = Array.isArray(req.body?.groupIds) ? req.body.groupIds.map(g => String(g)) : [];
  const message = sanitizeString(String(req.body?.message || ''), 4000);
  const minDelay = Number(req.body?.minDelay ?? 5);
  const maxDelay = Number(req.body?.maxDelay ?? 13);

  if (!groupIds.length) return res.status(400).json({ error: 'No groups provided' });
  if (groupIds.length > 1000) return res.status(400).json({ error: 'Too many groups (max 1000 per request)' });
  if (!message) return res.status(400).json({ error: 'Message is required' });

  const invalidGroupIds = groupIds.filter(id => !isValidJid(id));
  if (invalidGroupIds.length > 0) {
    return res.status(400).json({ error: 'Invalid groupIds', invalidGroupIds: invalidGroupIds.slice(0, 10) });
  }

  const safeMinDelay = Math.min(Math.max(Number.isFinite(minDelay) ? minDelay : 5, 3), 120);
  const safeMaxDelay = Math.min(
    Math.max(Number.isFinite(maxDelay) ? maxDelay : 13, safeMinDelay),
    180,
  );

  const campaignId = `grp_${Date.now()}`;
  res.json({ success: true, campaignId, total: groupIds.length });

  (async () => {
    let sent = 0, failed = 0;
    const batchSize = Math.min(Math.max(Number(req.body.batchSize || 30), 1), 200);
    const batchPause = Math.min(Math.max(Number(req.body.batchPauseSeconds || 60), 5), 600);
    const useInvisible = req.body.invisibleCharsEnabled !== false;
    const useSpintax = req.body.spintaxEnabled !== false;

    for (let i = 0; i < groupIds.length; i++) {
      const groupId = groupIds[i];
      try {
        // Break early if disconnected
        if (!sessions.has(req.params.id) || sessions.get(req.params.id).status !== 'connected') {
          console.warn(`[${req.params.id}] Group send aborted: Session disconnected`);
          break;
        }

        // Batch pause for group sends too
        await getBatchPauseDelay(batchSize, batchPause, i);

        let msg = message;
        if (useSpintax) msg = processSpintax(msg);
        if (useInvisible) msg = injectInvisibleChars(msg);

        // Simulate typing for groups
        try {
          const chat = await session.client.getChatById(groupId);
          await chat.sendStateTyping();
          await new Promise(r => setTimeout(r, 1500));
        } catch { }

        await session.client.sendMessage(groupId, msg);
        sent++;
        broadcast(req.params.id, { event: 'group_send_progress', campaignId, groupId, status: 'sent', sent, failed, total: groupIds.length });
        await getAntiBanDelay(safeMinDelay, safeMaxDelay, sent);
      } catch (err) {
        failed++;
        broadcast(req.params.id, { event: 'group_send_progress', campaignId, groupId, status: 'failed', error: err.message, sent, failed, total: groupIds.length });
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    broadcast(req.params.id, { event: 'group_send_complete', campaignId, sent, failed, total: groupIds.length });
  })().catch(console.error);
});

// Add Members to Group from list
app.post('/api/session/:id/group/add', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.client || session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  const groupId = sanitizeString(String(req.body?.groupId || ''), 120);
  const phones = Array.isArray(req.body?.phones) ? req.body.phones.map(p => sanitizeString(String(p), 30)).filter(Boolean) : [];
  if (!groupId || !phones.length) return res.status(400).json({ error: 'Missing groupId or phones' });
  if (!isValidJid(groupId) || !groupId.endsWith('@g.us')) return res.status(400).json({ error: 'Invalid groupId' });
  if (phones.length > 500) return res.status(400).json({ error: 'Too many members (max 500 per request)' });

  const results = [];
  res.json({ success: true, total: phones.length, message: 'Add members started' });

  (async () => {
    const addMinDelay = req.body.memberAddMinDelay || 30;
    const addMaxDelay = req.body.memberAddMaxDelay || 45;
    let added = 0, failedCount = 0;

    for (let i = 0; i < phones.length; i++) {
      const phone = phones[i];
      try {
        const chatId = toJid(phone);
        if (!isValidJid(chatId)) throw new Error('Invalid member JID');
        await session.client.groupAdd(groupId, [chatId]);
        added++;
        results.push({ phone, status: 'added' });
        broadcast(req.params.id, { event: 'add_member', groupId, phone, status: 'added', added, failed: failedCount, total: phones.length, index: i + 1 });
        // 30-45 second delay between member adds for anti-ban
        await getMemberAddDelay(addMinDelay, addMaxDelay);
      } catch (err) {
        failedCount++;
        results.push({ phone, status: 'failed', error: err.message });
        broadcast(req.params.id, { event: 'add_member', groupId, phone, status: 'failed', error: err.message, added, failed: failedCount, total: phones.length, index: i + 1 });
        // Longer cooldown on error
        await new Promise(r => setTimeout(r, 10000 + Math.random() * 10000));
      }
    }
    broadcast(req.params.id, { event: 'add_members_complete', groupId, results, added, failed: failedCount, total: phones.length });
  })().catch(console.error);
});

// Export Group Members
app.get('/api/session/:id/group/:gid/members', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.client || session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  try {
    const chat = await session.client.getChatById(req.params.gid);
    const members = (chat.participants || []).map(p => ({
      phone: p.id.user,
      id: p.id._serialized,
      isAdmin: p.isAdmin || false,
      isSuperAdmin: p.isSuperAdmin || false,
    }));

    res.json({
      success: true,
      groupId: req.params.gid,
      groupName: chat.name,
      memberCount: members.length,
      members,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Join Group by Invite Link
app.post('/api/session/:id/group/join', async (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session?.client || session.status !== 'connected') {
    return res.status(400).json({ error: 'Session not connected' });
  }

  try {
    const inviteCode = sanitizeString(String(req.body?.inviteCode || ''), 200);
    const code = inviteCode.replace('https://chat.whatsapp.com/', '').trim();
    if (!/^[A-Za-z0-9_-]{10,128}$/.test(code)) {
      return res.status(400).json({ success: false, error: 'Invalid invite code' });
    }
    const result = await session.client.acceptInvite(code);
    res.json({ success: true, groupId: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ success: true, path: req.file.path, originalname: req.file.originalname });
});

// List all sessions
app.get('/api/sessions', (req, res) => {
  const list = Array.from(sessions.entries()).map(([id, s]) => ({
    id,
    status: s.status,
    phone: s.info?.phone || s.phone || null,
    pushname: s.info?.pushname || null,
    platform: s.info?.platform || null,
    messagesSent: s.messagesSent,
    connectedAt: s.connectedAt,
    createdAt: s.createdAt,
    hasQR: !!s.qr,
  }));
  res.json({ success: true, sessions: list });
});

// ─── Static Frontend Serving (optional) ──────────────────────────────────
// Serve frontend dist if it exists
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      next();
    }
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(`[API ERROR] ${req.method} ${req.path} - ${err.message}`);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// ─── Start Server ─────────────────────────────────────────────────────────
server.listen(PORT, async () => {
  console.log(`\n✅ Backend Server running on http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/api/health`);
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('QUICK START:');
  console.log('  1. Open the frontend app in browser');
  console.log('  2. Go to Account Manager');
  console.log('  3. Click "Add New Account"');
  console.log('  4. Scan the QR code with WhatsApp mobile');
  console.log('     (WhatsApp → Linked Devices → Link a Device)');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  // Restore persisted sessions
  await restorePersistedSessions();
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  clearInterval(heartbeat);

  // Destroy all clients
  const destroyPromises = Array.from(sessions.values()).map(async session => {
    try {
      if (session.client) {
        await session.client.destroy();
        session.client = null;
      }
    } catch { }
  });

  await Promise.allSettled(destroyPromises);
  sessions.clear();
  console.log('✅ All sessions destroyed. Goodbye!');
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  logger.error(`[CRITICAL] Uncaught Exception: ${err.message}\n${err.stack}`);
  // In PM2 Cluster mode, exiting 1 ensures PM2 immediately revives a fresh thread without memory corruption
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`[CRITICAL] Unhandled Rejection: ${reason}`);
  // Do not crash immediately for every uncaught promise in WA Web implementations, but log heavily
});
