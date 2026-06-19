import { useEffect, useState, useCallback } from "react";

type Status = "office" | "remote" | "away" | "maybe";

const STATUS_CYCLE: (Status | null)[] = ["office", "remote", "away", "maybe", null];

const STATUS_META: Record<string, { label: string; emoji: string; className: string }> = {
  office: { label: "Office", emoji: "🏢", className: "office" },
  remote: { label: "Remote", emoji: "🏠", className: "remote" },
  away: { label: "Away", emoji: "🌴", className: "away" },
  maybe: { label: "Maybe", emoji: "🤔", className: "maybe" },
  unknown: { label: "—", emoji: "", className: "unknown" },
};

function metaFor(status: Status | null) {
  return STATUS_META[status ?? "unknown"];
}

interface Day { date: string; weekday: number; label: string; long: string }
interface UserRow { id: string; name: string; image: string | null; isMe: boolean }
interface Board {
  weekStart: string;
  prevWeek: string;
  nextWeek: string;
  me: string;
  days: Day[];
  users: UserRow[];
  statuses: Record<string, Record<string, Status | null>>;
}

function initialWeek(): string | null {
  return new URLSearchParams(window.location.search).get("week");
}

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [week, setWeek] = useState<string | null>(initialWeek());
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadBoard = useCallback(async (w: string | null) => {
    const res = await fetch(`/api/board${w ? `?week=${w}` : ""}`);
    if (res.status === 401) { setAuthed(false); return; }
    if (!res.ok) { setError("Failed to load."); return; }
    const data = (await res.json()) as Board;
    setAuthed(true);
    setBoard(data);
    setWeek(data.weekStart);
  }, []);

  useEffect(() => { loadBoard(week); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (w: string) => {
    const u = new URL(window.location.href);
    u.searchParams.set("week", w);
    window.history.replaceState({}, "", u);
    loadBoard(w);
  };

  const setMyStatus = async (date: string, current: Status | null) => {
    if (!board) return;
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
    // Optimistic update
    setBoard((b) => {
      if (!b) return b;
      const statuses = { ...b.statuses, [b.me]: { ...(b.statuses[b.me] || {}), [date]: next } };
      return { ...b, statuses };
    });
    try {
      const res = await fetch("/api/status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, status: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setError("Could not save — reloading.");
      loadBoard(board.weekStart);
    }
  };

  if (authed === false) {
    return (
      <div className="centered">
        <div className="signin-card">
          <h1>Office Attendance</h1>
          <p>Sign in with Slack to see and set your team's week.</p>
          <a className="btn-primary" href="/auth/login">Sign in with Slack</a>
        </div>
      </div>
    );
  }

  if (authed === null || !board) {
    return <div className="centered"><p className="muted">Loading…</p></div>;
  }

  return (
    <div className="page">
      <header className="topbar">
        <h1>Office Attendance</h1>
        <a className="logout" href="/auth/logout">Sign out</a>
      </header>

      <div className="weeknav">
        <button onClick={() => navigate(board.prevWeek)} aria-label="Previous week">←</button>
        <span className="weeklabel">
          {board.days.length > 0 ? `${board.days[0].long} – ${board.days[board.days.length - 1].long}` : board.weekStart}
        </span>
        <button onClick={() => navigate(board.nextWeek)} aria-label="Next week">→</button>
        <button className="today" onClick={() => navigate(weekStartToday())}>This week</button>
      </div>

      {error && <div className="banner">{error}</div>}

      <div className="grid" style={{ gridTemplateColumns: `minmax(140px, 1.4fr) repeat(${board.days.length}, 1fr)` }}>
        <div className="cell head corner">Teammate</div>
        {board.days.map((d) => (
          <div className="cell head" key={d.date}>
            <div className="dow">{d.label}</div>
            <div className="dom">{d.long.replace(/^\w+,\s*/, "")}</div>
          </div>
        ))}

        {board.users.map((u) => (
          <Row key={u.id} user={u} board={board} onSet={setMyStatus} />
        ))}
      </div>

      <p className="legend">
        {(["office", "remote", "away", "maybe"] as Status[]).map((s) => (
          <span key={s} className={`chip ${STATUS_META[s].className}`}>{STATUS_META[s].emoji} {STATUS_META[s].label}</span>
        ))}
        <span className="muted">— click your own cells to change.</span>
      </p>
    </div>
  );
}

function Row({ user, board, onSet }: { user: UserRow; board: Board; onSet: (date: string, current: Status | null) => void }) {
  const userStatuses = board.statuses[user.id] || {};
  return (
    <>
      <div className={`cell name ${user.isMe ? "me" : ""}`}>
        {user.image ? <img src={user.image} alt="" /> : <span className="avatar-fallback" />}
        <span>{user.name}{user.isMe ? " (you)" : ""}</span>
      </div>
      {board.days.map((d) => {
        const status = userStatuses[d.date] ?? null;
        const meta = metaFor(status);
        if (user.isMe) {
          return (
            <button
              key={d.date}
              className={`cell status ${meta.className} editable`}
              onClick={() => onSet(d.date, status)}
              title="Click to change"
            >
              <span className="emoji">{meta.emoji}</span>
              <span className="lbl">{meta.label}</span>
            </button>
          );
        }
        return (
          <div key={d.date} className={`cell status ${meta.className}`}>
            <span className="emoji">{meta.emoji}</span>
            <span className="lbl">{meta.label}</span>
          </div>
        );
      })}
    </>
  );
}

function weekStartToday(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}
