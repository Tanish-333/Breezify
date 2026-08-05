import { NextRequest, NextResponse } from "next/server";
import { commit, updateWrite } from "@/lib/firestore-rest";
import { addProjectDomain, getProjectDomainStatus, isDeployConfigured, removeProjectDomain } from "@/lib/vercel-deploy";
import { authenticate, requirePlan, loadDeployedApp, DOMAIN_RE } from "@/lib/domain-api";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    if (!isDeployConfigured()) {
      return NextResponse.json(
        { error: "Deploys aren't configured on this deployment yet. Set VERCEL_TOKEN." },
        { status: 400 }
      );
    }

    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const { appId, domain } = await req.json();
    if (!appId || typeof appId !== "string") {
      return NextResponse.json({ error: "Missing app." }, { status: 400 });
    }
    const normalizedDomain = typeof domain === "string" ? domain.trim().toLowerCase() : "";
    if (!DOMAIN_RE.test(normalizedDomain)) {
      return NextResponse.json({ error: "Enter a valid domain, e.g. myapp.com." }, { status: 400 });
    }

    const planError = await requirePlan(uid, idToken);
    if (planError) return planError;

    const loaded = await loadDeployedApp(appId, uid, idToken);
    if (loaded.error) return loaded.error;

    let status;
    try {
      status = await addProjectDomain(loaded.slug, normalizedDomain);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't add that domain.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    // Attaching here always means "a domain I already own elsewhere" — a
    // domain actually bought through Breezify is attached by the Stripe
    // webhook instead (see app/api/stripe/webhook), which is the only place
    // that legitimately sets domainPurchased/domainExpiresAt/domainAutoRenew.
    // Without resetting them here, swapping in a different domain after a
    // purchase (or after DELETE below already detached it) would leave this
    // domain's record wrongly flagged as Breezify-purchased with another
    // domain's stale expiry date.
    const wasPurchased = Boolean(loaded.doc.fields.domainPurchased);
    const stillSameDomain = loaded.doc.fields.customDomain === normalizedDomain;

    await commit(
      [
        updateWrite(
          `apps/${appId}`,
          {
            customDomain: normalizedDomain,
            customDomainVerified: status.verified,
            ...(wasPurchased && !stillSameDomain
              ? { domainPurchased: false, domainExpiresAt: null, domainAutoRenew: false }
              : {}),
          },
          [
            "customDomain",
            "customDomainVerified",
            ...(wasPurchased && !stillSameDomain
              ? ["domainPurchased", "domainExpiresAt", "domainAutoRenew"]
              : []),
          ]
        ),
      ],
      idToken
    );

    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add domain.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Re-checks verification status, e.g. after the caller has added the DNS record Vercel asked for. */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const appId = req.nextUrl.searchParams.get("appId");
    if (!appId) return NextResponse.json({ error: "Missing app." }, { status: 400 });

    const loaded = await loadDeployedApp(appId, uid, idToken);
    if (loaded.error) return loaded.error;

    const domain = loaded.doc.fields.customDomain as string | undefined;
    if (!domain) return NextResponse.json({ error: "This app has no custom domain configured." }, { status: 400 });

    let status;
    try {
      status = await getProjectDomainStatus(loaded.slug, domain);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't check that domain's status.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (status.verified !== Boolean(loaded.doc.fields.customDomainVerified)) {
      await commit(
        [updateWrite(`apps/${appId}`, { customDomainVerified: status.verified }, ["customDomainVerified"])],
        idToken
      ).catch(() => {});
    }

    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to check domain status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const { appId } = await req.json();
    if (!appId || typeof appId !== "string") {
      return NextResponse.json({ error: "Missing app." }, { status: 400 });
    }

    const loaded = await loadDeployedApp(appId, uid, idToken);
    if (loaded.error) return loaded.error;

    const domain = loaded.doc.fields.customDomain as string | undefined;
    if (domain) {
      try {
        await removeProjectDomain(loaded.slug, domain);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't remove that domain.";
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    // Detaching doesn't cancel a real registration bought through Breezify —
    // that domain is still registered and billed at the registrar regardless
    // — but this app record shouldn't keep claiming ownership of a domain
    // that's no longer attached to it, especially once a different domain
    // might get attached here later (see the matching reset in POST above).
    await commit(
      [
        updateWrite(
          `apps/${appId}`,
          {
            customDomain: null,
            customDomainVerified: false,
            domainPurchased: false,
            domainExpiresAt: null,
            domainAutoRenew: false,
          },
          ["customDomain", "customDomainVerified", "domainPurchased", "domainExpiresAt", "domainAutoRenew"]
        ),
      ],
      idToken
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove domain.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
