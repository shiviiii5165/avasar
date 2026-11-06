import { and, eq } from "drizzle-orm";

import { deleteAccountAction, notificationPrefsAction, saveProfileFieldsAction } from "@/app/actions/candidate";
import { ActionForm, Input } from "@/components/forms/action-form";
import { buttonClass, Card, PageHeader } from "@/components/ui";
import { requireCandidate } from "@/server/auth/session";
import { getDb } from "@/server/db/client";
import { candidateProfiles, notificationPreferences } from "@/server/db/schema";
import { NOTIFICATION_KINDS } from "@/server/services/notifications";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await requireCandidate("/app/settings");
  const db = await getDb();
  const [[profile], prefs] = await Promise.all([
    db.select({ visibility: candidateProfiles.visibility }).from(candidateProfiles).where(eq(candidateProfiles.id, session.profileId)),
    db.select().from(notificationPreferences).where(and(eq(notificationPreferences.identityId, session.identity.id))),
  ]);
  const pref = (kind: string) => prefs.find((p) => p.kind === kind) ?? { inApp: true, email: true };

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Settings" />

      <Card>
        <h2 className="text-lg font-semibold text-navy">Profile visibility</h2>
        <ActionForm action={saveProfileFieldsAction.bind(null, "visibility")} submitLabel="Save visibility" className="mt-3">
          <fieldset className="space-y-2">
            <legend className="sr-only">Who can see your profile</legend>
            {[
              ["private", "Private", "Only you. Applications still share what you choose when you apply."],
              ["application", "Application-based", "Organizations you apply to can view your profile."],
              ["discoverable", "Discoverable", "Verified employers may find you when that feature launches. You can turn this off any time."],
            ].map(([v, title, body]) => (
              <label key={v} className="flex gap-3 rounded-lg border border-line p-3 text-sm has-[:checked]:border-purple has-[:checked]:bg-purple-soft">
                <input type="radio" name="visibility" value={v} defaultChecked={profile.visibility === v} className="mt-0.5 size-4 accent-purple" />
                <span><span className="font-semibold text-navy">{title}</span><br /><span className="text-muted">{body}</span></span>
              </label>
            ))}
          </fieldset>
        </ActionForm>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-navy">Notifications</h2>
        <ActionForm action={notificationPrefsAction} submitLabel="Save preferences" className="mt-3">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="py-2 font-medium">Update</th><th className="py-2 font-medium">In app</th><th className="py-2 font-medium">Email</th></tr></thead>
            <tbody className="divide-y divide-line">
              {Object.entries(NOTIFICATION_KINDS).map(([kind, label]) => (
                <tr key={kind}>
                  <td className="py-2 text-navy">{label}</td>
                  <td className="py-2"><input type="checkbox" name={`${kind}_inapp`} defaultChecked={pref(kind).inApp} aria-label={`${label} in app`} className="size-4 accent-purple" /></td>
                  <td className="py-2"><input type="checkbox" name={`${kind}_email`} defaultChecked={pref(kind).email} aria-label={`${label} by email`} className="size-4 accent-purple" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-muted">These are service messages only. Avsar doesn&apos;t send promotional email from these settings.</p>
        </ActionForm>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-navy">Your data</h2>
        <p className="mt-1 text-sm text-muted">Download everything Avsar holds about you as JSON.</p>
        <a href="/api/me/export" className={buttonClass("secondary", "sm", "mt-3")}>Export my data</a>
      </Card>

      <Card className="border-danger/30">
        <h2 className="text-lg font-semibold text-danger">Delete account</h2>
        <p className="mt-1 text-sm text-muted">Removes your profile, skills, resumes and saved items and signs you out everywhere. Applications you already submitted stay with the organization as they were sent. This can&apos;t be undone.</p>
        <ActionForm action={deleteAccountAction} className="mt-3">
          <Input name="confirm" label='Type "DELETE" to confirm' autoComplete="off" required />
          <button type="submit" className={buttonClass("danger", "sm")}>Delete my account</button>
        </ActionForm>
      </Card>
    </div>
  );
}
