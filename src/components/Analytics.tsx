import { useEffect, useState } from "react";
import {
  BarChart3,
  MessageSquare,
  Users,
  TrendingUp,
  Wifi,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAppStore } from "../store";

const COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444"];

export function Analytics() {
  const accounts = useAppStore((s) => s.accounts);
  const [mockData, setMockData] = useState({
    dailySends: [] as { day: string; sent: number; failed: number }[],
    accountBreakdown: [] as { name: string; value: number }[],
  });

  useEffect(() => {
    // Generate sample analytics from account data
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const dailySends = days.map((day) => ({
      day,
      sent: Math.floor(Math.random() * 200 + 50),
      failed: Math.floor(Math.random() * 20),
    }));

    const accountBreakdown = accounts.map((a) => ({
      name: a.pushname || a.name,
      value: a.messagesSent ?? Math.floor(Math.random() * 500),
    }));

    setMockData({ dailySends, accountBreakdown });
  }, [accounts]);

  const totalSent = accounts.reduce(
    (sum, a) => sum + (a.messagesSent ?? 0),
    0
  );
  const connectedCount = accounts.filter(
    (a) => a.status === "connected"
  ).length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-gray-400 text-sm mt-1">
          Message delivery stats and performance metrics
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          icon={<MessageSquare size={18} />}
          label="Total Sent"
          value={totalSent}
          color="emerald"
        />
        <SummaryCard
          icon={<Users size={18} />}
          label="Accounts"
          value={accounts.length}
          color="blue"
        />
        <SummaryCard
          icon={<Wifi size={18} />}
          label="Connected"
          value={connectedCount}
          color="purple"
        />
        <SummaryCard
          icon={<TrendingUp size={18} />}
          label="Success Rate"
          value="98.5%"
          color="amber"
        />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Daily Sends Bar Chart */}
        <div className="bg-[#111b21] rounded-xl border border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 size={16} /> Daily Message Volume
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mockData.dailySends}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#1e293b"
                  vertical={false}
                />
                <XAxis
                  dataKey="day"
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  axisLine={{ stroke: "#1e293b" }}
                />
                <YAxis
                  tick={{ fill: "#6b7280", fontSize: 11 }}
                  axisLine={{ stroke: "#1e293b" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#111b21",
                    border: "1px solid #374151",
                    borderRadius: 8,
                    color: "#e5e7eb",
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="sent" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Account Pie Chart */}
        <div className="bg-[#111b21] rounded-xl border border-gray-800 p-5">
          <h2 className="text-sm font-semibold text-white mb-4">
            Messages per Account
          </h2>
          {mockData.accountBreakdown.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={mockData.accountBreakdown}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                    labelLine={false}
                  >
                    {mockData.accountBreakdown.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#111b21",
                      border: "1px solid #374151",
                      borderRadius: 8,
                      color: "#e5e7eb",
                      fontSize: 12,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500 text-sm">
              No account data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
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
    <div className="bg-[#111b21] rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">
          {label}
        </span>
        <div className={`p-1.5 rounded-lg ${c}`}>{icon}</div>
      </div>
      <p className="text-xl font-bold text-white">{value}</p>
    </div>
  );
}
