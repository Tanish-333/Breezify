import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/domain-api";
import { getDoc } from "@/lib/firestore-rest";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";

const ANALYTICS_WINDOW_DAYS = 30;

/**
 * Serves the last 30 days of apps/{appId}/analytics/{day} rollups (visits
 * over time, top countries/referrers/pages, device split — see
 * lib/traffic-guard.ts's recordView) via the Admin SDK instead of a direct
 * client-side Firestore listener.
 *
 * analytics/{day}'s read rule only checks a get() on the parent
 * apps/{appId} doc (see firestore.rules) — no per-document field at all —
 * which looks like it should be safe for an unfiltered list/query (the
 * condition doesn't vary per potential result), but this exact pattern
 * turned out to still fail with PERMISSION_DENIED once a subcollection
 * had accumulated enough documents (confirmed live in production on this
 * exact collection, via app deletion — see lib/deploy-actions.ts's
 * deleteSubcollectionAdmin). Adding a userId field to every analytics doc
 * and filtering on it client-side would only fix it going forward —
 * existing historical rollups have no such field and would simply vanish
 * from the query's results, which is worse than the bug it fixes. Routing
 * through the Admin SDK here instead preserves all existing data and
 * sidesteps the whole rules-list-safety question, same as every other
 * fix for this bug class this session.
 */
export async function GET(req: NextRequest, { params }: { params: { appId: string } }) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const doc = await getDoc(`apps/${params.appId}`, idToken);
    if (!doc) return NextResponse.json({ error: "App not found." }, { status: 404 });
    // Matches analytics/{day}'s own read rule exactly: owner-only, no
    // collaborator access — see firestore.rules.
    if (doc.fields.userId !== uid) {
      return NextResponse.json({ error: "You don't have access to this app's analytics." }, { status: 403 });
    }

    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json({ days: [] });
    }

    const snap = await adminDb()
      .collection(`apps/${params.appId}/analytics`)
      .orderBy("__name__")
      .limitToLast(ANALYTICS_WINDOW_DAYS)
      .get();

    const days = snap.docs.map((d) => {
      const data = d.data();
      return {
        date: d.id,
        total: data.total ?? 0,
        countries: data.countries ?? {},
        referrers: data.referrers ?? {},
        devices: data.devices ?? {},
        paths: data.paths ?? {},
      };
    });

    return NextResponse.json({ days });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't load analytics.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
