export interface Account {
  id: string;
  sessionId: string;
  name: string;
  phone: string;
  status: "disconnected" | "connecting" | "waiting_scan" | "authenticated" | "connected" | "failed";
  health: number;
  pushname?: string;
  platform?: string;
  connectedAt?: string;
  messagesSent?: number;
}

export interface Group {
  id: string;
  name: string;
  participantCount: number;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  description?: string;
  unreadCount?: number;
  timestamp?: number;
  lastMessage?: string;
  adminCount?: number;
  selected: boolean;
  participants?: GroupMember[];
}

export interface GroupMember {
  id: string;
  number: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  subscriberCount: number;
  isAdmin: boolean;
  isOwner?: boolean;
  verified?: boolean;
  selected: boolean;
  category?: string;
}

export interface Contact {
  phone: string;
  name: string;
  var1?: string;
  var2?: string;
  var3?: string;
}

export interface BulkSendProgress {
  campaignId: string;
  sent: number;
  failed: number;
  total: number;
  current?: string;
  status?: string;
  error?: string;
}

export interface SessionStatus {
  sessionId: string;
  status: string;
  qr?: string | null;
  qrDataURL?: string | null;
  info?: {
    pushname?: string;
    phone?: string;
    platform?: string;
    wid?: string;
    connectedAt?: string;
  } | null;
  retryCount?: number;
  createdAt?: string;
  connectedAt?: string;
  messagesSent?: number;
}

export type TabId =
  | "dashboard"
  | "accounts"
  | "groups"
  | "channels"
  | "messaging"
  | "analytics";
