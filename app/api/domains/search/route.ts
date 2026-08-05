import { NextRequest, NextResponse } from "next/server";
import { authenticate, requirePlan, DOMAIN_RE } from "@/lib/domain-api";
import { checkDomainAvailability, getDomainPrice, isDeployConfigured } from "@/lib/vercel-deploy";
import { markedUpDomainPrice } from "@/lib/types";

export const runtime = "nodejs";

/** Availability + price check for a domain a user is considering buying, before they commit to paying. */
export async function GET(req: NextRequest) {
  try {
    if (!isDeployConfigured()) {
      return NextResponse.json(
        { error: "Domains aren't configured on this deployment yet. Set VERCEL_TOKEN." },
        { status: 400 }
      );
    }

    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const planError = await requirePlan(uid, idToken);
    if (planError) return planError;

    const domain = (req.nextUrl.searchParams.get("domain") ?? "").trim().toLowerCase();
    if (!DOMAIN_RE.test(domain)) {
      return NextResponse.json({ error: "Enter a valid domain, e.g. myapp.com." }, { status: 400 });
    }

    const available = await checkDomainAvailability(domain);
    if (!available) {
      return NextResponse.json({ domain, available: false });
    }

    const { purchasePrice, years } = await getDomainPrice(domain, 1);
    return NextResponse.json({ domain, available: true, years, price: markedUpDomainPrice(purchasePrice) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't search that domain.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
