"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import {
  ArrowLeft,
  Database,
  Download,
  AlertTriangle,
  Users,
  FileText,
  Activity,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Calendar,
  User as UserIcon,
  Smartphone,
  Globe,
  Info,
  Layers,
  TrendingUp,
  PenSquare,
  BookOpen,
  X,
  Eye,
} from "lucide-react";
import {
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
  Timestamp,
  QueryConstraint,
} from "firebase/firestore";
import { db } from "../lib/firebase";

// ============================================================================
// TYPES (mirrors the writer contract; DO NOT change field names)
// ============================================================================

type Platform =
  | "android"
  | "ios"
  | "web"
  | "windows"
  | "macos"
  | "linux"
  | "fuchsia";

interface FileBucket {
  reads: number;
  writes: number;
  operations: Record<string, number>;
}

interface UsageSession {
  sessionId: string;
  date: string;
  startedAt: Timestamp;
  lastActivityAt: Timestamp;
  appVersion: string | null;
  platform: Platform;
  userId: string | null;
  displayName: string | null;
  email: string | null;
  totals: { reads: number; writes: number };
  byFile: Record<string, FileBucket>;
}

type QueryMode = "date" | "recent" | "user";
type ViewMode = "users" | "files" | "sessions";

interface PerUser {
  key: string;
  userId: string | null;
  displayName: string;
  email: string | null;
  sessions: number;
  totalReads: number;
  totalWrites: number;
  platforms: Set<Platform>;
  byFile: Record<string, FileBucket>;
}

interface PerFile {
  fileName: string;
  reads: number;
  writes: number;
  operations: Record<string, number>;
  sessionCount: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION = "firestore_usage_sessions";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const PLATFORM_META: Record<
  Platform,
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  android: { label: "Android", color: "text-green-700", bg: "bg-green-50", icon: Smartphone },
  ios: { label: "iOS", color: "text-gray-700", bg: "bg-gray-100", icon: Smartphone },
  web: { label: "Web", color: "text-blue-700", bg: "bg-blue-50", icon: Globe },
  windows: { label: "Windows", color: "text-sky-700", bg: "bg-sky-50", icon: Globe },
  macos: { label: "macOS", color: "text-zinc-700", bg: "bg-zinc-100", icon: Globe },
  linux: { label: "Linux", color: "text-amber-700", bg: "bg-amber-50", icon: Globe },
  fuchsia: { label: "Fuchsia", color: "text-fuchsia-700", bg: "bg-fuchsia-50", icon: Globe },
};

// ============================================================================
// HELPERS
// ============================================================================

function todayLocalYMD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatNum(n: number): string {
  return n.toLocaleString("en-US");
}

function formatTs(ts: Timestamp | null | undefined): string {
  if (!ts) return "—";
  try {
    return ts.toDate().toLocaleString();
  } catch {
    return "—";
  }
}

function aggregateByUser(sessions: UsageSession[]): PerUser[] {
  const map = new Map<string, PerUser>();
  for (const s of sessions) {
    const key = s.userId ?? "__anonymous__";
    const row =
      map.get(key) ??
      ({
        key,
        userId: s.userId,
        displayName: s.displayName ?? (s.userId ? "Unnamed User" : "Anonymous"),
        email: s.email,
        sessions: 0,
        totalReads: 0,
        totalWrites: 0,
        platforms: new Set<Platform>(),
        byFile: {},
      } as PerUser);
    row.sessions += 1;
    row.totalReads += s.totals?.reads ?? 0;
    row.totalWrites += s.totals?.writes ?? 0;
    row.platforms.add(s.platform);
    if (!row.email && s.email) row.email = s.email;
    if ((!row.displayName || row.displayName === "Anonymous") && s.displayName)
      row.displayName = s.displayName;
    for (const [file, b] of Object.entries(s.byFile ?? {})) {
      const acc =
        row.byFile[file] ?? { reads: 0, writes: 0, operations: {} };
      acc.reads += b.reads ?? 0;
      acc.writes += b.writes ?? 0;
      for (const [op, c] of Object.entries(b.operations ?? {})) {
        acc.operations[op] = (acc.operations[op] ?? 0) + c;
      }
      row.byFile[file] = acc;
    }
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.totalReads - a.totalReads);
}

