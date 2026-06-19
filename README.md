# Slack Office Attendance Bot

A Slack bot that asks teammates where they'll be working — **Office, Remote, or Away** — and shows a live summary that updates in real time as people reply. Includes an optional companion web page and a weekly planning prompt.

## Features

- Sends a daily DM to configured teammates asking about the next office day
- **Office / Remote / Away** statuses (unanswered = "Unknown") instead of a plain yes/no
- Live summary message updates in-place as each person responds — no separate scheduled summary
- **Weekly prediction**: a Friday DM links each teammate to the web page to plan the coming week
- **Companion web page** (optional): "Sign in with Slack", view the whole team's week at a glance, and edit your own statuses. Edits sync back to the live Slack summaries.
- Admins configure office days, target teammates, ask time, and other admins via an App Home tab
- Each teammate can override their ask time or opt out entirely from their own App Home tab
- Per-user timezones read automatically from Slack profiles
- Slack interactivity uses Socket Mode; the web page is a separate HTTP server (only needed if you enable it)

## Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new app **from scratch**.

2. Under **Socket Mode**, enable it and generate an **App-Level Token** with the `connections:write` scope. Save it as `SLACK_APP_TOKEN`.

3. Under **OAuth & Permissions**, add these **Bot Token Scopes**:
   - `chat:write`
   - `im:write`
   - `users:read`

   Install the app to your workspace and save the **Bot User OAuth Token** as `SLACK_BOT_TOKEN`.

4. Under **Basic Information**, copy the **Signing Secret** and save it as `SLACK_SIGNING_SECRET`.

5. Under **Event Subscriptions**, subscribe to the `app_home_opened` bot event.

6. Under **App Home**, enable the **Home Tab**.

7. Under **Interactivity & Shortcuts**, ensure interactivity is enabled (Socket Mode handles this automatically).

### Optional: companion web page (Sign in with Slack)

To enable the web page and weekly prompt links, also configure OpenID Connect:

1. Under **OAuth & Permissions** → **Redirect URLs**, add `https://your-public-url/auth/callback`.
2. Add the **User Token Scopes** `openid` and `profile` (these power "Sign in with Slack"; they are separate from the bot scopes above).
3. Reinstall the app, then from **Basic Information** copy the **Client ID** and **Client Secret** into `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`.
4. Set `PUBLIC_URL` to the public HTTPS base URL (no trailing slash) and `SESSION_SECRET` to a long random string.

The web server only starts when `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `PUBLIC_URL`, and `SESSION_SECRET` are all set; otherwise the bot runs Slack-only as before. Put a TLS-terminating reverse proxy in front of `WEB_PORT` (default `3000`).

## Running Locally

**Prerequisites:** [Bun](https://bun.sh) 1.x

```bash
cp .env.example .env
# Fill in your tokens and set INITIAL_ADMIN_IDS to your Slack user ID
bun install
bun dev
```

Open the bot's App Home in Slack to configure office days, teammates, and the daily ask time.

## Running with Docker

```bash
docker run -d \
  --name slack-office-attendance-bot \
  -v /your/data/path:/data \
  -e SLACK_BOT_TOKEN=xoxb-... \
  -e SLACK_APP_TOKEN=xapp-... \
  -e SLACK_SIGNING_SECRET=... \
  -e INITIAL_ADMIN_IDS=U12345 \
  ghcr.io/rodrigohpalmeirim/slack-office-attendance-bot:latest
```

Mount a volume at `/data` to persist the SQLite database across restarts.

A `docker-compose.yml` is also included for convenience — update the image name and environment values, then run `docker compose up -d`.

## Environment Variables

| Variable | Description |
|---|---|
| `SLACK_BOT_TOKEN` | Bot User OAuth Token (`xoxb-…`) |
| `SLACK_APP_TOKEN` | App-Level Token for Socket Mode (`xapp-…`) |
| `SLACK_SIGNING_SECRET` | Signing secret from Basic Information |
| `INITIAL_ADMIN_IDS` | Comma-separated Slack user IDs granted admin on first run |
| `DATABASE_PATH` | Path to the SQLite database file (default: `./data/attendance.db`) |
| `SLACK_CLIENT_ID` | OAuth client ID for "Sign in with Slack" (web page only) |
| `SLACK_CLIENT_SECRET` | OAuth client secret (web page only) |
| `PUBLIC_URL` | Public HTTPS base URL of the web page, no trailing slash (web page only) |
| `SESSION_SECRET` | Long random string used to sign session cookies (web page only) |
| `WEB_PORT` | Port the web server listens on (default `3000`) |
| `SLACK_TEAM_ID` | Optional — restrict web sign-in to a single workspace |

## How It Works

- A cron job runs every minute. For each target teammate, if tomorrow is an office day and it's their configured ask time, the bot sends them a DM.
- The DM contains a live attendance summary (updated as people respond) followed by **Office / Remote / Away** buttons.
- Clicking a button updates the response and immediately refreshes the summary section in every teammate's message.
- "Change response" re-opens the buttons and moves the person back to the unanswered list.
- On Fridays, each teammate also gets a DM linking to the web page to predict the **coming week**. Those predictions pre-fill each day; the daily DM then just confirms or adjusts.
- The web page reads/writes the same per-day responses, so a status set on the web instantly updates the live Slack summary, and vice versa.

## Docker Image

The image is automatically built and pushed to GitHub Container Registry on every push to `main`:

```
ghcr.io/rodrigohpalmeirim/slack-office-attendance-bot:latest
ghcr.io/rodrigohpalmeirim/slack-office-attendance-bot:<commit-sha>
```
