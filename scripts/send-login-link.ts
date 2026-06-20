/**
 * DM a user a personal magic-login link for the attendance web page.
 *
 * Useful for Slack Connect guests who can't use "Sign in with Slack" (they have
 * no identity in this workspace). The bot can DM them, and the link logs them
 * straight in as their workspace user ID.
 *
 * Usage (run where SLACK_BOT_TOKEN, SESSION_SECRET and PUBLIC_URL are set —
 * e.g. inside the container):
 *   docker exec slack-office-attendance-bot bun scripts/send-login-link.ts U082B4GAPLJ
 */
import { WebClient } from "@slack/web-api";
import { createMagicToken, magicLink, isAuthConfigured } from "../src/web/auth.js";
import { sendDm } from "../src/utils/slack.js";

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error("SLACK_BOT_TOKEN is not set.");
  process.exit(1);
}
if (!isAuthConfigured()) {
  console.error("Web auth is not configured (need PUBLIC_URL and SESSION_SECRET).");
  process.exit(1);
}

const uid = process.argv[2];
if (!uid) {
  console.error("Pass a Slack user ID, e.g. bun scripts/send-login-link.ts U12345");
  process.exit(1);
}

const client = new WebClient(token);
const link = magicLink(await createMagicToken(uid, uid));

await sendDm(
  client,
  uid,
  [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: ":wave: Here's your personal login link for the office attendance page — it's just for you, so please don't share it.",
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open attendance page", emoji: true },
          style: "primary",
          url: link,
          action_id: "open_web_page",
        },
      ],
    },
  ],
  "Your office attendance login link"
);

console.log(`Login link DM sent to ${uid}.`);
process.exit(0);