function aggregateByFile(sessions: UsageSession[]): PerFile[] {
  const map = new Map<string, PerFile>();
  for (const s of sessions) {
    for (const [file, b] of Object.entries(s.byFile ?? {})) {
      const row =
        map.get(file) ??
        ({
          fileName: file,
          reads: 0,
          writes: 0,
          operations: {},
          sessionCount: 0,
        } as PerFile);
      row.reads += b.reads ?? 0;
      row.writes += b.writes ?? 0;
      row.sessionCount += 1;
      for (const [op, c] of Object.entries(b.operations ?? {})) {
        row.operations[op] = (row.operations[op] ?? 0) + c;
      }
      map.set(file, row);
    }
  }
  return [...map.values()].sort((a, b) => b.reads - a.reads);
}

// ============================================================================
// PAGE
// ============================================================================

export default function FirestoreReadTrackerPage() {
  return (
    <ProtectedRoute>
      <FirestoreReadTracker />
    </ProtectedRoute>
  );
}

function FirestoreReadTracker() {
  const router = useRouter();

  // Query controls
  const [queryMode, setQueryMode] = useState<QueryMode>("date");
  const [dateInput, setDateInput] = useState<string>(todayLocalYMD());
  const [limitInput, setLimitInput] = useState<number>(DEFAULT_LIMIT);
  const [userIdInput, setUserIdInput] = useState<string>("");

  // Data
  const [sessions, setSessions] = useState<UsageSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bill tracking
  const [lastFetchReads, setLastFetchReads] = useState(0);
  const [cumulativeReads, setCumulativeReads] = useState(0);
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null);
  const [lastQueryLabel, setLastQueryLabel] = useState<string>("");

  // View / filter state (client-side only; zero extra reads)
  const [view, setView] = useState<ViewMode>("users");
  const [searchTerm, setSearchTerm] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"all" | Platform>("all");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  // Prevent double-fetching on rapid clicks
  const inFlightRef = useRef(false);

  const runQuery = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const col = collection(db, COLLECTION);
      const effLimit = Math.max(
        1,
        Math.min(MAX_LIMIT, Number(limitInput) || DEFAULT_LIMIT)
      );

      const constraints: QueryConstraint[] = [];
      let label = "";

      if (queryMode === "date") {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
          throw new Error("Date must be YYYY-MM-DD");
        }
        constraints.push(where("date", "==", dateInput));
        constraints.push(orderBy("startedAt", "desc"));
        constraints.push(fbLimit(effLimit));
        label = `date=${dateInput} · limit ${effLimit}`;
      } else if (queryMode === "user") {
        const uid = userIdInput.trim();
        if (!uid) throw new Error("Enter a userId");
        constraints.push(where("userId", "==", uid));
        constraints.push(orderBy("startedAt", "desc"));
        constraints.push(fbLimit(effLimit));
        label = `userId=${uid} · limit ${effLimit}`;
      } else {
        constraints.push(orderBy("startedAt", "desc"));
        constraints.push(fbLimit(effLimit));
        label = `recent · limit ${effLimit}`;
      }

      const snap = await getDocs(query(col, ...constraints));
      const docs: UsageSession[] = snap.docs.map((d) => {
        const data = d.data() as Partial<UsageSession>;
        return {
          sessionId: data.sessionId ?? d.id,
          date: data.date ?? "",
          startedAt: data.startedAt as Timestamp,
          lastActivityAt: data.lastActivityAt as Timestamp,
          appVersion: data.appVersion ?? null,
          platform: (data.platform ?? "web") as Platform,
          userId: data.userId ?? null,
          displayName: data.displayName ?? null,
          email: data.email ?? null,
          totals: data.totals ?? { reads: 0, writes: 0 },
          byFile: data.byFile ?? {},
        };
      });

      setSessions(docs);
      setLoaded(true);
      setLastFetchReads(snap.size);
      setCumulativeReads((c) => c + snap.size);
      setLastFetchAt(new Date());
      setLastQueryLabel(label);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Query failed";
      setError(msg);
      console.error("firestore-read-tracker query error:", e);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [queryMode, dateInput, limitInput, userIdInput]);

  // ---- Derived data (client-side, no reads) -------------------------------

  const filteredSessions = useMemo(() => {
    let arr = sessions;
    if (platformFilter !== "all") {
      arr = arr.filter((s) => s.platform === platformFilter);
    }
    const term = searchTerm.trim().toLowerCase();
    if (term) {
      arr = arr.filter((s) => {
        return (
          s.displayName?.toLowerCase().includes(term) ||
          s.email?.toLowerCase().includes(term) ||
          s.userId?.toLowerCase().includes(term) ||
          s.sessionId.toLowerCase().includes(term) ||
          s.appVersion?.toLowerCase().includes(term)
        );
      });
    }
    return arr;
  }, [sessions, platformFilter, searchTerm]);

  const stats = useMemo(() => {
    let totalReads = 0;
    let totalWrites = 0;
    const userSet = new Set<string>();
    const platformCounts: Record<string, number> = {};
    for (const s of filteredSessions) {
      totalReads += s.totals?.reads ?? 0;
      totalWrites += s.totals?.writes ?? 0;
      userSet.add(s.userId ?? `anon:${s.sessionId}`);
      platformCounts[s.platform] = (platformCounts[s.platform] ?? 0) + 1;
    }
    return {
      sessions: filteredSessions.length,
      uniqueUsers: userSet.size,
      totalReads,
      totalWrites,
      platformCounts,
    };
  }, [filteredSessions]);

  const perUser = useMemo(
    () => aggregateByUser(filteredSessions),
    [filteredSessions]
  );
  const perFile = useMemo(
    () => aggregateByFile(filteredSessions),
    [filteredSessions]
  );

  // ------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              title="Dashboard'a don"
            >
              <ArrowLeft className="w-4 h-4 text-gray-600" />
            </button>
            <div className="p-2 bg-indigo-50 rounded-lg flex-shrink-0">
              <Database className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-gray-900 truncate">
                Firestore Read Tracker
              </h1>
              <p className="text-[11px] text-gray-500 truncate">
                {COLLECTION} · on-demand queries only (no live listeners)
              </p>
            </div>
          </div>

          {/* Bill counter */}
          <div className="flex items-center gap-3 text-xs flex-shrink-0">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-amber-800">
                Session reads:{" "}
                <span className="font-semibold tabular-nums">
                  {formatNum(cumulativeReads)}
                </span>
              </span>
            </div>
            {lastFetchAt && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-gray-600">
                <Info className="w-3.5 h-3.5" />
                <span>
                  Last: {formatNum(lastFetchReads)} reads ·{" "}
                  {lastFetchAt.toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-4">
        {/* Query Panel */}
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Download className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-900">
              Query Firestore
            </h2>
            <span className="text-[11px] text-gray-500">
              Each query costs 1 read per returned document.
            </span>
          </div>

          {/* Mode tabs */}
          <div className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-lg mb-3">
            {(
              [
                { id: "date", label: "By Date", icon: Calendar },
                { id: "recent", label: "Recent", icon: TrendingUp },
                { id: "user", label: "By User ID", icon: UserIcon },
              ] as { id: QueryMode; label: string; icon: React.ElementType }[]
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setQueryMode(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  queryMode === id
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_auto] gap-3 items-end">
            {/* Primary input */}
            <div>
              {queryMode === "date" && (
                <>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
                    Date (device-local YYYY-MM-DD)
                  </label>
                  <input
                    type="date"
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </>
              )}
              {queryMode === "recent" && (
                <>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
                    Recent sessions across all dates
                  </label>
                  <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-600">
                    Orders by{" "}
                    <code className="text-[11px] bg-white px-1 py-0.5 rounded border">
                      startedAt desc
                    </code>{" "}
                    · capped by limit
                  </div>
                </>
              )}
              {queryMode === "user" && (
                <>
                  <label className="block text-[11px] font-medium text-gray-600 mb-1">
                    User ID (exact match)
                  </label>
                  <input
                    type="text"
                    value={userIdInput}
                    onChange={(e) => setUserIdInput(e.target.value)}
                    placeholder="uid_..."
                    className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
                  />
                </>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-600 mb-1">
                Limit (max {MAX_LIMIT})
              </label>
              <input
                type="number"
                min={1}
                max={MAX_LIMIT}
                value={limitInput}
                onChange={(e) => setLimitInput(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 tabular-nums"
              />
            </div>

            <button
              onClick={runQuery}
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white rounded-lg transition-colors"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Querying...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Fetch · costs up to {Math.min(MAX_LIMIT, Number(limitInput) || 0)} reads
                </>
              )}
            </button>
          </div>

          {error && (
            <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {lastQueryLabel && !error && (
            <div className="mt-3 text-[11px] text-gray-500 font-mono">
              Last query: {lastQueryLabel} ·{" "}
              <span className="text-gray-700">
                {formatNum(lastFetchReads)} docs returned
              </span>
            </div>
          )}
        </div>

        {/* Empty state */}
        {!loaded && !loading && (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center">
            <Database className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              No data loaded yet
            </h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              This page does not query Firestore until you click{" "}
              <strong>Fetch</strong>. All filtering, sorting and aggregation
              below operates on the already-loaded snapshot — it costs{" "}
              <em>zero</em> additional reads.
            </p>
          </div>
        )}

        {/* Loaded content */}
        {loaded && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon={Layers}
                label="Sessions (filtered)"
                value={formatNum(stats.sessions)}
                sub={`${formatNum(sessions.length)} loaded`}
                tint="indigo"
              />
              <StatCard
                icon={Users}
                label="Unique users"
                value={formatNum(stats.uniqueUsers)}
                tint="blue"
              />
              <StatCard
                icon={BookOpen}
                label="Total reads"
                value={formatNum(stats.totalReads)}
                sub="sum of session totals"
                tint="emerald"
              />
              <StatCard
                icon={PenSquare}
                label="Total writes"
                value={formatNum(stats.totalWrites)}
                tint="amber"
              />
            </div>

            {/* Toolbar: search + platform + view */}
            <div className="bg-white border border-gray-200 rounded-xl p-3 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filter (client-side): name, email, uid, session, version..."
                  className="w-full pl-9 pr-8 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-200 rounded"
                  >
                    <X className="w-3 h-3 text-gray-500" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 p-0.5 bg-gray-100 rounded-md">
                <button
                  onClick={() => setPlatformFilter("all")}
                  className={`px-2 py-1 text-[11px] font-medium rounded ${
                    platformFilter === "all"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600"
                  }`}
                >
                  All
                </button>
                {(Object.keys(PLATFORM_META) as Platform[])
                  .filter((p) => (stats.platformCounts[p] ?? 0) > 0)
                  .map((p) => (
                    <button
                      key={p}
                      onClick={() => setPlatformFilter(p)}
                      className={`px-2 py-1 text-[11px] font-medium rounded capitalize ${
                        platformFilter === p
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-600"
                      }`}
                    >
                      {PLATFORM_META[p].label} ({stats.platformCounts[p]})
                    </button>
                  ))}
              </div>

              <div className="ml-auto flex items-center gap-1 p-0.5 bg-gray-100 rounded-md">
                {(
                  [
                    { id: "users", label: "By User", icon: Users },
                    { id: "files", label: "By File", icon: FileText },
                    { id: "sessions", label: "Sessions", icon: Activity },
                  ] as { id: ViewMode; label: string; icon: React.ElementType }[]
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setView(id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded transition-all ${
                      view === id
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Caveat banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-[11px] text-blue-900 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <div>
                Keys containing <code className="font-mono">. / \ [ ] * ~</code>{" "}
                are sanitized to <code className="font-mono">_</code> by the
                writer. A bucket named{" "}
                <code className="font-mono">_other</code> represents overflow
                when a session has &gt;200 distinct files or &gt;50 distinct ops
                per file — not a real source file.
              </div>
            </div>

            {/* Views */}
            {view === "users" && (
              <UsersView
                rows={perUser}
                expandedKey={expandedUser}
                onToggle={(k) =>
                  setExpandedUser(expandedUser === k ? null : k)
                }
              />
            )}
            {view === "files" && (
              <FilesView
                rows={perFile}
                expandedKey={expandedFile}
                onToggle={(k) =>
                  setExpandedFile(expandedFile === k ? null : k)
                }
              />
            )}
            {view === "sessions" && (
              <SessionsView
                rows={filteredSessions}
                expandedKey={expandedSession}
                onToggle={(k) =>
                  setExpandedSession(expandedSession === k ? null : k)
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// VIEW COMPONENTS
// ============================================================================

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tint: "indigo" | "blue" | "emerald" | "amber";
}) {
  const map = {
    indigo: { bg: "bg-indigo-50", text: "text-indigo-700", icon: "text-indigo-500" },
    blue: { bg: "bg-blue-50", text: "text-blue-700", icon: "text-blue-500" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", icon: "text-emerald-500" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", icon: "text-amber-500" },
  } as const;
  const c = map[tint];
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg ${c.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-4 h-4 ${c.icon}`} />
      </div>
      <div className="min-w-0">
        <p className={`text-lg font-bold ${c.text} leading-none tabular-nums`}>
          {value}
        </p>
        <p className="text-[10px] text-gray-500 mt-1 truncate">{label}</p>
        {sub && (
          <p className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</p>
        )}
      </div>
    </div>
  );
}

function UsersView({
  rows,
  expandedKey,
  onToggle,
}: {
  rows: PerUser[];
  expandedKey: string | null;
  onToggle: (k: string) => void;
}) {
  if (rows.length === 0) {
    return <EmptyPanel label="No users match the current filter." />;
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="grid grid-cols-[auto_1fr_90px_90px_90px_120px] gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        <div />
        <div>User</div>
        <div className="text-right">Sessions</div>
        <div className="text-right">Reads</div>
        <div className="text-right">Writes</div>
        <div>Platforms</div>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => {
          const isOpen = expandedKey === r.key;
          const sortedFiles = Object.entries(r.byFile).sort(
            (a, b) => b[1].reads - a[1].reads
          );
          return (
            <div key={r.key}>
              <button
                onClick={() => onToggle(r.key)}
                className="w-full grid grid-cols-[auto_1fr_90px_90px_90px_120px] gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors items-center"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {r.displayName}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate font-mono">
                    {r.email ?? r.userId ?? "anonymous"}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-700 tabular-nums">
                  {formatNum(r.sessions)}
                </div>
                <div className="text-right text-sm font-semibold text-emerald-700 tabular-nums">
                  {formatNum(r.totalReads)}
                </div>
                <div className="text-right text-sm text-amber-700 tabular-nums">
                  {formatNum(r.totalWrites)}
                </div>
                <div className="flex flex-wrap gap-1">
                  {[...r.platforms].map((p) => (
                    <PlatformPill key={p} platform={p} />
                  ))}
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 bg-gray-50/50">
                  <FileBreakdown entries={sortedFiles} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FilesView({
  rows,
  expandedKey,
  onToggle,
}: {
  rows: PerFile[];
  expandedKey: string | null;
  onToggle: (k: string) => void;
}) {
  if (rows.length === 0) {
    return <EmptyPanel label="No files in the current snapshot." />;
  }
  const maxReads = rows[0]?.reads ?? 1;
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="grid grid-cols-[auto_1fr_80px_90px_90px] gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        <div />
        <div>File / Source</div>
        <div className="text-right">Sessions</div>
        <div className="text-right">Reads</div>
        <div className="text-right">Writes</div>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => {
          const isOpen = expandedKey === r.fileName;
          const share = maxReads > 0 ? (r.reads / maxReads) * 100 : 0;
          const isOverflow = r.fileName === "_other";
          const ops = Object.entries(r.operations).sort(
            (a, b) => b[1] - a[1]
          );
          return (
            <div key={r.fileName}>
              <button
                onClick={() => onToggle(r.fileName)}
                className="w-full grid grid-cols-[auto_1fr_80px_90px_90px] gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors items-center"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-gray-900 truncate">
                      {r.fileName}
                    </span>
                    {isOverflow && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-200"
                        title="Overflow bucket — >200 files or >50 ops per file in a single session"
                      >
                        overflow
                      </span>
                    )}
                  </div>
                  <div className="mt-1 h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-400"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>
                <div className="text-right text-sm text-gray-700 tabular-nums">
                  {formatNum(r.sessionCount)}
                </div>
                <div className="text-right text-sm font-semibold text-emerald-700 tabular-nums">
                  {formatNum(r.reads)}
                </div>
                <div className="text-right text-sm text-amber-700 tabular-nums">
                  {formatNum(r.writes)}
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 bg-gray-50/50">
                  <div className="mt-2 text-[10px] uppercase font-semibold text-gray-500 mb-1">
                    Operations ({ops.length})
                  </div>
                  {ops.length === 0 ? (
                    <p className="text-xs text-gray-500 italic">
                      No operations recorded.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {ops.map(([op, count]) => (
                        <div
                          key={op}
                          className="flex items-center justify-between text-xs bg-white border border-gray-200 rounded px-2 py-1"
                        >
                          <span className="font-mono text-gray-800 truncate pr-2">
                            {op}
                          </span>
                          <span className="tabular-nums text-gray-600 flex-shrink-0">
                            {formatNum(count)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionsView({
  rows,
  expandedKey,
  onToggle,
}: {
  rows: UsageSession[];
  expandedKey: string | null;
  onToggle: (k: string) => void;
}) {
  if (rows.length === 0) {
    return <EmptyPanel label="No sessions match the current filter." />;
  }
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="grid grid-cols-[auto_1.5fr_1fr_110px_90px_90px_120px] gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
        <div />
        <div>User</div>
        <div>Started</div>
        <div>Platform</div>
        <div className="text-right">Reads</div>
        <div className="text-right">Writes</div>
        <div>Version</div>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((s) => {
          const isOpen = expandedKey === s.sessionId;
          const sortedFiles = Object.entries(s.byFile).sort(
            (a, b) => b[1].reads - a[1].reads
          );
          return (
            <div key={s.sessionId}>
              <button
                onClick={() => onToggle(s.sessionId)}
                className="w-full grid grid-cols-[auto_1.5fr_1fr_110px_90px_90px_120px] gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors items-center"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {s.displayName ?? (s.userId ? "Unnamed" : "Anonymous")}
                  </div>
                  <div className="text-[11px] text-gray-500 truncate font-mono">
                    {s.email ?? s.userId ?? "—"}
                  </div>
                </div>
                <div className="text-[11px] text-gray-600">
                  <div>{formatTs(s.startedAt)}</div>
                  <div className="text-gray-400">
                    last: {formatTs(s.lastActivityAt)}
                  </div>
                </div>
                <PlatformPill platform={s.platform} />
                <div className="text-right text-sm font-semibold text-emerald-700 tabular-nums">
                  {formatNum(s.totals?.reads ?? 0)}
                </div>
                <div className="text-right text-sm text-amber-700 tabular-nums">
                  {formatNum(s.totals?.writes ?? 0)}
                </div>
                <div className="text-[11px] font-mono text-gray-600 truncate">
                  {s.appVersion ?? "—"}
                </div>
              </button>
              {isOpen && (
                <div className="px-4 pb-4 bg-gray-50/50 space-y-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600 pt-2">
                    <span>
                      <span className="text-gray-400">sessionId:</span>{" "}
                      <span className="font-mono">{s.sessionId}</span>
                    </span>
                    <span>
                      <span className="text-gray-400">date:</span>{" "}
                      <span className="font-mono">{s.date}</span>
                    </span>
                  </div>
                  <FileBreakdown entries={sortedFiles} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FileBreakdown({
  entries,
}: {
  entries: [string, FileBucket][];
}) {
  if (entries.length === 0) {
    return (
      <p className="text-xs text-gray-500 italic pt-2">
        No file-level data recorded for this scope.
      </p>
    );
  }
  const maxReads = entries[0]?.[1].reads || 1;
  return (
    <div className="space-y-2 pt-2">
      <div className="text-[10px] uppercase font-semibold text-gray-500">
        Per-file breakdown ({entries.length})
      </div>
      {entries.map(([file, bucket]) => {
        const share = maxReads > 0 ? (bucket.reads / maxReads) * 100 : 0;
        const ops = Object.entries(bucket.operations).sort(
          (a, b) => b[1] - a[1]
        );
        return (
          <details
            key={file}
            className="bg-white border border-gray-200 rounded-md group"
          >
            <summary className="list-none cursor-pointer px-3 py-2 flex items-center gap-3 hover:bg-gray-50">
              <Eye className="w-3 h-3 text-gray-400 group-open:hidden" />
              <ChevronDown className="w-3 h-3 text-gray-500 hidden group-open:block" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-gray-900 truncate">
                    {file}
                  </span>
                  {file === "_other" && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-200"
                      title="Overflow bucket"
                    >
                      overflow
                    </span>
                  )}
                </div>
                <div className="mt-1 h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400"
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs font-semibold text-emerald-700 tabular-nums">
                  {formatNum(bucket.reads)} R
                </div>
                <div className="text-[10px] text-amber-700 tabular-nums">
                  {formatNum(bucket.writes)} W
                </div>
              </div>
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-1 border-t border-gray-100">
              {ops.length === 0 ? (
                <p className="text-[11px] text-gray-500 italic">
                  No operations recorded.
                </p>
              ) : (
                ops.map(([op, count]) => (
                  <div
                    key={op}
                    className="flex items-center justify-between text-[11px]"
                  >
                    <span className="font-mono text-gray-700 truncate pr-2">
                      {op}
                    </span>
                    <span className="tabular-nums text-gray-500 flex-shrink-0">
                      {formatNum(count)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function PlatformPill({ platform }: { platform: Platform }) {
  const meta = PLATFORM_META[platform] ?? PLATFORM_META.web;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded ${meta.bg} ${meta.color}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {meta.label}
    </span>
  );
}

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-10 text-center text-sm text-gray-500">
      {label}
    </div>
  );
}
