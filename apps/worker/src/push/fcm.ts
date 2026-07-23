import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { workerEnv } from "../env";

export interface FcmClient {
  send(input: {
    tokens: string[];
    title: string;
    body?: string;
    badge: number;
  }): Promise<{ invalidTokens: string[] }>;
}

export function workerFcmClient(): FcmClient | undefined {
  const config = workerEnv.fcm;
  if (!config) return undefined;
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: config.projectId,
        clientEmail: config.clientEmail,
        privateKey: config.privateKey,
      }),
    });
  return {
    async send(input) {
      if (input.tokens.length === 0) return { invalidTokens: [] };
      const result = await getMessaging(app).sendEachForMulticast({
        tokens: input.tokens,
        notification: { title: input.title, body: input.body },
        data: { type: "document", badge: String(input.badge) },
        android: { notification: { channelId: "documents", notificationCount: input.badge } },
      });
      const invalidTokens = result.responses.flatMap((response, index) => {
        const code = response.error?.code;
        return code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
          ? [input.tokens[index] as string]
          : [];
      });
      return { invalidTokens };
    },
  };
}
