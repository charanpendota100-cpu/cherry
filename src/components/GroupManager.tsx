import { useState } from "react";
import {
  Users,
  Search,
  Download,
  RefreshCw,
  Loader2,
  Link,
  CheckSquare,
  Square,
  Crown,
  UserPlus,
  Send,
} from "lucide-react";
import { useAppStore } from "../store";
import { getGroups, getGroupMembers, getGroupInviteLink } from "../lib/api";
import { cn, formatNumber } from "../lib/utils";
import type { Group, GroupMember } from "../types";
import * as XLSX from "xlsx";

export function GroupManager() {
  const { accounts, activeSessionId, setActiveSessionId } = useAppStore();
  const connectedAccounts = accounts.filter((a) => a.status === "connected");

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [filter, setFilter] = useState<"all" | "admin">("all");
  const [error, setError] = useState<string | null>(null);

  const sessionId = activeSessionId || connectedAccounts[0]?.sessionId || null;

  const loadGroups = async () => {
    if (!sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getGroups(sessionId);
      setGroups(data.groups.map((g) => ({ ...g, selected: false })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load groups");
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async (group: Group) => {
    if (!sessionId) return;
    setSelectedGroup(group);
    setLoadingMembers(true);
    try {
      const data = await getGroupMembers(sessionId, group.id);
      setMembers(data.members);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleExport = () => {
    if (members.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(
      members.map((m) => ({
        Phone: m.number,
        "WhatsApp ID": m.id,
        "Is Admin": m.isAdmin ? "Yes" : "No",
        "Is Super Admin": m.isSuperAdmin ? "Yes" : "No",
        Group: selectedGroup?.name || "",
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Members");
    XLSX.writeFile(
      wb,
      `${selectedGroup?.name || "group"}_members.xlsx`
    );
  };

  const handleCopyInviteLink = async (groupId: string) => {
    if (!sessionId) return;
    try {
      const data = await getGroupInviteLink(sessionId, groupId);
      await navigator.clipboard.writeText(data.inviteLink);
      alert("Invite link copied!");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to get invite link");
    }
  };

  const toggleSelect = (groupId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId ? { ...g, selected: !g.selected } : g
      )
    );
  };

  const toggleSelectAll = () => {
    const allSelected = filtered.every((g) => g.selected);
    const filteredIds = new Set(filtered.map((g) => g.id));
    setGroups((prev) =>
      prev.map((g) =>
        filteredIds.has(g.id) ? { ...g, selected: !allSelected } : g
      )
    );
  };

  const filtered = groups
    .filter((g) => {
      if (filter === "admin" && !g.isAdmin) return false;
      if (search && !g.name.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    })
    .sort((a, b) => b.participantCount - a.participantCount);

  const selectedCount = groups.filter((g) => g.selected).length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Group Manager</h1>
        <p className="text-gray-400 text-sm mt-1">
          Browse, search, and manage your WhatsApp groups
        </p>
      </div>

      {/* Session Picker */}
      {connectedAccounts.length > 1 && (
        <div className="mb-4">
          <select
            value={sessionId || ""}
            onChange={(e) => setActiveSessionId(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
          >
            {connectedAccounts.map((a) => (
              <option key={a.sessionId} value={a.sessionId}>
                {a.pushname || a.name} ({a.phone || a.sessionId.slice(0, 16)})
              </option>
            ))}
          </select>
        </div>
      )}

      {!sessionId ? (
        <div className="text-center py-16 text-gray-500">
          <Users size={48} className="mx-auto mb-4 opacity-30" />
          <p>No connected account</p>
          <p className="text-xs mt-1">
            Go to Accounts tab to connect a WhatsApp session
          </p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap gap-3 items-center mb-4">
            <button
              onClick={loadGroups}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {loading ? "Loading..." : "Load Groups"}
            </button>
            <div className="relative flex-1 max-w-xs">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search groups..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
              <button
                onClick={() => setFilter("all")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  filter === "all"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                All
              </button>
              <button
                onClick={() => setFilter("admin")}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  filter === "admin"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-gray-200"
                )}
              >
                Admin Only
              </button>
            </div>
            {selectedCount > 0 && (
              <span className="text-xs text-emerald-400">
                {selectedCount} selected
              </span>
            )}
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-4">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Groups List */}
          {groups.length > 0 && (
            <div className="bg-[#111b21] rounded-xl border border-gray-800 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {filtered.length} groups
                </span>
                <button
                  onClick={toggleSelectAll}
                  className="text-xs text-gray-400 hover:text-white flex items-center gap-1"
                >
                  {filtered.every((g) => g.selected) ? (
                    <CheckSquare size={12} />
                  ) : (
                    <Square size={12} />
                  )}
                  Select All
                </button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-gray-800">
                {filtered.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 cursor-pointer"
                    onClick={() => loadMembers(group)}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(group.id);
                      }}
                      className="text-gray-500 hover:text-white"
                    >
                      {group.selected ? (
                        <CheckSquare size={16} className="text-emerald-400" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white font-medium truncate">
                          {group.name}
                        </span>
                        {group.isAdmin && (
                          <Crown size={12} className="text-amber-400 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-gray-500">
                        {formatNumber(group.participantCount)} members
                        {group.adminCount ? ` | ${group.adminCount} admins` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyInviteLink(group.id);
                        }}
                        title="Copy invite link"
                        className="p-1.5 rounded hover:bg-gray-700 text-gray-500 hover:text-white"
                      >
                        <Link size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Members Panel */}
          {selectedGroup && (
            <div className="mt-6 bg-[#111b21] rounded-xl border border-gray-800">
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    {selectedGroup.name}
                  </h3>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {members.length} members loaded
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleExport}
                    disabled={members.length === 0}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1"
                  >
                    <Download size={12} /> Export Excel
                  </button>
                </div>
              </div>

              {loadingMembers ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 size={24} className="animate-spin text-gray-500" />
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 uppercase">
                        <th className="px-6 py-2 text-left">Phone</th>
                        <th className="px-6 py-2 text-left">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {members.map((m) => (
                        <tr key={m.id} className="hover:bg-gray-800/50">
                          <td className="px-6 py-2 text-gray-300 font-mono">
                            {m.number}
                          </td>
                          <td className="px-6 py-2">
                            {m.isSuperAdmin ? (
                              <span className="text-amber-400">Super Admin</span>
                            ) : m.isAdmin ? (
                              <span className="text-emerald-400">Admin</span>
                            ) : (
                              <span className="text-gray-500">Member</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
