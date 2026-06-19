/**
 * Shared attendance status model.
 *
 * The DB stores one of these string values in `responses.response`, or NULL
 * which is treated as "unknown" (not yet answered). Historically this column
 * held "yes"/"no"; a migration maps yes->office, no->remote.
 */
export type Status = "office" | "remote" | "away";

export const STATUSES: Status[] = ["office", "remote", "away"];

export interface StatusMeta {
  value: Status;
  label: string;
  emoji: string; // Slack emoji shortcode (no colons)
  buttonStyle?: "primary" | "danger";
}

export const STATUS_META: Record<Status, StatusMeta> = {
  office: { value: "office", label: "Office", emoji: "office", buttonStyle: "primary" },
  remote: { value: "remote", label: "Remote", emoji: "house" },
  away: { value: "away", label: "Away", emoji: "palm_tree", buttonStyle: "danger" },
};

export const UNKNOWN_META = { label: "Unknown", emoji: "grey_question" };

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}

/** Normalize a raw stored value (incl. legacy yes/no) into a Status or null. */
export function normalizeStatus(value: string | null): Status | null {
  if (value === "yes") return "office";
  if (value === "no") return "remote";
  return isStatus(value) ? value : null;
}
