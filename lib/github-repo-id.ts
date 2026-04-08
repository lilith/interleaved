/**
 * Resolve a GitHub repo's stable numeric ID.
 *
 * This ID never changes across renames or transfers, making it safe
 * for use as a storage namespace key.
 *
 * Uses an in-memory cache (TTL: 1 hour) to avoid repeated API calls.
 */

import { createOctokitInstance } from "@/lib/utils/octokit";

type CacheEntry = { id: number; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

function cacheKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export async function getRepoId(
  token: string,
  owner: string,
  repo: string,
): Promise<number> {
  const key = cacheKey(owner, repo);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.id;
  }

  const octokit = createOctokitInstance(token);
  const response = await octokit.rest.repos.get({ owner, repo });
  const id = response.data.id;

  cache.set(key, { id, expiresAt: Date.now() + TTL_MS });
  return id;
}
