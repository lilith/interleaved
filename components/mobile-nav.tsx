"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConfig } from "@/contexts/config-context";
import { useUser } from "@/contexts/user-context";
import { hasGithubIdentity } from "@/lib/authz-shared";
import { isConfigEnabled } from "@/lib/config";
import { cn } from "@/lib/utils";
import { FileStack, FolderOpen, Settings, Code } from "lucide-react";

/**
 * Fixed bottom navigation bar for mobile devices.
 * Shows up to 4 items: first content collection, media, source/config, settings.
 * Hidden on desktop (md+).
 */
export function MobileNav() {
  const { config } = useConfig();
  const { user } = useUser();
  const pathname = usePathname();

  const items = useMemo(() => {
    if (!config?.object) return [];
    const configObject: any = config.object;
    const result: { key: string; label: string; href: string; icon: typeof FileStack }[] = [];

    // Content — show first collection
    const firstContent = configObject.content?.[0];
    if (firstContent) {
      result.push({
        key: "content",
        label: firstContent.label || firstContent.name || "Content",
        href: `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/${firstContent.type}/${encodeURIComponent(firstContent.name)}`,
        icon: FileStack,
      });
    }

    // Media — show first media config
    const firstMedia = configObject.media?.[0];
    if (firstMedia) {
      result.push({
        key: "media",
        label: "Media",
        href: `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/media/${firstMedia.name}`,
        icon: FolderOpen,
      });
    }

    // Configuration (source editing)
    if (hasGithubIdentity(user) && isConfigEnabled(configObject)) {
      result.push({
        key: "config",
        label: "Source",
        href: `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/configuration`,
        icon: Code,
      });
    }

    // Settings (collaborators etc.)
    if (configObject && Object.keys(configObject).length !== 0 && hasGithubIdentity(user)) {
      result.push({
        key: "settings",
        label: "Settings",
        href: `/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/settings`,
        icon: Settings,
      });
    }

    return result.slice(0, 4);
  }, [config, user]);

  if (items.length === 0) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background md:hidden safe-bottom">
      <div className="flex items-stretch justify-around">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:text-foreground",
              )}
            >
              <Icon className="size-5" />
              <span className="truncate max-w-[4.5rem]">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
