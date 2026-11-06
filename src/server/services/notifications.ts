import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import type { Db } from "../db/client";
import { notificationPreferences, notifications } from "../db/schema";
import { enqueueJob } from "./jobs";

export const NOTIFICATION_KINDS = {
  application_submitted: "Application submitted",
  application_status: "Application status changes",
  deadline_reminder: "Deadline reminders",
  moderation_result: "Report outcomes",
  account: "Account activity",
} as const;
export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

/**
 * Transactional notification: in-app row (deduplicated by dedupeKey) plus a queued email job when the
 * person allows email for that kind. Promotional messages are not sent through this path at all.
 */
export async function notify(db: Db, n: { identityId: string; kind: NotificationKind; dedupeKey: string; title: string; body?: string; link?: string }) {
  const [pref] = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.identityId, n.identityId), eq(notificationPreferences.kind, n.kind)));
  const inApp = pref?.inApp ?? true;
  const email = pref?.email ?? true;
  let created = false;
  if (inApp) {
    const rows = await db.insert(notifications).values({ identityId: n.identityId, kind: n.kind, dedupeKey: n.dedupeKey, title: n.title, body: n.body ?? null, link: n.link ?? null }).onConflictDoNothing().returning({ id: notifications.id });
    created = rows.length > 0;
  }
  if (email) await enqueueJob(db, "email.notification", { identityId: n.identityId, kind: n.kind, title: n.title, body: n.body ?? null, link: n.link ?? null }, `email:${n.dedupeKey}`);
  return { created };
}

export async function listNotifications(db: Db, identityId: string, limit = 50) {
  return db.select().from(notifications).where(eq(notifications.identityId, identityId)).orderBy(desc(notifications.createdAt)).limit(limit);
}

export async function unreadCount(db: Db, identityId: string) {
  const rows = await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.identityId, identityId), isNull(notifications.readAt)));
  return rows.length;
}

export async function markAllRead(db: Db, identityId: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.identityId, identityId), isNull(notifications.readAt)));
}

export async function setPreference(db: Db, identityId: string, kind: NotificationKind, inApp: boolean, email: boolean) {
  await db.insert(notificationPreferences).values({ identityId, kind, inApp, email }).onConflictDoUpdate({ target: [notificationPreferences.identityId, notificationPreferences.kind], set: { inApp, email } });
}
