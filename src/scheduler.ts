import cron from "node-cron";
import type { App } from "@slack/bolt";
import { DateTime } from "luxon";
import {
  getConfig,
  getTargetUsers,
  getAllTargetUsers,
  getResponseForUserDate,
  getResponsesForDate,
  upsertResponse,
  getLiveSummariesForDate,
  upsertLiveSummary,
} from "./db.js";
import {
  getCurrentTimeInTimezone,
  getNextBusinessDay,
  isTimeMatch,
  isTodayActiveDay,
  formatDateForDisplay,
} from "./utils/dates.js";
import { sendDm } from "./utils/slack.js";
import { buildAskMessage } from "./views/askMessage.js";
import { buildSummaryMessage } from "./views/summaryMessage.js";

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

        if (!isTodayActiveDay(now.dayOfWeek, activeDays)) continue;

        const nextBizDay = getNextBusinessDay(DateTime.now().setZone(tz), activeDays);
        const targetDate = nextBizDay.toFormat("yyyy-MM-dd");

        if (!isTimeMatch(now.hours, now.minutes, askTime)) continue;

        const existing = getResponseForUserDate(user.slack_user_id, targetDate);
        if (existing) continue; // already asked today

        try {
          const formattedDate = formatDateForDisplay(targetDate);

          // Send the attendance question
          const { ts: askTs, channelId } = await sendDm(
            app.client,
            user.slack_user_id,
            buildAskMessage(targetDate, formattedDate),
            `Are you coming to the office on ${formattedDate}?`
          );
          upsertResponse(user.slack_user_id, targetDate, {
            message_ts: askTs,
            channel_id: channelId,
          });

          // Send the live summary immediately after — starts with current state (all unanswered)
          const allResponses = getResponsesForDate(targetDate);
          const allTargetIds = getAllTargetUsers().map((u) => u.slack_user_id);
          const respondedIds = new Set(allResponses.map((r) => r.slack_user_id));

          const coming = allResponses.filter((r) => r.response === "yes").map((r) => r.slack_user_id);
          const notComing = allResponses.filter((r) => r.response === "no").map((r) => r.slack_user_id);
          const noResponse = [
            ...allResponses.filter((r) => r.response === null).map((r) => r.slack_user_id),
            ...allTargetIds.filter((id) => !respondedIds.has(id)),
          ];

          const { ts: summaryTs, channelId: summaryChannel } = await sendDm(
            app.client,
            user.slack_user_id,
            buildSummaryMessage({ targetDate, formattedDate, coming, notComing, noResponse }),
            `Live attendance for ${formattedDate}`
          );
          upsertLiveSummary(user.slack_user_id, targetDate, summaryTs, summaryChannel);
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
