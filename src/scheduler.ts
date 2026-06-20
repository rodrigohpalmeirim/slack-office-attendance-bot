import cron from "node-cron";
import type { App } from "@slack/bolt";
import { DateTime } from "luxon";
import {
  getConfig,
  getTargetUsers,
  getResponseForUserDate,
  upsertResponse,
  upsertLiveSummary,
  hasWeeklyPromptBeenSent,
  markWeeklyPromptSent,
} from "./db.js";
import {
  getCurrentTimeInTimezone,
  isTimeMatch,
  isTodayActiveDay,
  formatDateForDisplay,
  getWeekStart,
  addWeeks,
} from "./utils/dates.js";
import { sendDm } from "./utils/slack.js";
import { normalizeStatus } from "./status.js";
import { computeSummaryData, summaryUserIds } from "./services/liveSummary.js";
import { getProfiles } from "./services/profiles.js";
import { buildCombinedMessage } from "./views/combinedMessage.js";
import { buildWeeklyPromptMessage } from "./views/weeklyPrompt.js";
import { createMagicToken, magicLink, isAuthConfigured } from "./web/auth.js";

export function startScheduler(app: App): void {
  cron.schedule("* * * * *", async () => {
    try {
      const config = getConfig();
      const activeDays: number[] = JSON.parse(config.active_days);

      const targetUsers = getTargetUsers(); // enabled targets only

      for (const user of targetUsers) {
        const tz = user.timezone || "UTC";
        const now = getCurrentTimeInTimezone(tz);
        const askTime = user.custom_ask_time || config.default_ask_time;

        // --- Weekly prediction prompt: sent on Fridays for the coming week ---
        if (now.dayOfWeek === 5 && isTimeMatch(now.hours, now.minutes, askTime)) {
          const nextWeekStart = addWeeks(getWeekStart(undefined, tz), 1);
          if (!hasWeeklyPromptBeenSent(user.slack_user_id, nextWeekStart)) {
            try {
              const link = isAuthConfigured()
                ? magicLink(await createMagicToken(user.slack_user_id, user.slack_user_id), `/?week=${nextWeekStart}`)
                : null;
              await sendDm(
                app.client,
                user.slack_user_id,
                buildWeeklyPromptMessage(nextWeekStart, link),
                "Plan your office attendance for next week"
              );
              markWeeklyPromptSent(user.slack_user_id, nextWeekStart);
            } catch (err) {
              console.error(`Failed to send weekly prompt to ${user.slack_user_id}:`, err);
            }
          }
        }

        // --- Daily attendance question (asks about tomorrow) ---
        if (activeDays.length === 0) continue;

        const tomorrow = DateTime.now().setZone(tz).plus({ days: 1 });
        if (!isTodayActiveDay(tomorrow.weekday, activeDays)) continue;

        // Skip if this user has opted out of that specific day
        if (user.active_days_override) {
          const userDays: number[] = JSON.parse(user.active_days_override);
          if (!userDays.includes(tomorrow.weekday)) continue;
        }

        const targetDate = tomorrow.toFormat("yyyy-MM-dd");

        if (!isTimeMatch(now.hours, now.minutes, askTime)) continue;

        // A response row may already exist from a weekly prediction. Only skip
        // if the daily DM was actually sent (message_ts present); otherwise the
        // DM goes out pre-filled with their prediction to confirm/adjust.
        const existing = getResponseForUserDate(user.slack_user_id, targetDate);
        if (existing?.message_ts) continue;

        try {
          const formattedDate = formatDateForDisplay(targetDate);
          const summaryData = computeSummaryData(targetDate);
          const profiles = await getProfiles(app.client, summaryUserIds(summaryData));
          const userResponse = normalizeStatus(existing?.response ?? null);
          const showLunchQuestion = user.is_lunch_target !== 0;

          const { ts, channelId } = await sendDm(
            app.client,
            user.slack_user_id,
            buildCombinedMessage(
              targetDate,
              formattedDate,
              summaryData,
              profiles,
              userResponse,
              showLunchQuestion,
              null
            ),
            `Where will you be on ${formattedDate}?`
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
