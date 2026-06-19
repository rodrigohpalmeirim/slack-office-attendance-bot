import type { WebClient } from "@slack/web-api";

export interface Profile {
  id: string;
  name: string;
  image: string | null;
}

const cache = new Map<string, Profile>();

/** Fetch display profiles for the given user IDs, caching results in memory. */
export async function getProfiles(client: WebClient, userIds: string[]): Promise<Map<string, Profile>> {
  const result = new Map<string, Profile>();
  const missing: string[] = [];

  for (const id of userIds) {
    const cached = cache.get(id);
    if (cached) result.set(id, cached);
    else missing.push(id);
  }

  await Promise.all(
    missing.map(async (id) => {
      try {
        const res = await client.users.info({ user: id });
        const u = res.user;
        const profile: Profile = {
          id,
          name: u?.profile?.display_name || u?.real_name || u?.name || id,
          image: u?.profile?.image_72 || null,
        };
        cache.set(id, profile);
        result.set(id, profile);
      } catch {
        const fallback: Profile = { id, name: id, image: null };
        result.set(id, fallback);
      }
    })
  );

  return result;
}
