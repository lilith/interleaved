"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfig } from "@/contexts/config-context";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Monitor, Smartphone, Tablet, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PreviewDevice = "phone" | "tablet" | "desktop";

const DEVICE_WIDTHS: Record<PreviewDevice, string> = {
  phone: "375px",
  tablet: "768px",
  desktop: "100%",
};

/**
 * Preview panel for the entry editor.
 * Renders content through the site's Handlebars templates in an iframe.
 * Mobile-native: defaults to phone viewport, device switcher for larger screens.
 */
export function PreviewPanel({
  content,
  filePath,
  format,
}: {
  content: string;
  filePath?: string;
  format?: "markdown" | "json";
}) {
  const { config } = useConfig();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<PreviewDevice>("desktop");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const renderPreview = useCallback(async () => {
    if (!config || !content) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/${config.owner}/${config.repo}/${encodeURIComponent(config.branch)}/preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: filePath,
            content,
            format: format || (filePath?.endsWith(".json") ? "json" : "markdown"),
          }),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        setError(`Preview failed: ${response.status}`);
        return;
      }

      const html = await response.text();
      setPreviewHtml(html);
    } catch (e: any) {
      setError(e.message || "Preview failed");
    } finally {
      setLoading(false);
    }
  }, [config, content, filePath, format]);

  // Debounced preview — re-render 800ms after content stops changing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(renderPreview, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [renderPreview]);

  // Write HTML to iframe via srcdoc
  useEffect(() => {
    if (iframeRef.current && previewHtml !== null) {
      iframeRef.current.srcdoc = previewHtml;
    }
  }, [previewHtml]);

  return (
    <div className="flex flex-col h-full min-h-[300px]">
      {/* Toolbar — compact on mobile */}
      <div className="flex items-center justify-between gap-2 p-2 border-b bg-muted/30">
        <div className="hidden md:flex items-center gap-1">
          <Button
            variant={device === "phone" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setDevice("phone")}
            title="Phone"
          >
            <Smartphone className="size-4" />
          </Button>
          <Button
            variant={device === "tablet" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setDevice("tablet")}
            title="Tablet"
          >
            <Tablet className="size-4" />
          </Button>
          <Button
            variant={device === "desktop" ? "secondary" : "ghost"}
            size="icon-sm"
            onClick={() => setDevice("desktop")}
            title="Desktop"
          >
            <Monitor className="size-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={renderPreview}
          disabled={loading}
          title="Refresh preview"
        >
          <RefreshCw className={cn("size-4", loading && "animate-spin")} />
        </Button>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 overflow-auto bg-gray-50 flex justify-center">
        {error ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            {error}
          </div>
        ) : previewHtml === null ? (
          <Skeleton className="w-full h-full" />
        ) : (
          <iframe
            ref={iframeRef}
            title="Preview"
            sandbox="allow-same-origin"
            className={cn(
              "bg-white border-0 h-full transition-all",
              device === "desktop" ? "w-full" : "shadow-lg rounded-lg my-4",
            )}
            style={{
              width: DEVICE_WIDTHS[device],
              maxWidth: "100%",
            }}
          />
        )}
      </div>
    </div>
  );
}
