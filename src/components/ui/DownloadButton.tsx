"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./Button";
import { Spinner } from "./Skeleton";

type Phase = "idle" | "preparing" | "done" | "failed";

/** The file name the server gave in Content-Disposition, if any. */
function fileNameFrom(res: Response): string | null {
  const header = res.headers.get("Content-Disposition") ?? "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) return decodeURIComponent(star[1]);
  return /filename="?([^";]+)"?/i.exec(header)?.[1] ?? null;
}

/**
 * A button that downloads a generated file (e.g. a PDF) without leaving the page,
 * showing a spinner while the server prepares it, then a short "Downloaded" or
 * "Download failed" message. It stays a real `<a download>` link, so it still
 * works without JavaScript and with modified clicks (new tab, save link as…).
 */
export function DownloadButton({
  href,
  children,
  pendingText = "Preparing PDF…",
  variant = "secondary",
  size,
  className = "",
  ...props
}: Omit<ComponentProps<"a">, "href" | "download"> & {
  href: string;
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const [phase, setPhase] = useState<Phase>("idle");

  // Go back to the normal label a moment after finishing.
  useEffect(() => {
    if (phase !== "done" && phase !== "failed") return;
    const t = window.setTimeout(() => setPhase("idle"), phase === "done" ? 2500 : 4000);
    return () => window.clearTimeout(t);
  }, [phase]);

  const onClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // let the browser handle it
    e.preventDefault();
    if (phase === "preparing") return;
    setPhase("preparing");
    try {
      const res = await fetch(href, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileNameFrom(res) ?? href.split("/").pop() ?? "download.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setPhase("done");
    } catch {
      setPhase("failed");
    }
  };

  const busy = phase === "preparing";
  return (
    <a
      {...props}
      href={href}
      download
      onClick={onClick}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      className={buttonClass(variant, size, `${busy ? "cursor-progress opacity-90" : ""} ${className}`)}
    >
      {phase === "preparing" ? (
        <>
          <Spinner />
          {pendingText}
        </>
      ) : phase === "done" ? (
        <>✅ Downloaded</>
      ) : phase === "failed" ? (
        <>⚠️ Download failed, try again</>
      ) : (
        children
      )}
      <span role="status" className="sr-only">
        {phase === "preparing" ? pendingText : phase === "done" ? "Download started" : phase === "failed" ? "Download failed" : ""}
      </span>
    </a>
  );
}
