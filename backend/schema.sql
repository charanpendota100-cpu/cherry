-- WhatsApp Automation Pro - Database Schema

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    label TEXT,
    phone TEXT,
    pushname TEXT,
    status TEXT,
    last_seen INTEGER
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    job_id TEXT,
    message_id TEXT,
    recipient TEXT,
    message TEXT,
    media_url TEXT,
    status TEXT,
    sent_at INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT UNIQUE,
    session_id TEXT,
    total INTEGER DEFAULT 0,
    sent INTEGER DEFAULT 0,
    failed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    created_at INTEGER,
    completed_at INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE TABLE IF NOT EXISTS analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    event_type TEXT,
    data TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
