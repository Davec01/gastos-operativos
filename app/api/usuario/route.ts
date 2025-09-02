// app/api/usuario/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET(req: NextRequest) {
  const telegramId = req.nextUrl.searchParams.get("telegram_id");
  // Respuesta tolerante: nunca rompas el front
  if (!telegramId) return NextResponse.json({ empleado: "" }, { status: 200 });

  try {
    const client = await pool.connect();
    try {
      // Ajusta esquema/tabla si es distinto
      const q = `
        SELECT nombre
        FROM public.usuarios_registrados
        WHERE telegram_id = $1
        LIMIT 1
      `;
      const r = await client.query(q, [Number(telegramId)]); // 2039625899 cabe en INT
      const nombre = (r.rows?.[0]?.nombre || "").trim();
      return NextResponse.json({ empleado: nombre }, { status: 200 });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("❌ Error consultando Postgres:", e);
    // No rompas el flujo si hay error
    return NextResponse.json({ empleado: "" }, { status: 200 });
  }
}
