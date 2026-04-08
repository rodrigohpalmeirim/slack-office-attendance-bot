import type { WebClient } from "@slack/web-api";
import type { KnownBlock } from "@slack/types";

// In-memory cache for DM channel IDs (stable, rarely change)
const dmChannelCache = new Map<string, string>();

/**
 * Open a DM channel with a user, returning the channel ID.
 * Results are cached in memory.
 */
export async function openDmChannel(client: WebClient, userId: string): Promise<string> {
  const cached = dmChannelCache.get(userId);
  if (cached) return cached;

  const result = await client.conversations.open({ users: userId });
  const channelId = result.channel!.id!;
  dmChannelCache.set(userId, channelId);
  return channelId;
}

/**
 * Send a DM to a user with Block Kit blocks.
 * Returns the message timestamp (ts) for later updates.
 */
export async function sendDm(
  client: WebClient,
  userId: string,
  blocks: KnownBlock[],
  text: string
): Promise<{ ts: string; channelId: string }> {
  const channelId = await openDmChannel(client, userId);
  const result = await client.chat.postMessage({
    channel: channelId,
    blocks,
    text, // fallback for notifications
  });
  return { ts: result.ts!, channelId };
}

/**
 * Update an existing message (e.g., replace buttons with confirmation).
 */
export async function updateMessage(
  client: WebClient,
  channelId: string,
  ts: string,
  blocks: KnownBlock[],
  text: string
): Promise<void> {
  await client.chat.update({
    channel: channelId,
    ts,
    blocks,
    text,
  });
}

/**
 * Get a user's IANA timezone string from their Slack profile.
 * Falls back to "UTC" if unavailable.
 */
export async function getUserTimezone(client: WebClient, userId: string): Promise<string> {
  try {
    const result = await client.users.info({ user: userId });
    return result.user?.tz || "UTC";
  } catch {
    return "UTC";
  }
}
