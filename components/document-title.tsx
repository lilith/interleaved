"use client";

import { useEffect } from "react";

const APP_TITLE = "Interleaved";

/**
 * Format page titles for optimal browser autocomplete.
 *
 * The repo name comes first because that's what users type when
 * reaching for a specific site. Browser autocomplete matches from
 * the start of the title.
 *
 * Examples:
 *   "my-blog — Posts | Interleaved"
 *   "my-blog — Edit hello.md | Interleaved"
 *   "Projects | Interleaved"
 */
export const formatDocumentTitle = (title?: string | null) =>
  title ? `${title} | ${APP_TITLE}` : APP_TITLE;

export const formatRepoBranchTitle = (
  title: string,
  owner: string,
  repo: string,
  _branch?: string,
) => {
  // Repo name first for autocomplete: "my-blog — Posts"
  return `${repo} — ${title}`;
};

export function DocumentTitle({
  title,
}: {
  title?: string | null;
}) {
  useEffect(() => {
    document.title = formatDocumentTitle(title);
  }, [title]);

  return null;
}
