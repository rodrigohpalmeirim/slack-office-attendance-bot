import cron from "node-cron";
import type { App } from "@slack/bolt";
import { DateTime } from "luxon";
import {
  getConfig,
  getTargetUsers,
  getTargetUsersForWeekday,
  getResponseForUserDate,
  getResponsesForDate,
  upsertResponse,
  upsertLiveSummary,
} from "./db.js";
import {
  getCurrentTimeInTimezone,
  isTimeMatch,
  isTodayActiveDay,
  formatDateForDisplay,
} from "./utils/dates.js";
import { sendDm } from "./utils/slack.js";
import { buildCombinedMessage } from "./views/combinedMessage.js";

export function startScheduler(app: App): void {
  cron.schedule("* * * * *", async () => {
    try {
      const config = getConfig();
      const activeDays: number[] = JSON.parse(config.active_days);

      if (activeDays.length === 0) return;

      const targetUsers = getTargetUsers(); // enabled targets only

      for (const user of targetUsers) {
        const tz = user.timezone || "UTC";
        const now = getCurrentTimeInTimezone(tz);
        const askTime = user.custom_ask_time || config.default_ask_time;

        // Send the question if tomorrow is a global office day
        const tomorrow = DateTime.now().setZone(tz).plus({ days: 1 });
        if (!isTodayActiveDay(tomorrow.weekday, activeDays)) continue;

        // Skip if this user has opted out of that specific day
        if (user.active_days_override) {
          const userDays: number[] = JSON.parse(user.active_days_override);
          if (!userDays.includes(tomorrow.weekday)) continue;
        }

        const targetDate = tomorrow.toFormat("yyyy-MM-dd");

        if (!isTimeMatch(now.hours, now.minutes, askTime)) continue;
        if (getResponseForUserDate(user.slack_user_id, targetDate)) continue; // already asked

        try {
          const formattedDate = formatDateForDisplay(targetDate);

          // Build initial summary — only users subscribed for this day
          const allResponses = getResponsesForDate(targetDate);
          const allTargetIds = getTargetUsersForWeekday(tomorrow.weekday).map((u) => u.slack_user_id);
          const respondedIds = new Set(allResponses.map((r) => r.slack_user_id));

          const coming = allResponses.filter((r) => r.response === "yes").map((r) => r.slack_user_id);
          const notComing = allResponses.filter((r) => r.response === "no").map((r) => r.slack_user_id);
          const noResponse = [
            ...allResponses.filter((r) => r.response === null).map((r) => r.slack_user_id),
            ...allTargetIds.filter((id) => !respondedIds.has(id)),
          ];

          const showLunchQuestion = user.is_lunch_target !== 0;

          const { ts, channelId } = await sendDm(
            app.client,
            user.slack_user_id,
            buildCombinedMessage(
              targetDate,
              formattedDate,
              { targetDate, formattedDate, coming, notComing, noResponse, lunchBringing: [], lunchNotBringing: [] },
              null,
              showLunchQuestion,
              null
            ),
            `Are you coming to the office on ${formattedDate}?`
          );

          upsertResponse(user.slack_user_id, targetDate, { message_ts: ts, channel_id: channelId });
          upsertLiveSummary(user.slack_user_id, targetDate, ts, channelId);
        } catch (err) {
          console.error(`Failed to message ${user.slack_user_id}:`, err);
        }
      }
    } catch (err) {
      console.error("Scheduler error:", err);
    }
  });

  console.log("Scheduler started (runs every minute)");
}
