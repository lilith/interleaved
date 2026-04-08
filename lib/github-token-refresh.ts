/**
 * Refresh an expired GitHub OAuth user token using the refresh token.
 *
 * GitHub App user-to-server tokens expire after 8 hours when
 * "Expire user authorization tokens" is enabled. The refresh token
 * lasts 6 months and can be exchanged for a new access token without
 * user interaction.
 */

import { db } from "@/db";
import { accountTable } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const refreshInFlight = new Map<string, Promise<string | null>>();

export async function refreshGithubToken(userId: string): Promise<string | null> {
  // Dedup concurrent refreshes for the same user
  const existing = refreshInFlight.get(userId);
  if (existing) return existing;

  const job = doRefresh(userId);
  refreshInFlight.set(userId, job);
  try {
    return await job;
  } finally {
    refreshInFlight.delete(userId);
  }
}

async function doRefresh(userId: string): Promise<string | null> {
  const account = await db.query.accountTable.findFirst({
    where: and(
      eq(accountTable.userId, userId),
      eq(accountTable.providerId, "github"),
    ),
  });

  if (!account?.refreshToken) {
    return null;
  }

  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: account.refreshToken,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.error || !data.access_token) {
      console.error("GitHub token refresh failed:", data.error || "no access_token");
      return null;
    }

    // Update the stored tokens
    const updates: Record<string, any> = {
      accessToken: data.access_token,
      updatedAt: new Date(),
    };

    if (data.refresh_token) {
      updates.refreshToken = data.refresh_token;
    }

    if (data.expires_in) {
      updates.accessTokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);
    }

    if (data.refresh_token_expires_in) {
      updates.refreshTokenExpiresAt = new Date(Date.now() + data.refresh_token_expires_in * 1000);
    }

    await db.update(accountTable)
      .set(updates)
      .where(eq(accountTable.id, account.id));

    return data.access_token;
  } catch (error) {
    console.error("GitHub token refresh error:", error);
    return null;
  }
}
