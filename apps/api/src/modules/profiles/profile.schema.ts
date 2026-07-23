import { normalizeProfileUrl, PROFILE_LIMITS, SOCIAL_PLATFORMS } from "@doc-pilot/contracts";
import { ValidationError } from "../../shared/errors";

export interface ProfileUpdateInput {
  name?: string;
  image?: string | null;
  bio?: string | null;
  location?: string | null;
  websiteUrl?: string | null;
  socialLinks?: Record<string, string>;
}

function optionalText(value: unknown, field: string, max: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") throw new ValidationError(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new ValidationError(`${field} is too long`);
  return trimmed || null;
}

function optionalUrl(value: unknown, field: string): string | null | undefined {
  const text = optionalText(value, field, PROFILE_LIMITS.url);
  if (text == null) return text;
  const normalized = normalizeProfileUrl(text);
  if (!normalized) throw new ValidationError(`${field} must be an https URL`);
  return normalized;
}

export function parseProfileUpdate(body: unknown): ProfileUpdateInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("invalid profile input");
  }
  const value = body as Record<string, unknown>;
  if ("username" in value) throw new ValidationError("username is immutable");
  const name = optionalText(value.name, "name", PROFILE_LIMITS.name);
  if (name === null) throw new ValidationError("name is required");
  const image = optionalUrl(value.image, "image");
  const bio = optionalText(value.bio, "bio", PROFILE_LIMITS.bio);
  const location = optionalText(value.location, "location", PROFILE_LIMITS.location);
  const websiteUrl = optionalUrl(value.websiteUrl, "websiteUrl");
  let socialLinks: Record<string, string> | undefined;
  if (value.socialLinks !== undefined) {
    if (
      !value.socialLinks ||
      typeof value.socialLinks !== "object" ||
      Array.isArray(value.socialLinks)
    ) {
      throw new ValidationError("socialLinks must be an object");
    }
    const entries = Object.entries(value.socialLinks as Record<string, unknown>);
    if (entries.length > PROFILE_LIMITS.socialLinks)
      throw new ValidationError("too many social links");
    socialLinks = {};
    for (const [platform, rawUrl] of entries) {
      if (
        !(SOCIAL_PLATFORMS as readonly string[]).includes(platform) ||
        typeof rawUrl !== "string"
      ) {
        throw new ValidationError("unsupported social platform");
      }
      const normalized = normalizeProfileUrl(rawUrl.trim());
      if (!normalized) throw new ValidationError("social link must be an https URL");
      socialLinks[platform] = normalized;
    }
  }
  return Object.fromEntries(
    Object.entries({ name, image, bio, location, websiteUrl, socialLinks }).filter(
      ([, v]) => v !== undefined,
    ),
  ) as ProfileUpdateInput;
}
