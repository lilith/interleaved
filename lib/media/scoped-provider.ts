/**
 * Scoped media storage provider.
 *
 * Wraps any MediaStorageProvider to prefix all paths with a repo-specific
 * namespace, ensuring tenant isolation in shared storage (R2/S3).
 *
 * Uses GitHub repo ID (numeric, stable across renames and transfers) as
 * the prefix: r/{repoId}/{path}
 *
 * Content files reference images with relative paths (e.g., "images/hero.jpg").
 * The scoped provider transparently maps to "r/12345/images/hero.jpg" in storage.
 * Public URLs include the prefix so the RIAPI proxy resolves them correctly.
 */

import type { MediaStorageProvider, MediaFile, UploadResult, PresignedUpload } from "./types";

export class ScopedMediaProvider implements MediaStorageProvider {
  readonly type;
  private inner: MediaStorageProvider;
  private prefix: string;

  /**
   * @param inner The underlying storage provider (e.g., ExternalMediaProvider)
   * @param repoId GitHub numeric repo ID (stable across renames)
   */
  constructor(inner: MediaStorageProvider, repoId: number) {
    this.inner = inner;
    this.type = inner.type;
    this.prefix = `r/${repoId}`;
  }

  private scopedPath(path: string): string {
    const clean = path.replace(/^\//, "");
    return `${this.prefix}/${clean}`;
  }

  private unscopedPath(path: string): string {
    const prefixSlash = `${this.prefix}/`;
    if (path.startsWith(prefixSlash)) {
      return path.slice(prefixSlash.length);
    }
    return path;
  }

  async listFiles(path: string): Promise<MediaFile[]> {
    const files = await this.inner.listFiles(this.scopedPath(path));
    return files.map((f) => ({
      ...f,
      // Strip prefix so the UI sees relative paths
      path: this.unscopedPath(f.path),
    }));
  }

  async uploadFile(
    path: string,
    contentBase64: string,
    options?: { contentType?: string; sha?: string },
  ): Promise<UploadResult> {
    const result = await this.inner.uploadFile(
      this.scopedPath(path),
      contentBase64,
      options,
    );
    return {
      ...result,
      // Return the scoped path for the URL, but unscoped for display
      path: this.unscopedPath(result.path),
      url: result.url, // URL already includes the full scoped path
    };
  }

  async getPresignedUploadUrl?(
    path: string,
    contentType: string,
  ): Promise<PresignedUpload | null> {
    if (!this.inner.getPresignedUploadUrl) return null;
    return this.inner.getPresignedUploadUrl(this.scopedPath(path), contentType);
  }

  getUrl(path: string, transforms?: string): string {
    return this.inner.getUrl(this.scopedPath(path), transforms);
  }

  async deleteFile(path: string, sha?: string): Promise<void> {
    return this.inner.deleteFile(this.scopedPath(path), sha);
  }
}
