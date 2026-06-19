import type { App } from "@slack/bolt";
import {
  getConfig,
  getTargetUsers,
  getResponsesForDateRange,
  upsertResponse,
} from "../db.js";
import { getWeekStart, addWeeks, datesForWeekdays, formatDateShort } from "../utils/dates.js";
import { isStatus, normalizeStatus, type Status } from "../status.js";
import { updateAllLiveSummaries } from "../services/liveSummary.js";
import { getProfiles } from "./profiles.js";
import {
  isAuthConfigured,
  buildAuthorizeUrl,
  exchangeCodeForClaims,
  createSessionToken,
  verifySessionToken,
  parseCookies,
  sessionCookie,
  clearSessionCookie,
  stateCookie,
  clearStateCookie,
  randomState,
  SESSION_COOKIE,
  STATE_COOKIE,
  type Session,
} from "./auth.js";
// @ts-ignore — Bun bundles HTML entrypoints and their referenced assets.
import index from "./client/index.html";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_LABELS: Record<number, string> = {
  1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun",
};

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers || {}) },
  });
}

async function sessionFromReq(req: Request): Promise<Session | null> {
  return verifySessionToken(parseCookies(req)[SESSION_COOKIE]);
}

/** The Mon–Fri office days configured by admins, used as the weekly grid columns. */
function weekdayColumns(): number[] {
  const activeDays = (JSON.parse(getConfig().active_days) as number[]).filter((d) => d >= 1 && d <= 5);
  return activeDays.length > 0 ? [...activeDays].sort((a, b) => a - b) : [1, 2, 3, 4, 5];
}

export function startWebServer(app: App): void {
  if (!isAuthConfigured()) {
    console.warn(
      "Web server NOT started: set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET, PUBLIC_URL and SESSION_SECRET to enable the companion web page."
    );
    return;
  }

  const port = Number(process.env.WEB_PORT || 3000);

  Bun.serve({
    port,
    development: process.env.NODE_ENV !== "production",
    routes: {
      "/": index,

      // --- Auth ---
      "/auth/login": (req: Request) => {
        const state = randomState();
        return new Response(null, {
          status: 302,
          headers: { Location: buildAuthorizeUrl(state), "Set-Cookie": stateCookie(state) },
        });
      },

      "/auth/callback": async (req: Request) => {
        const url = new URL(req.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const cookieState = parseCookies(req)[STATE_COOKIE];

        if (!code || !state || state !== cookieState) {
          return new Response("Invalid OAuth state", { status: 400, headers: { "Set-Cookie": clearStateCookie() } });
        }
        try {
          const { uid, name } = await exchangeCodeForClaims(code);
          const token = await createSessionToken(uid, name);
          return new Response(null, {
            status: 302,
            headers: [
              ["Location", "/"],
              ["Set-Cookie", sessionCookie(token)],
              ["Set-Cookie", clearStateCookie()],
            ],
          });
        } catch (err) {
          console.error("OAuth callback error:", err);
          return new Response("Sign-in failed. Please try again.", { status: 401, headers: { "Set-Cookie": clearStateCookie() } });
        }
      },

      "/auth/logout": () =>
        new Response(null, { status: 302, headers: { Location: "/", "Set-Cookie": clearSessionCookie() } }),

      // --- API ---
      "/api/me": async (req: Request) => {
        const session = await sessionFromReq(req);
        if (!session) return json({ error: "unauthenticated" }, { status: 401 });
        return json({ uid: session.uid, name: session.name });
      },

      "/api/board": async (req: Request) => {
        const session = await sessionFromReq(req);
        if (!session) return json({ error: "unauthenticated" }, { status: 401 });

        const url = new URL(req.url);
        const weekParam = url.searchParams.get("week");
        const weekStart = getWeekStart(weekParam && DATE_RE.test(weekParam) ? weekParam : undefined);

        const columns = weekdayColumns();
        const dates = datesForWeekdays(weekStart, columns);
        const days = dates.map((date, i) => ({
          date,
          weekday: columns[i],
          label: WEEKDAY_LABELS[columns[i]],
          long: formatDateShort(date),
        }));

        const targets = getTargetUsers();
        const profiles = await getProfiles(app.client, targets.map((u) => u.slack_user_id));

        const responses = getResponsesForDateRange(dates[0], dates[dates.length - 1]);
        const statuses: Record<string, Record<string, Status | null>> = {};
        for (const r of responses) {
          if (!dates.includes(r.target_date)) continue;
          (statuses[r.slack_user_id] ||= {})[r.target_date] = normalizeStatus(r.response);
        }

        const users = targets
          .map((u) => {
            const p = profiles.get(u.slack_user_id)!;
            return { id: u.slack_user_id, name: p.name, image: p.image, isMe: u.slack_user_id === session.uid };
          })
          .sort((a, b) => (a.isMe === b.isMe ? a.name.localeCompare(b.name) : a.isMe ? -1 : 1));

        return json({
          weekStart,
          prevWeek: addWeeks(weekStart, -1),
          nextWeek: addWeeks(weekStart, 1),
          me: session.uid,
          days,
          users,
          statuses,
        });
      },

      "/api/status": {
        POST: async (req: Request) => {
          const session = await sessionFromReq(req);
          if (!session) return json({ error: "unauthenticated" }, { status: 401 });

          let body: { date?: string; status?: string | null };
          try {
            body = (await req.json()) as typeof body;
          } catch {
            return json({ error: "invalid body" }, { status: 400 });
          }

          const date = body.date;
          if (!date || !DATE_RE.test(date)) return json({ error: "invalid date" }, { status: 400 });

          const status = body.status;
          if (status !== null && !isStatus(status)) return json({ error: "invalid status" }, { status: 400 });

          // Users may only edit their own attendance.
          if (status === null) {
            upsertResponse(session.uid, date, { response: null, responded_at: null, lunch_response: null });
          } else {
            const fields: { response: Status; responded_at: string; lunch_response?: null } = {
              response: status as Status,
              responded_at: new Date().toISOString(),
            };
            if (status !== "office") fields.lunch_response = null;
            upsertResponse(session.uid, date, fields);
          }

          // Reflect the change in any live Slack summary for that date.
          await updateAllLiveSummaries(app.client, date);

          return json({ ok: true, date, status: status ?? null });
        },
      },
    },

    // Fallback for anything not matched above.
    fetch() {
      return new Response("Not found", { status: 404 });
    },
  });

  console.log(`Web server listening on port ${port}`);
}
