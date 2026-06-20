import type { KnownBlock } from "@slack/types";
import { formatDateShort, datesForWeekdays } from "../utils/dates.js";

/**
 * Build the Friday DM nudging the user to fill in their attendance prediction
 * for the coming week on the companion web page. `webUrl` is the (per-user)
 * link to open — typically a magic-login link so it works for everyone,
 * including Slack Connect guests who can't use OAuth.
 */
export function buildWeeklyPromptMessage(weekStart: string, webUrl: string | null): KnownBlock[] {
  const [monday, friday] = [datesForWeekdays(weekStart, [1])[0], datesForWeekdays(weekStart, [5])[0]];
  const rangeLabel = `${formatDateShort(monday)} – ${formatDateShort(friday)}`;
  const link = webUrl;

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:calendar: *Plan your week ahead*\nLet your team know which days you expect to be in the office next week (${rangeLabel}).`,
      },
    },
  ];

  if (link) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Set my week", emoji: true },
          style: "primary",
          url: link,
          action_id: "open_weekly_web",
        },
      ],
    });
  } else {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: "_The web page URL is not configured (set PUBLIC_URL)._" }],
    });
  }

  return blocks;
}
