import { useCallback, useEffect, useRef, useState } from "react";
import {
  Send,
  Upload,
  Loader2,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Shield,
  Clock,
} from "lucide-react";
import { useAppStore } from "../store";
import { sendBulk } from "../lib/api";
import { onWS, connectWS } from "../lib/ws";
import type { Contact, BulkSendProgress } from "../types";
import * as XLSX from "xlsx";

type Preset = "conservative" | "balanced" | "aggressive";

const PRESETS: Record<Preset, { minDelay: number; maxDelay: number; label: string; description: string }> = {
  conservative: { minDelay: 12, maxDelay: 25, label: "Conservative", description: "Safest - 12-25s delays" },
  balanced: { minDelay: 7, maxDelay: 13, label: "Balanced", description: "Recommended - 7-13s delays" },
  aggressive: { minDelay: 3, maxDelay: 7, label: "Aggressive", description: "Fast but riskier - 3-7s delays" },
};

export function BulkMessaging() {
  const { accounts, activeSessionId, setActiveSessionId } = useAppStore();
  const connectedAccounts = accounts.filter((a) => a.status === "connected");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messageTemplate, setMessageTemplate] = useState("");
  const [preset, setPreset] = useState<Preset>("balanced");
  const [batchSize, setBatchSize] = useState(30);
  const [batchPause, setBatchPause] = useState(60);
  const [spintax, setSpintax] = useState(true);
  const [invisible, setInvisible] = useState(true);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<BulkSendProgress | null>(null);
  const [campaignComplete, setCampaignComplete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sessionId = activeSessionId || connectedAccounts[0]?.sessionId || null;

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = ev.target?.result;
          const wb = XLSX.read(data, { type: "binary" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws);

          const parsed: Contact[] = json
            .map((row) => {
              const phone =
                row.phone || row.Phone || row.PHONE || row.number || row.Number || "";
              const name =
                row.name || row.Name || row.NAME || row.contact || row.Contact || "";
              return {
                phone: String(phone).replace(/\D/g, "").trim(),
                name: String(name).trim(),
                var1: String(row.var1 || row.Var1 || ""),
                var2: String(row.var2 || row.Var2 || ""),
                var3: String(row.var3 || row.Var3 || ""),
              };
            })
            .filter((c) => c.phone.length >= 5);

          setContacts(parsed);
        } catch {
          alert("Failed to parse file. Please use Excel or CSV format.");
        }
      };
      reader.readAsBinaryString(file);
      e.target.value = "";
    },
    []
  );

  // WS progress listener
  useEffect(() => {
    const unsubs = [
      onWS("bulk_progress", (data) => {
        setProgress(data as unknown as BulkSendProgress);
      }),
      onWS("bulk_complete", (data) => {
        setProgress(data as unknown as BulkSendProgress);
        setSending(false);
        setCampaignComplete(true);
      }),
      onWS("bulk_auto_stopped", (data) => {
        setProgress(data as unknown as BulkSendProgress);
        setSending(false);
        setCampaignComplete(true);
      }),
    ];
    return () => unsubs.forEach((fn) => fn());
  }, []);

  const handleSend = async () => {
    if (!sessionId || contacts.length === 0 || !messageTemplate.trim()) return;
    setSending(true);
    setCampaignComplete(false);
    setProgress(null);

    const { minDelay, maxDelay } = PRESETS[preset];

    try {
      connectWS(sessionId);
      await sendBulk(sessionId, contacts, messageTemplate, {
        minDelay,
        maxDelay,
        batchSize,
        batchPauseSeconds: batchPause,
        spintaxEnabled: spintax,
        invisibleCharsEnabled: invisible,
      });
    } catch (err) {
      setSending(false);
      alert(err instanceof Error ? err.message : "Failed to start bulk send");
    }
  };

  const pct =
    progress && progress.total > 0
      ? Math.round(((progress.sent + progress.failed) / progress.total) * 100)
      : 0;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Bulk Messaging</h1>
        <p className="text-gray-400 text-sm mt-1">
          Send personalized messages with anti-ban protection
        </p>
      </div>

      {!sessionId ? (
        <div className="text-center py-16 text-gray-500">
          <Send size={48} className="mx-auto mb-4 opacity-30" />
          <p>No connected account</p>
        </div>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: Contacts & Message */}
          <div className="lg:col-span-2 space-y-6">
            {/* Session selector */}
            {connectedAccounts.length > 1 && (
              <select
                value={sessionId}
                onChange={(e) => setActiveSessionId(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-emerald-500"
              >
                {connectedAccounts.map((a) => (
                  <option key={a.sessionId} value={a.sessionId}>
                    {a.pushname || a.name}
                  </option>
                ))}
              </select>
            )}

            {/* Upload contacts */}
            <div className="bg-[#111b21] rounded-xl border border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <FileSpreadsheet size={16} /> Import Contacts
              </h2>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm flex items-center gap-2"
              >
                <Upload size={14} /> Upload Excel/CSV
              </button>
              {contacts.length > 0 && (
                <p className="text-xs text-emerald-400 mt-2">
                  {contacts.length} contacts loaded
                </p>
              )}
              <p className="text-[10px] text-gray-600 mt-1">
                Columns: phone (required), name, var1, var2, var3
              </p>
            </div>

            {/* Message Template */}
            <div className="bg-[#111b21] rounded-xl border border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-white mb-3">
                Message Template
              </h2>
              <textarea
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                placeholder={`Hi {name}, this is a {greeting|hello|hey} message!\n\nVariables: {name}, {phone}, {var1}, {var2}, {var3}\nSpintax: {option1|option2|option3}`}
                rows={6}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-emerald-500 font-mono"
              />
              <p className="text-[10px] text-gray-600 mt-1">
                Use {"{"} name {"}"} for personalization. Wrap options in{" "}
                {"{"} opt1|opt2|opt3 {"}"} for spintax randomization.
              </p>
            </div>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={sending || contacts.length === 0 || !messageTemplate.trim()}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2"
            >
              {sending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Send size={16} />
              )}
              {sending
                ? `Sending... ${pct}%`
                : `Send to ${contacts.length} contacts`}
            </button>

            {/* Progress */}
            {progress && (
              <div className="bg-[#111b21] rounded-xl border border-gray-800 p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-white font-medium">
                    Campaign Progress
                  </span>
                  <span className="text-xs text-gray-400">{pct}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-lg font-bold text-emerald-400">
                      {progress.sent}
                    </p>
                    <p className="text-[10px] text-gray-500 flex items-center justify-center gap-1">
                      <CheckCircle2 size={10} /> Sent
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-red-400">
                      {progress.failed}
                    </p>
                    <p className="text-[10px] text-gray-500 flex items-center justify-center gap-1">
                      <XCircle size={10} /> Failed
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-gray-300">
                      {progress.total}
                    </p>
                    <p className="text-[10px] text-gray-500">Total</p>
                  </div>
                </div>
                {campaignComplete && (
                  <p className="text-center text-xs text-emerald-400 mt-3">
                    Campaign complete!
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Right: Settings */}
          <div className="space-y-4">
            {/* Anti-Ban Preset */}
            <div className="bg-[#111b21] rounded-xl border border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Shield size={16} className="text-emerald-400" /> Anti-Ban
                Settings
              </h2>
              <div className="space-y-2">
                {(Object.entries(PRESETS) as [Preset, typeof PRESETS[Preset]][]).map(
                  ([key, val]) => (
                    <label
                      key={key}
                      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${
                        preset === key
                          ? "bg-emerald-500/10 border-emerald-500/30"
                          : "bg-gray-800/50 border-transparent hover:border-gray-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="preset"
                        checked={preset === key}
                        onChange={() => setPreset(key)}
                        className="accent-emerald-500"
                      />
                      <div>
                        <p className="text-xs font-medium text-white">
                          {val.label}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {val.description}
                        </p>
                      </div>
                    </label>
                  )
                )}
              </div>
            </div>

            {/* Batch Settings */}
            <div className="bg-[#111b21] rounded-xl border border-gray-800 p-5">
              <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Clock size={16} /> Batch Settings
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] text-gray-400">
                    Batch Size
                  </label>
                  <input
                    type="number"
                    value={batchSize}
                    onChange={(e) => setBatchSize(Number(e.target.value))}
                    min={1}
                    max={200}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white mt-1"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400">
                    Batch Pause (seconds)
                  </label>
                  <input
                    type="number"
                    value={batchPause}
                    onChange={(e) => setBatchPause(Number(e.target.value))}
                    min={5}
                    max={600}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Toggles */}
            <div className="bg-[#111b21] rounded-xl border border-gray-800 p-5 space-y-3">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-gray-300">
                  Spintax Processing
                </span>
                <input
                  type="checkbox"
                  checked={spintax}
                  onChange={(e) => setSpintax(e.target.checked)}
                  className="accent-emerald-500"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-gray-300">
                  Invisible Characters
                </span>
                <input
                  type="checkbox"
                  checked={invisible}
                  onChange={(e) => setInvisible(e.target.checked)}
                  className="accent-emerald-500"
                />
              </label>
            </div>

            {/* Tips */}
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-amber-400 font-medium">
                    Anti-Ban Tips
                  </p>
                  <ul className="text-[10px] text-gray-400 mt-1 space-y-0.5 list-disc list-inside">
                    <li>Start with Conservative mode</li>
                    <li>Keep daily sends under 500</li>
                    <li>Use spintax for message variation</li>
                    <li>Don&apos;t send to new numbers en masse</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
