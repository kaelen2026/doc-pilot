import type { DocumentStatus } from "./documents";

export const DOCUMENT_VISIBILITY = ["private", "public"] as const;
export type DocumentVisibility = (typeof DOCUMENT_VISIBILITY)[number];

export const SOCIAL_PLATFORMS = ["github", "x", "linkedin", "weibo", "bilibili"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const PROFILE_LIMITS = {
  name: 64,
  bio: 300,
  location: 80,
  url: 500,
  socialLinks: 5,
} as const;

const PROFILE_USERNAME = /^dp_[a-z0-9]{8}$/;

export function isProfileUsername(value: string): boolean {
  return PROFILE_USERNAME.test(value);
}

export function normalizeProfileUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function isPublishableDocumentStatus(status: string): status is DocumentStatus {
  return status === "ready" || status === "partially_ready";
}
