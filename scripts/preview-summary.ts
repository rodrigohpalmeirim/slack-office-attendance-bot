/**
 * Post a sample attendance summary DM so you can preview the message layout
 * without waiting for the scheduler.
 *
 * Usage:
 *   bun scripts/preview-summary.ts [recipientUserId] [YYYY-MM-DD]
 *
 * - recipientUserId defaults to the first configured admin.
 * - date only affects the header label; the people shown are your real target
 *   users (so avatars resolve), spread across the statuses for illustration.
 *
 * Requires SLACK_BOT_TOKEN (loaded automatically from .env by Bun) and the
 * same DATABASE_PATH as your running bot.
 */
import { WebClient } from "@slack/web-api";
import { getTargetUserIds, getAdminIds } from "../src/db.js";
import { getProfiles } from "../src/services/profiles.js";
import { buildSummaryMessage, type SummaryData } from "../src/views/summaryMessage.js";
import { sendDm } from "../src/utils/slack.js";
import { formatDateForDisplay, getWeekStart, datesForWeekdays } from "../src/utils/dates.js";

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error("SLACK_BOT_TOKEN is not set (put it in .env).");
  process.exit(1);
}
const client = new WebClient(token);

const recipient = process.argv[2] || getAdminIds()[0];
if (!recipient) {
  console.error("No recipient. Pass a Slack user ID as the first argument, e.g. bun scripts/preview-summary.ts U12345");
  process.exit(1);
}

const date = process.argv[3] || datesForWeekdays(getWeekStart(), [1])[0];

// Spread real target users across the statuses so every row is populated.
const targets = getTargetUserIds();
const pool = targets.length > 0 ? targets : [recipient];
const buckets: Record<"office" | "remote" | "away" | "maybe" | "noResponse", string[]> = {
  office: [], remote: [], away: [], maybe: [], noResponse: [],
};
const order = ["office", "remote", "away", "maybe", "noResponse"] as const;
pool.forEach((id, i) => buckets[order[i % order.length]].push(id));

const data: SummaryData = {
  targetDate: date,
  formattedDate: formatDateForDisplay(date),
  ...buckets,
  lunchBringing: buckets.office.slice(0, 2),
  lunchNotBringing: buckets.office.slice(2, 3),
};

const profiles = await getProfiles(client, pool);
const blocks = buildSummaryMessage(data, profiles);

await sendDm(client, recipient, blocks, `Attendance summary preview — ${data.formattedDate}`);
console.log(`Preview summary sent to ${recipient} for ${date}.`);
process.exit(0);
