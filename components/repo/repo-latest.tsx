"use client";

import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getVisits } from "@/lib/tracker";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, GitBranch } from "lucide-react";

function BranchDropdown({ owner, repo, currentBranch }: { owner: string; repo: string; currentBranch: string }) {
  const router = useRouter();
  const [branches, setBranches] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadBranches = useCallback(async () => {
    if (branches !== null) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/${owner}/${repo}/${encodeURIComponent(currentBranch)}/branches`);
      if (response.ok) {
        const data = await response.json();
        if (data.status === "success" && Array.isArray(data.data)) {
          setBranches(data.data.map((b: any) => typeof b === "string" ? b : b.name).sort());
        }
      }
    } catch {
      // Ignore — dropdown just won't show other branches
    } finally {
      setLoading(false);
    }
  }, [owner, repo, currentBranch, branches]);

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) loadBranches(); }}>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 rounded px-1.5 py-0.5 hover:bg-accent"
          title="Switch branch"
        >
          <GitBranch className="size-3" />
          {currentBranch}
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Branches</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {loading && (
          <DropdownMenuItem disabled>Loading...</DropdownMenuItem>
        )}
        {branches && branches.length === 0 && (
          <DropdownMenuItem disabled>No branches found</DropdownMenuItem>
        )}
        {branches?.map((branch) => (
          <DropdownMenuItem
            key={branch}
            onSelect={() => router.push(`/${owner}/${repo}/${encodeURIComponent(branch)}`)}
          >
            <GitBranch className="size-3 mr-1.5" />
            <span className={branch === currentBranch ? "font-medium" : ""}>{branch}</span>
            {branch === currentBranch && <span className="ml-auto text-xs text-muted-foreground">current</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RepoLatest() {
  const [recentVisits, setRecentVisits] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const displayedVisits = recentVisits.slice(0, 5);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const visits = getVisits();
      setRecentVisits(visits);
      setIsLoading(false);
    }
  }, []);

  if (isLoading) {
    return (
      <ul>
        {[...Array(3)].map((_, index) => (
          <li
            key={index}
            className={cn(
              "flex gap-x-2 items-center border border-b-0 last:border-b px-3 py-2 text-sm",
              index === 0 && "rounded-t-md",
              index === 2 && "rounded-b-md",
            )}
          >
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-5 w-24 rounded" />
            <Skeleton className="h-5 w-20 rounded ml-auto" />
            <Skeleton className="h-6 w-12 rounded" />
          </li>
        ))}
      </ul>
    );
  }

  if (displayedVisits.length === 0) return null;

  return (
    <ul>
      {displayedVisits.map((visit, index) => (
        <li
          key={`${visit.owner}/${visit.repo}`}
          className={cn(
            "flex gap-x-2 items-center border border-b-0 last:border-b px-3 py-2 text-sm",
            index === 0 && "rounded-t-md",
            index === displayedVisits.length - 1 && "rounded-b-md"
          )}
        >
          <img src={`https://github.com/${visit.owner}.png`} alt={visit.owner} className="h-6 w-6 rounded" />
          <Link
            className="truncate font-medium hover:underline"
            href={`/${visit.owner}/${visit.repo}/${encodeURIComponent(visit.branch)}`}
          >{visit.repo}</Link>
          <BranchDropdown owner={visit.owner} repo={visit.repo} currentBranch={visit.branch} />
          <div className="text-muted-foreground truncate hidden sm:block ml-auto">
            {formatDistanceToNow(new Date(visit.timestamp * 1000))} ago
          </div>
          <Link
            className={cn("shrink-0", buttonVariants({ variant: "outline", size: "xs"}))}
            href={`/${visit.owner}/${visit.repo}/${encodeURIComponent(visit.branch)}`}
          >
            Open
          </Link>
        </li>
      ))}
    </ul>
  );
}
