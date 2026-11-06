import Link from "next/link";

/** AVSAR mark: an open chevron (a doorway seen in perspective) in orange → purple. */
export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <defs>
        <linearGradient id="avsar-mark" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#e8711f" />
          <stop offset="55%" stopColor="#d9452b" />
          <stop offset="100%" stopColor="#4c2fb8" />
        </linearGradient>
      </defs>
      <path d="M4 27 L16 4 L28 27 L22 27 L16 15 L10 27 Z" fill="url(#avsar-mark)" />
    </svg>
  );
}

export function Logo({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`inline-flex items-center gap-2 font-sans text-xl font-bold tracking-tight text-navy ${className}`} aria-label="Avsar home">
      <LogoMark />
      <span>Avsar</span>
    </Link>
  );
}
