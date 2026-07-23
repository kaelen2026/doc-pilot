export interface PublicProfile {
  username: string;
  name: string;
  image: string | null;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  socialLinks: Record<string, string>;
  createdAt: string;
  followerCount: number;
  followingCount: number;
  publicDocumentCount: number;
}
export interface PublicDocument {
  id: string;
  title: string;
  pageCount: number | null;
  createdAt: string;
}
export interface FollowUser {
  username: string;
  name: string;
  image: string | null;
  bio: string | null;
}
