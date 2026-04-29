import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  Wifi,
  WifiOff,
  QrCode,
  Loader2,
  LogOut,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAppStore } from "../store";
import {
  createSession,
  deleteSession,
  getSessionStatus,
  logoutSession,
  refreshSession,
} from "../lib/api";
import { connectWS, onWS, subscribeSession } from "../lib/ws";
import { cn } from "../lib/utils";

export function AccountManager() {
  const { accounts, addAccount, updateAccount, removeAccount, setActiveSessionId } =
    useAppStore();
  const [qrData, setQrData] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const pollTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const startPolling = useCallback(
    (sessionId: string) => {
      if (pollTimers.current.has(sessionId)) return;
      const timer = setInterval(async () => {
        try {
          const data = await getSessionStatus(sessionId);
          const account = accounts.find((a) => a.sessionId === sessionId);
          if (!account) return;

          updateAccount(account.id, {
            status: data.status as typeof account.status,
            pushname: data.info?.pushname,
            phone: data.info?.phone || account.phone,
            messagesSent: data.messagesSent,
            connectedAt: data.connectedAt ?? undefined,
            health: data.status === "connected" ? 100 : data.status === "waiting_scan" ? 50 : 25,
          });

          if (data.qrDataURL) {
            setQrData((prev) => ({ ...prev, [sessionId]: data.qrDataURL! }));
          }

          if (data.status === "connected") {
            clearInterval(timer);
            pollTimers.current.delete(sessionId);
          }
        } catch {
          // session may have been removed
        }
      }, 3000);
      pollTimers.current.set(sessionId, timer);
    },
    [accounts, updateAccount]
  );

  useEffect(() => {
    return () => {
      pollTimers.current.forEach((timer) => clearInterval(timer));
      pollTimers.current.clear();
    };
  }, []);

  // WS event listeners
  useEffect(() => {
    const unsubs = [
      onWS("qr", (data) => {
        const sid = data.sessionId as string;
        if (data.qrDataURL) {
          setQrData((prev) => ({ ...prev, [sid]: data.qrDataURL as string }));
        }
        const account = accounts.find((a) => a.sessionId === sid);
        if (account) updateAccount(account.id, { status: "waiting_scan" });
      }),
      onWS("ready", (data) => {
        const sid = data.sessionId as string;
        const account = accounts.find((a) => a.sessionId === sid);
        if (account) {
          const info = data.info as Record<string, string> | undefined;
          updateAccount(account.id, {
            status: "connected",
            health: 100,
            pushname: info?.pushname,
            phone: info?.phone || account.phone,
          });
          setQrData((prev) => {
            const next = { ...prev };
            delete next[sid];
            return next;
          });
        }
      }),
      onWS("disconnected", (data) => {
        const sid = data.sessionId as string;
        const account = accounts.find((a) => a.sessionId === sid);
        if (account) updateAccount(account.id, { status: "disconnected", health: 0 });
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, [accounts, updateAccount]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await createSession(phone || undefined, name || undefined);
      const id = crypto.randomUUID();
      addAccount({
        id,
        sessionId: result.sessionId,
        name: name || `Account ${accounts.length + 1}`,
        phone: phone || "",
        status: "connecting",
        health: 0,
      });
      setActiveSessionId(result.sessionId);
      connectWS(result.sessionId);
      subscribeSession(result.sessionId);
      startPolling(result.sessionId);
      setPhone("");
      setName("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (account: typeof accounts[0]) => {
    if (!confirm(`Remove account "${account.name}"?`)) return;
    try {
      await deleteSession(account.sessionId);
    } catch {
      // may already be gone
    }
    removeAccount(account.id);
    setQrData((prev) => {
      const next = { ...prev };
      delete next[account.sessionId];
      return next;
    });
  };

  const handleLogout = async (account: typeof accounts[0]) => {
    try {
      await logoutSession(account.sessionId);
      updateAccount(account.id, { status: "disconnected", health: 0 });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Logout failed");
    }
  };

  const handleRefresh = async (account: typeof accounts[0]) => {
    try {
      await refreshSession(account.sessionId);
      updateAccount(account.id, { status: "connecting" });
      startPolling(account.sessionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Refresh failed");
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Account Manager</h1>
        <p className="text-gray-400 text-sm mt-1">
          Manage your WhatsApp accounts and sessions
        </p>
      </div>

      {/* Add Account Card */}
      <div className="bg-[#111b21] rounded-xl border border-gray-800 p-6 mb-6">
        <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Plus size={16} /> Add New Account
        </h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Phone (optional)
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1234567890"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-44 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Label (optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Business"
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-44 focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            {creating ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <QrCode size={14} />
            )}
            {creating ? "Creating..." : "Connect Account"}
          </button>
        </div>
      </div>

      {/* Account List */}
      {accounts.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <Wifi size={48} className="mx-auto mb-4 opacity-30" />
          <p>No accounts connected</p>
          <p className="text-xs mt-1">
            Click "Connect Account" to add your first WhatsApp session
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="bg-[#111b21] rounded-xl border border-gray-800 p-5"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  {/* QR Code or Status Icon */}
                  {qrData[account.sessionId] ? (
                    <div className="bg-white p-2 rounded-lg">
                      <QRCodeSVG
                        value={qrData[account.sessionId].startsWith("data:")
                          ? "scan"
                          : qrData[account.sessionId]}
                        size={160}
                        level="M"
                      />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center",
                        account.status === "connected"
                          ? "bg-emerald-500/15"
                          : account.status === "waiting_scan"
                            ? "bg-yellow-500/15"
                            : "bg-gray-700/50"
                      )}
                    >
                      {account.status === "connected" ? (
                        <Wifi size={20} className="text-emerald-400" />
                      ) : account.status === "connecting" ||
                        account.status === "waiting_scan" ? (
                        <Loader2
                          size={20}
                          className="text-yellow-400 animate-spin"
                        />
                      ) : (
                        <WifiOff size={20} className="text-gray-500" />
                      )}
                    </div>
                  )}

                  <div>
                    <h3 className="text-white font-medium">
                      {account.pushname || account.name}
                    </h3>
                    <p className="text-gray-400 text-xs mt-0.5">
                      {account.phone || account.sessionId.slice(0, 24)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full uppercase font-medium",
                          account.status === "connected"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : account.status === "waiting_scan"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : account.status === "connecting"
                                ? "bg-blue-500/20 text-blue-400"
                                : "bg-red-500/20 text-red-400"
                        )}
                      >
                        {account.status}
                      </span>
                      {account.messagesSent !== undefined &&
                        account.messagesSent > 0 && (
                          <span className="text-[10px] text-gray-500">
                            {account.messagesSent} msgs sent
                          </span>
                        )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRefresh(account)}
                    title="Refresh"
                    className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                  >
                    <RefreshCw size={16} />
                  </button>
                  {account.status === "connected" && (
                    <button
                      onClick={() => handleLogout(account)}
                      title="Logout"
                      className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-yellow-400 transition-colors"
                    >
                      <LogOut size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(account)}
                    title="Remove"
                    className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* QR scan instructions */}
              {qrData[account.sessionId] && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-yellow-400 text-xs font-medium">
                    Scan this QR code with your WhatsApp mobile app
                  </p>
                  <p className="text-gray-400 text-[10px] mt-1">
                    WhatsApp &rarr; Linked Devices &rarr; Link a Device
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
