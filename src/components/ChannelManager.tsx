import { useState } from "react";
import { Radio, RefreshCw, Loader2, Users, Send } from "lucide-react";
import { useAppStore } from "../store";
import { getChannels, sendMessage } from "../lib/api";
import { formatNumber } from "../lib/utils";
import type { Channel } from "../types";

export function ChannelManager() {
  const { accounts, activeSessionId, setActiveSessionId } = useAppStore();
  const connectedAccounts = accounts.filter((a) => a.status === "connected");

  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const sessionId = activeSessionId || connectedAccounts[0]?.sessionId || null;

  const loadChannels = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getChannels(sessionId);
      setChannels(data.channels);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load channels");
    } finally {
      setLoading(false);
    }
  };

  const selected = channels.filter((c) => c.selected);

  const handleSendToSelected = async () => {
    if (!sessionId || !message.trim() || selected.length === 0) return;
    setSending(true);
    let sent = 0;
    let failed = 0;
    for (const ch of selected) {
      try {
        await sendMessage(sessionId, ch.id, message);
        sent++;
      } catch {
        failed++;
      }
    }
    setSending(false);
    alert(`Sent: ${sent}, Failed: ${failed}`);
    setMessage("");
  };

  const toggleSelect = (channelId: string) => {
    setChannels((prev) =>
      prev.map((c) =>
        c.id === channelId ? { ...c, selected: !c.selected } : c
      )
    );
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Channel Manager</h1>
        <p className="text-gray-400 text-sm mt-1">
          View and manage your WhatsApp channels
        </p>
      </div>

      {!sessionId ? (
        <div className="text-center py-16 text-gray-500">
          <Radio size={48} className="mx-auto mb-4 opacity-30" />
          <p>No connected account</p>
        </div>
      ) : (
        <>
          {connectedAccounts.length > 1 && (
            <div className="mb-4">
              <select
                value={sessionId}
                onChange={(e) => setActiveSessionId(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {connectedAccounts.map((a) => (
                  <option key={a.sessionId} value={a.sessionId}>
                    {a.pushname || a.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={loadChannels}
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 mb-6"
          >
            {loading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {loading ? "Loading..." : "Load Channels"}
          </button>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {channels.length > 0 && (
            <>
              <div className="grid gap-4 mb-6">
                {channels.map((ch) => (
                  <div
                    key={ch.id}
                    onClick={() => toggleSelect(ch.id)}
                    className={`bg-[#111b21] rounded-xl border p-4 cursor-pointer transition-colors ${
                      ch.selected
                        ? "border-emerald-500/50 bg-emerald-500/5"
                        : "border-gray-800 hover:border-gray-700"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-medium text-white">
                          {ch.name}
                        </h3>
                        {ch.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                            {ch.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Users size={12} />
                        <span>{formatNumber(ch.subscriberCount)}</span>
                        {ch.verified && (
                          <span className="text-blue-400 text-[10px]">Verified</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Send to selected channels */}
              {selected.length > 0 && (
                <div className="bg-[#111b21] rounded-xl border border-gray-800 p-4">
                  <p className="text-xs text-gray-400 mb-2">
                    Send to {selected.length} selected channels
                  </p>
                  <div className="flex gap-2">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type your message..."
                      rows={2}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={handleSendToSelected}
                      disabled={sending || !message.trim()}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                      {sending ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
