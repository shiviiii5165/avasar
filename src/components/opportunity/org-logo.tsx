"use client";

import { useState } from "react";

/** The company's real logo (served by /api/logo from Avsar's own origin), or its initials when none is found. */
export function OrgLogo({ name, size = "md", ink }: { name: string; size?: "md" | "lg"; ink?: string }) {
  const [failed, setFailed] = useState(false);
  const dim = size === "lg" ? "size-16 rounded-2xl text-xl" : "size-10 rounded-xl text-sm";
  const initials = (() => {
    const w = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
    return !w.length ? "?" : (w.length === 1 ? w[0].slice(0, 2) : w[0][0] + w[1][0]).toUpperCase();
  })();
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center overflow-hidden border border-black/5 bg-white font-bold tracking-wide shadow-sm ${dim}`} style={{ color: ink ?? "#1c1f4a" }}>
      {failed ? (
        initials
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- small same-origin icon; next/image adds nothing here
        <img src={`/api/logo?name=${encodeURIComponent(name)}`} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="size-[70%] object-contain" />
      )}
    </span>
  );
}
