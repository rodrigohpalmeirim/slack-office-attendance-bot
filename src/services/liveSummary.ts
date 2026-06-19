import type { WebClient } from "@slack/web-api";
import {
  getResponsesForDate,
  getTargetUsersForWeekday,
  getLunchTargetUserIds,
  getLiveSummariesForDate,
} from "../db.js";
import { updateMessage } from "../utils/slack.js";
import { formatDateForDisplay, getWeekdayFromDate } from "../utils/dates.js";
import { normalizeStatus, type Status } from "../status.js";
import { buildCombinedMessage } from "../views/combinedMessage.js";
import type { SummaryData } from "../views/summaryMessage.js";

/**
 * Compute the shared summary state for a date: who is office/remote/away and
 * who hasn't answered, plus lunch tallies. Lunch only counts for people marked
 * Office that day.
 */
export function computeSummaryData(targetDate: string): SummaryData {
  const allResponses = getResponsesForDate(targetDate);
  const allTargetIds = getTargetUsersForWeekday(getWeekdayFromDate(targetDate)).map((u) => u.slack_user_id);
  const respondedIds = new Set(allResponses.map((r) => r.slack_user_id));

  const byStatus = (status: Status) =>
    allResponses.filter((r) => normalizeStatus(r.response) === status).map((r) => r.slack_user_id);

  const office = byStatus("office");
  const remote = byStatus("remote");
  const away = byStatus("away");
  const noResponse = [
    ...allResponses.filter((r) => normalizeStatus(r.response) === null).map((r) => r.slack_user_id),
    ...allTargetIds.filter((id) => !respondedIds.has(id)),
  ];

  // Lunch only applies to people who are in the office that day.
  const lunchTargetIds = new Set(getLunchTargetUserIds());
  const officeSet = new Set(office);
  const lunchBringing = allResponses
    .filter((r) => r.lunch_response === "yes" && lunchTargetIds.has(r.slack_user_id) && officeSet.has(r.slack_user_id))
    .map((r) => r.slack_user_id);
  const lunchNotBringing = allResponses
    .filter((r) => r.lunch_response === "no" && lunchTargetIds.has(r.slack_user_id) && officeSet.has(r.slack_user_id))
    .map((r) => r.slack_user_id);

  return {
    targetDate,
    formattedDate: formatDateForDisplay(targetDate),
    office,
    remote,
    away,
    noResponse,
    lunchBringing,
    lunchNotBringing,
  };
}

/**
 * Rebuild the combined message for every user who has received it for the
 * given date. Each user gets the shared summary state but their own question
 * section (buttons vs. confirmation) based on their response.
 */
export async function updateAllLiveSummaries(client: WebClient, targetDate: string): Promise<void> {
  const summaryData = computeSummaryData(targetDate);
  const allResponses = getResponsesForDate(targetDate);
  const lunchTargetIds = new Set(getLunchTargetUserIds());

  const responseMap = new Map(allResponses.map((r) => [r.slack_user_id, normalizeStatus(r.response)]));
  const lunchResponseMap = new Map(
    allResponses.map((r) => [r.slack_user_id, r.lunch_response as "yes" | "no" | null])
  );

  for (const summary of getLiveSummariesForDate(targetDate)) {
    const userResponse = responseMap.get(summary.slack_user_id) ?? null;
    const userLunchResponse = lunchResponseMap.get(summary.slack_user_id) ?? null;
    const showLunchQuestion = lunchTargetIds.has(summary.slack_user_id);
    const blocks = buildCombinedMessage(
      summaryData.targetDate,
      summaryData.formattedDate,
      summaryData,
      userResponse,
      showLunchQuestion,
      userLunchResponse
    );
    try {
      await updateMessage(client, summary.channel_id, summary.message_ts, blocks, `Live attendance for ${summaryData.formattedDate}`);
    } catch (err) {
      console.error(`Failed to update live summary for ${summary.slack_user_id}:`, err);
    }
  }
}
