export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
const FASTAPI_URL = process.env.FASTAPI_URL || "http://127.0.0.1:8000";

export async function GET(req: NextRequest) {
  const telegramId = req.nextUrl.searchParams.get("telegram_id");
  const maxAge = req.nextUrl.searchParams.get("max_age_min") || "60";
  if (!telegramId) return NextResponse.json({ error: "telegram_id requerido" }, { status: 400 });

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);

  try {
    const res = await fetch(
      `${FASTAPI_URL}/ultima_ubicacion?telegram_id=${encodeURIComponent(telegramId)}&max_age_min=${encodeURIComponent(maxAge)}`,
      { headers: { Accept: "application/json" }, signal: ctrl.signal }
    );
    clearTimeout(t);
    if (!res.ok) return NextResponse.json({ lat: null, lon: null, ts: null, fresh: false });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ lat: null, lon: null, ts: null, fresh: false });
  }
}
