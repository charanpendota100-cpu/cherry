import { useEffect, useState } from "react";
import {
  Activity,
  MessageSquare,
  Users,
  Wifi,
  WifiOff,
  Clock,
  Shield,
} from "lucide-react";
import { getHealth } from "../lib/api";
import { useAppStore } from "../store";
import { formatDuration } from "../lib/utils";

interface HealthData {
  status: string;
  version: string;
  uptime: number;
  sessions: {
    total: number;
    connected: number;
    list: Array<{
      id: string;
      status: string;
      phone: string | null;
      pushname: string | null;
    }>;
  };
  memory: { heapUsed: number; heapTotal: number };
}

export function Dashboard() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accounts = useAppStore((s) => s.accounts);

  useEffect(() => {
    let cancelled = false;
    const fetchHealth = async () => {
      try {
        const data = await getHealth();
        if (!cancelled) {
          setHealth(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Server unreachable");
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const connectedAccounts = accounts.filter(
    (a) => a.status === "connected"
  ).length;
  const totalMessages = accounts.reduce(
    (sum, a) => sum + (a.messagesSent ?? 0),
    0
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          System overview and real-time monitoring
        </p>
      </div>

      {/* Status Banner */}
      <div
        className={`mb-6 p-4 rounded-xl flex items-center gap-3 ${
          health
            ? "bg-emerald-500/10 border border-emerald-500/20"
            : error
              ? "bg-red-500/10 border border-red-500/20"
              : "bg-gray-800/50 border border-gray-700"
        }`}
      >
        {health ? (
          <Wifi size={20} className="text-emerald-400" />
        ) : error ? (
          <WifiOff size={20} className="text-red-400" />
        ) : (
          <Activity size={20} className="text-gray-400 animate-pulse" />
        )}
        <div>
          <p className="text-sm font-medium">
            {health
              ? `Backend Online - v${health.version}`
              : error
                ? `Backend Offline: ${error}`
                : "Connecting to backend..."}
          </p>
          {health && (
            <p className="text-xs text-gray-400 mt-0.5">
              Uptime: {formatDuration(health.uptime)} | Memory:{" "}
              {Math.round(health.memory.heapUsed / 1024 / 1024)}MB
            </p>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={<Wifi size={20} />}
          label="Connected Sessions"
          value={String(health?.sessions.connected ?? connectedAccounts)}
          total={String(health?.sessions.total ?? accounts.length)}
          color="emerald"
        />
        <StatCard
          icon={<MessageSquare size={20} />}
          label="Messages Sent"
          value={String(totalMessages)}
          color="blue"
        />
        <StatCard
          icon={<Users size={20} />}
          label="Accounts"
          value={String(accounts.length)}
          color="purple"
        />
        <StatCard
          icon={<Shield size={20} />}
          label="Anti-Ban Status"
          value="Active"
          color="amber"
        />
      </div>

      {/* Sessions Table */}
      {health && health.sessions.list.length > 0 && (
        <div className="bg-[#111b21] rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <Clock size={16} /> Active Sessions
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-xs uppercase">
                  <th className="px-6 py-3 text-left">Session ID</th>
                  <th className="px-6 py-3 text-left">Status</th>
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {health.sessions.list.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-800/50">
                    <td className="px-6 py-3 font-mono text-xs text-gray-300">
                      {s.id.slice(0, 20)}...
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
                          s.status === "connected"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : s.status === "waiting_scan"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-300">
                      {s.pushname || "-"}
                    </td>
                    <td className="px-6 py-3 text-gray-300">
                      {s.phone || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  total,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  total?: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/10",
    blue: "text-blue-400 bg-blue-500/10",
    purple: "text-purple-400 bg-purple-500/10",
    amber: "text-amber-400 bg-amber-500/10",
  };
  const c = colors[color] ?? colors.emerald;

  return (
    <div className="bg-[#111b21] rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-400 uppercase tracking-wider">
          {label}
        </span>
        <div className={`p-2 rounded-lg ${c}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-white">
        {value}
        {total && (
          <span className="text-sm text-gray-500 font-normal"> / {total}</span>
        )}
      </p>
    </div>
  );
}
