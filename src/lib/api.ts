const API_BASE = "/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Sessions ──────────────────────────────────────
export function getHealth() {
  return request<{
    status: string;
    version: string;
    uptime: number;
    sessions: { total: number; connected: number; list: Array<{ id: string; status: string; phone: string | null; pushname: string | null }> };
    memory: { heapUsed: number; heapTotal: number };
  }>("/health");
}

export function getSessions() {
  return request<{ success: boolean; sessions: Array<{ id: string; status: string; phone: string | null; pushname: string | null; messagesSent: number }> }>("/sessions");
}

export function createSession(phone?: string, name?: string) {
  return request<{ success: boolean; sessionId: string; wsUrl: string }>("/session/create", {
    method: "POST",
    body: JSON.stringify({ phone, name }),
  });
}

export function getSessionStatus(sessionId: string) {
  return request<{
    sessionId: string;
    status: string;
    qr: string | null;
    qrDataURL: string | null;
    info: { pushname?: string; phone?: string; platform?: string } | null;
    messagesSent: number;
    connectedAt?: string;
  }>(`/session/status/${sessionId}`);
}

export function getSessionQR(sessionId: string) {
  return request<{
    status: string;
    qr?: string | null;
    qrDataURL?: string | null;
    info?: { pushname?: string; phone?: string } | null;
  }>(`/session/qr/${sessionId}`);
}

export function refreshSession(sessionId: string) {
  return request<{ success: boolean }>(`/session/refresh/${sessionId}`, { method: "POST" });
}

export function logoutSession(sessionId: string) {
  return request<{ success: boolean }>(`/session/logout/${sessionId}`, { method: "POST" });
}

export function deleteSession(sessionId: string) {
  return request<{ success: boolean }>(`/session/${sessionId}`, { method: "DELETE" });
}

// ─── Groups ────────────────────────────────────────
export function getGroups(sessionId: string) {
  return request<{ success: boolean; count: number; groups: Array<import("../types").Group> }>(
    `/session/${sessionId}/groups`
  );
}

export function getGroupMembers(sessionId: string, groupId: string) {
  return request<{
    success: boolean;
    groupId: string;
    groupName: string;
    memberCount: number;
    members: Array<import("../types").GroupMember>;
  }>(`/session/${sessionId}/group/${groupId}/members`);
}

export function getGroupInviteLink(sessionId: string, groupId: string) {
  return request<{ success: boolean; inviteLink: string }>(`/session/${sessionId}/group/${groupId}/invite-link`);
}

// ─── Channels ──────────────────────────────────────
export function getChannels(sessionId: string) {
  return request<{ success: boolean; count: number; channels: Array<import("../types").Channel> }>(
    `/session/${sessionId}/channels`
  );
}

// ─── Messaging ─────────────────────────────────────
export function sendMessage(sessionId: string, to: string, message: string) {
  return request<{ success: boolean; to: string }>(`/session/${sessionId}/send`, {
    method: "POST",
    body: JSON.stringify({ to, message }),
  });
}

export function sendBulk(
  sessionId: string,
  contacts: Array<import("../types").Contact>,
  messageTemplate: string,
  options?: {
    minDelay?: number;
    maxDelay?: number;
    batchSize?: number;
    batchPauseSeconds?: number;
    spintaxEnabled?: boolean;
    invisibleCharsEnabled?: boolean;
  }
) {
  return request<{ success: boolean; campaignId: string; total: number }>(`/session/${sessionId}/send-bulk`, {
    method: "POST",
    body: JSON.stringify({ contacts, messageTemplate, ...options }),
  });
}

export function sendToGroups(
  sessionId: string,
  groupIds: string[],
  message: string,
  options?: { minDelay?: number; maxDelay?: number }
) {
  return request<{ success: boolean; campaignId: string; total: number }>(`/session/${sessionId}/group/send`, {
    method: "POST",
    body: JSON.stringify({ groupIds, message, ...options }),
  });
}

export function addMembersToGroup(
  sessionId: string,
  groupId: string,
  phones: string[]
) {
  return request<{ success: boolean; total: number }>(`/session/${sessionId}/group/add`, {
    method: "POST",
    body: JSON.stringify({ groupId, phones }),
  });
}

export function joinGroup(sessionId: string, inviteCode: string) {
  return request<{ success: boolean; groupId: string }>(`/session/${sessionId}/group/join`, {
    method: "POST",
    body: JSON.stringify({ inviteCode }),
  });
}

// ─── Contacts ──────────────────────────────────────
export function getContacts(sessionId: string) {
  return request<{
    success: boolean;
    count: number;
    contacts: Array<{ id: string; phone: string; name: string; isBlocked: boolean }>;
  }>(`/session/${sessionId}/contacts`);
}

// ─── Polls ─────────────────────────────────────────
export function sendPoll(
  sessionId: string,
  groupId: string,
  question: string,
  options: string[],
  allowMultiple?: boolean
) {
  return request<{ success: boolean; type: string }>(`/session/${sessionId}/send-poll`, {
    method: "POST",
    body: JSON.stringify({ groupId, question, options, allowMultiple }),
  });
}
