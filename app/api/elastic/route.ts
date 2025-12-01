// app/api/elastic/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ensureIndex, bulkIndex } from "@/lib/elastic";

type SyncBody = {
  telegram_id?: number | string;
  minutes?: number | string;
};

function toPosInt(v: unknown, def = 5) {
  const n = Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  // limita ventana para prevenir queries enormes por accidente
  return Math.min(n, 60);
}

export async function POST(req: NextRequest) {
  // Forzamos JSON y validamos cuerpo
  let body: SyncBody = {};
  try {
    body = (await req.json()) ?? {};
  } catch {
    return NextResponse.json(
      { ok: false, error: "Cuerpo inválido. Envía JSON." },
      { status: 400 }
    );
  }

  const telegramIdRaw = body.telegram_id;
  if (telegramIdRaw === undefined || telegramIdRaw === null || String(telegramIdRaw).trim() === "") {
    return NextResponse.json(
      { ok: false, error: "telegram_id requerido" },
      { status: 400 }
    );
  }

  const telegram_id = Number(String(telegramIdRaw));
  if (!Number.isFinite(telegram_id)) {
    return NextResponse.json(
      { ok: false, error: "telegram_id debe ser numérico" },
      { status: 400 }
    );
  }

  const minutes = toPosInt(body.minutes, 5);

  const client = await pool.connect();
  try {
    // Trae filas con ubicación (loc_lat/lon/timestamp) asociadas a este usuario
    // dentro de la ventana indicada, y con datos mínimos para indexación.
    const q = `
      SELECT id AS id_pg,
             empleado, telegram_id, tipo, valor_total,
             loc_lat, loc_lon, loc_ts, created_at
        FROM public.gastos_operacionales
       WHERE telegram_id = $1
         AND created_at >= NOW() - ($2 || ' minutes')::interval
         AND loc_lat IS NOT NULL
         AND loc_lon IS NOT NULL
    `;
    const r = await client.query(q, [telegram_id, String(minutes)]);

    if (!r.rows.length) {
      // Nada que indexar; devolver 200 pero indicando 0
      return NextResponse.json({
        ok: true,
        count: 0,
        indexed: 0,
        message: "No hay filas con ubicación para indexar en la ventana solicitada",
      });
    }

    // Adaptar filas a documentos ES
    const docs = r.rows.map((row: any) => ({
      id_pg: row.id_pg,
      empleado: row.empleado,
      telegram_id: row.telegram_id,
      tipo: row.tipo,
      valor_total: row.valor_total,
      location: {
        lat: Number(row.loc_lat),
        lon: Number(row.loc_lon),
      },
      location_ts: row.loc_ts ? new Date(row.loc_ts).toISOString() : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    }));

    // Asegura el índice (idempotente) y hace bulk index
    await ensureIndex();
    const { indexed, errors } = await bulkIndex(docs);

    return NextResponse.json({
      ok: true,
      count: docs.length,
      indexed,
      errors: errors?.slice(0, 3) ?? [],
    });
  } catch (e: any) {
    console.error("[/api/elastic] sync-location error:", e?.meta?.body ?? e?.message ?? e);
    return NextResponse.json(
      { ok: false, error: e?.message || "Error interno" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
