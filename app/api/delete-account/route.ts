import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const db = adminDb();

    const [appsSnap, txSnap] = await Promise.all([
      db.collection("apps").where("userId", "==", uid).get(),
      db.collection("transactions").where("userId", "==", uid).get(),
    ]);

    const batch = db.batch();
    appsSnap.docs.forEach((d) => batch.delete(d.ref));
    txSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(db.collection("users").doc(uid));
    await batch.commit();

    // Deleting the Auth user last means a failure here still leaves Firestore
    // clean, and the Admin SDK's deleteUser doesn't require a recent sign-in
    // the way the client SDK's deleteUser does.
    await adminAuth().deleteUser(uid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
