import type { KnownBlock } from "@slack/types";
import type { Status } from "../status.js";
import { buildSummaryMessage, type SummaryData, type ProfileMap } from "./summaryMessage.js";
import { buildAskMessage, buildAskConfirmation } from "./askMessage.js";

/**
 * Build the single combined DM: live summary at the top, question (or
 * confirmation after responding) below. This is the only message each user
 * receives; it is updated in-place as anyone responds.
 */
export function buildCombinedMessage(
  targetDate: string,
  formattedDate: string,
  summaryData: SummaryData,
  profiles: ProfileMap,
  userResponse: Status | null,
  showLunchQuestion: boolean,
  userLunchResponse: "yes" | "no" | null
): KnownBlock[] {
  const questionBlocks =
    userResponse === null
      ? buildAskMessage(targetDate, formattedDate)
      : buildAskConfirmation(targetDate, formattedDate, userResponse, showLunchQuestion, userLunchResponse);

  return [
    ...buildSummaryMessage(summaryData, profiles),
    ...questionBlocks,
  ];
}
