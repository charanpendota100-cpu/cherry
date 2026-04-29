type WSCallback = (data: Record<string, unknown>) => void;

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Map<string, Set<WSCallback>>();

function getWsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}`;
}

export function connectWS(sessionId?: string) {
  if (socket && socket.readyState === WebSocket.OPEN) return;

  const url = sessionId ? `${getWsUrl()}?sessionId=${sessionId}` : getWsUrl();
  socket = new WebSocket(url);

  socket.onopen = () => {
    emit("ws_connected", {});
  };

  socket.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      const event = (data.event as string) || "unknown";
      emit(event, data);
      emit("*", data);
    } catch {
      // ignore malformed messages
    }
  };

  socket.onclose = () => {
    emit("ws_disconnected", {});
    socket = null;
    reconnectTimer = setTimeout(() => connectWS(sessionId), 3000);
  };

  socket.onerror = () => {
    socket?.close();
  };
}

export function disconnectWS() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.close();
    socket = null;
  }
}

export function subscribeSession(sessionId: string) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "subscribe", sessionId }));
  }
}

export function onWS(event: string, cb: WSCallback) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(cb);
  return () => listeners.get(event)?.delete(cb);
}

function emit(event: string, data: Record<string, unknown>) {
  listeners.get(event)?.forEach((cb) => {
    try { cb(data); } catch { /* noop */ }
  });
}
