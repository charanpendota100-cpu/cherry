import { useAppStore } from "./store";
import { Sidebar } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { AccountManager } from "./components/AccountManager";
import { GroupManager } from "./components/GroupManager";
import { ChannelManager } from "./components/ChannelManager";
import { BulkMessaging } from "./components/BulkMessaging";
import { Analytics } from "./components/Analytics";

export function App() {
  const { activeTab, sidebarOpen } = useAppStore();

  const content = (() => {
    switch (activeTab) {
      case "dashboard":
        return <Dashboard />;
      case "accounts":
        return <AccountManager />;
      case "groups":
        return <GroupManager />;
      case "channels":
        return <ChannelManager />;
      case "messaging":
        return <BulkMessaging />;
      case "analytics":
        return <Analytics />;
      default:
        return <Dashboard />;
    }
  })();

  return (
    <div className="flex h-screen bg-[#0b141a] text-gray-100">
      <Sidebar />
      <main
        className={`flex-1 overflow-auto transition-all duration-300 ${
          sidebarOpen ? "ml-64" : "ml-16"
        }`}
      >
        <div className="p-6 max-w-7xl mx-auto">{content}</div>
      </main>
    </div>
  );
}
