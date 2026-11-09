"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell, Bookmark, ChevronsLeft, ChevronsRight, Compass, FileText, HelpCircle, Home, LineChart, Menu, Settings, User, X,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/brand/logo";
import { cx } from "@/components/ui";

import { NAV_COOKIE } from "./nav-cookie";

type Item = { href: string; label: string; icon: LucideIcon };

const PRIMARY: Item[] = [
  { href: "/app", label: "Home", icon: Home },
  { href: "/app/discover", label: "Opportunities", icon: Compass },
  { href: "/app/applications", label: "Applications", icon: FileText },
  { href: "/app/saved", label: "Saved", icon: Bookmark },
  { href: "/app/profile", label: "Profile", icon: User },
];
const SECONDARY: Item[] = [
  { href: "/app/insights", label: "Career insights", icon: LineChart },
  { href: "/app/notifications", label: "Notifications", icon: Bell },
  { href: "/app/settings", label: "Settings", icon: Settings },
  { href: "/app/help", label: "Help", icon: HelpCircle },
];


function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Candidate app frame: header, collapsible desktop sidebar (icon-only when collapsed, tooltips on
 * hover and keyboard focus, preference kept in a cookie), and a mobile drawer plus bottom bar.
 * The header's right side (admin link, bell, sign out) is rendered by the server and passed in.
 */
export function CandidateShell({ initialCollapsed, unread, headerRight, children }: { initialCollapsed: boolean; unread: number; headerRight: ReactNode; children: ReactNode }) {
  const pathname = usePathname() ?? "/app";
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${NAV_COOKIE}=${next ? "collapsed" : "expanded"}; path=/; max-age=31536000; samesite=lax`;
  };

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    menuButton.current?.focus();
  }, []);

  // Close the drawer when the route changes (a link inside it was followed).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (drawerOpen) setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen) return;
    closeButton.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeDrawer(); };
    const onResize = () => { if (window.matchMedia("(min-width: 1024px)").matches) setDrawerOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [drawerOpen, closeDrawer]);

  const badge = (item: Item) => (item.href === "/app/notifications" && unread > 0 ? (unread > 9 ? "9+" : String(unread)) : null);

  const navLink = (item: Item, opts: { compact: boolean; secondary?: boolean }) => {
    const active = isActive(pathname, item.href);
    const count = badge(item);
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "group relative flex items-center gap-3 rounded-lg text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-purple",
          opts.compact ? "size-10 justify-center" : "px-3 py-2.5",
          active ? "bg-purple-soft font-semibold text-purple" : opts.secondary ? "text-muted hover:bg-surface hover:text-navy" : "font-medium text-navy hover:bg-surface",
        )}
      >
        <item.icon aria-hidden className={cx("size-4 shrink-0", !opts.secondary || active ? "text-purple" : "")} />
        <span className={opts.compact ? "sr-only" : "min-w-0 flex-1 truncate"}>
          {item.label}
          {count && <span className="sr-only">, {unread} unread</span>}
        </span>
        {count && !opts.compact && (
          <span aria-hidden className="rounded-full bg-orange px-1.5 text-[10px] font-bold leading-4 text-white">{count}</span>
        )}
        {count && opts.compact && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-orange" />}
        {opts.compact && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-navy px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            {item.label}
          </span>
        )}
      </Link>
    );
  };

  const navLists = (compact: boolean) => (
    <>
      <ul className="space-y-1">{PRIMARY.map((n) => <li key={n.href}>{navLink(n, { compact })}</li>)}</ul>
      <ul className={cx("mt-4 space-y-1 border-t border-line pt-4")}>{SECONDARY.map((n) => <li key={n.href}>{navLink(n, { compact, secondary: true })}</li>)}</ul>
    </>
  );

  return (
    <div className="min-h-dvh bg-surface-muted">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <button
              ref={menuButton}
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              aria-expanded={drawerOpen}
              aria-controls="candidate-drawer"
              className="flex size-10 items-center justify-center rounded-full text-navy hover:bg-surface-muted lg:hidden"
            >
              <Menu aria-hidden className="size-5" />
            </button>
            <Logo href="/app" />
          </div>
          {headerRight}
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 pb-28 sm:px-6 lg:gap-8 lg:px-8 lg:pb-10">
        <nav
          id="candidate-sidebar"
          aria-label="Candidate"
          className={cx(
            "sticky top-[5.5rem] hidden h-[calc(100dvh-7rem)] shrink-0 flex-col self-start transition-[width] duration-200 ease-out motion-reduce:transition-none lg:flex",
            collapsed ? "w-10" : "w-52",
          )}
        >
          <div className="min-h-0 flex-1">{navLists(collapsed)}</div>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!collapsed}
            aria-controls="candidate-sidebar"
            className={cx(
              "group relative mt-4 flex items-center gap-3 rounded-lg border-t border-line pt-3 text-sm text-muted outline-none hover:text-navy focus-visible:ring-2 focus-visible:ring-purple",
              collapsed ? "w-10 justify-center" : "px-3",
            )}
          >
            {collapsed ? <ChevronsRight aria-hidden className="size-4" /> : <ChevronsLeft aria-hidden className="size-4" />}
            <span className={collapsed ? "sr-only" : ""}>{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
            {collapsed && (
              <span aria-hidden className="pointer-events-none absolute left-full top-1/2 z-40 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-navy px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-card transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                Expand sidebar
              </span>
            )}
          </button>
        </nav>

        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Mobile drawer: every section, including the ones the bottom bar has no room for. */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" aria-label="Close menu" tabIndex={-1} onClick={closeDrawer} className="absolute inset-0 bg-navy/40" />
          <div id="candidate-drawer" role="dialog" aria-modal="true" aria-label="Menu" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-surface-muted p-4 shadow-lift">
            <div className="mb-4 flex items-center justify-between">
              <Logo href="/app" />
              <button ref={closeButton} type="button" onClick={closeDrawer} aria-label="Close menu" className="flex size-10 items-center justify-center rounded-full text-navy hover:bg-surface">
                <X aria-hidden className="size-5" />
              </button>
            </div>
            <nav aria-label="Candidate (menu)">{navLists(false)}</nav>
          </div>
        </div>
      )}

      {/* Mobile bottom bar: the five main sections. */}
      <nav aria-label="Candidate (mobile)" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <ul className="grid grid-cols-5">
          {PRIMARY.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <li key={n.href}>
                <Link href={n.href} aria-current={active ? "page" : undefined}
                  className={cx("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", active ? "font-bold text-purple" : "font-medium text-navy-soft")}>
                  <n.icon aria-hidden className="size-5 text-purple" />{n.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
