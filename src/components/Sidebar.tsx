import {
  LayoutDashboard,
  Smartphone,
  Users,
  Radio,
  Send,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
} from "lucide-react";
import { useAppStore } from "../store";
import { cn } from "../lib/utils";
import type { TabId } from "../types";

const NAV_ITEMS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
  { id: "accounts", label: "Accounts", icon: <Smartphone size={20} /> },
  { id: "groups", label: "Groups", icon: <Users size={20} /> },
  { id: "channels", label: "Channels", icon: <Radio size={20} /> },
  { id: "messaging", label: "Messaging", icon: <Send size={20} /> },
  { id: "analytics", label: "Analytics", icon: <BarChart3 size={20} /> },
];

export function Sidebar() {
  const { activeTab, setActiveTab, sidebarOpen, toggleSidebar } = useAppStore();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 h-full bg-[#111b21] border-r border-gray-800 flex flex-col transition-all duration-300 z-50",
        sidebarOpen ? "w-64" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
          <MessageSquare size={18} className="text-emerald-400" />
        </div>
        {sidebarOpen && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-white truncate">WA Pro</h1>
            <p className="text-[10px] text-gray-500">v9.0 Enterprise</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-sm",
              activeTab === item.id
                ? "bg-emerald-500/15 text-emerald-400"
                : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            )}
          >
            {item.icon}
            {sidebarOpen && <span>{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-12 border-t border-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
      >
        {sidebarOpen ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>
    </aside>
  );
}
