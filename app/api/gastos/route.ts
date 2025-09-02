export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { es, ES_INDEX, ensureIndex } from "@/lib/elastic";

type GastoOperativo = {
  id?: string;
  tipo: "combustible" | "alimentacion" | "hospedaje" | "peajes" | "otros";
  tipoCombustible?: string;
  kmFinal?: string | number;
  tanqueoOperacional?: boolean;
  galonesTanqueados?: string | number;
  valorTotalCombustible?: string | number;
  valorTotal?: string | number;
};

function toNum(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const empleado: string = (body?.empleado || "").trim();
  const telegram_id: number | null = body?.telegram_id ?? null;
  const items: GastoOperativo[] = Array.isArray(body?.gastosOperativos) ? body.gastosOperativos : [];
  const loc = body?.ubicacion ?? {};
  const loc_lat = typeof loc?.lat === "number" ? loc.lat : null;
  const loc_lon = typeof loc?.lon === "number" ? loc.lon : null;
  const loc_ts  = loc?.ts ? new Date(loc.ts) : null;

  if (!empleado) return NextResponse.json({ error: "Falta 'empleado'" }, { status: 400 });
  if (!items.length) return NextResponse.json({ error: "Se requiere al menos un gasto" }, { status: 400 });

  for (const [i, it] of items.entries()) {
    if (!it?.tipo) return NextResponse.json({ error: `Falta 'tipo' en la fila ${i + 1}` }, { status: 400 });
    if (it.tipo === "combustible" && (it.valorTotalCombustible === undefined || it.valorTotalCombustible === "")) {
      return NextResponse.json({ error: `Falta 'valorTotalCombustible' (fila ${i + 1})` }, { status: 400 });
    }
    if (it.tipo !== "combustible" && (it.valorTotal === undefined || it.valorTotal === "")) {
      return NextResponse.json({ error: `Falta 'valorTotal' (fila ${i + 1})` }, { status: 400 });
    }
  }

  const client = await pool.connect();
  const esDocs: any[] = [];
  const nowISO = new Date().toISOString();

  try {
    await client.query("BEGIN");

    const q = `
      INSERT INTO public.gastos_operacionales (
        empleado, telegram_id, tipo, tipo_combustible, km_final, tanqueo_operacional,
        galones_tanqueados, valor_total_combustible, valor_total,
        loc_lat, loc_lon, loc_ts
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING id
    `;

    let inserted = 0;
    for (const it of items) {
      const params = [
        empleado,
        telegram_id,
        it.tipo,
        it.tipo === "combustible" ? (it.tipoCombustible ?? null) : null,
        toNum(it.kmFinal),
        !!it.tanqueoOperacional,
        toNum(it.galonesTanqueados),
        it.tipo === "combustible" ? toNum(it.valorTotalCombustible) : null,
        it.tipo === "combustible" ? null : toNum(it.valorTotal),
        loc_lat,
        loc_lon,
        loc_ts ? loc_ts.toISOString() : null,
      ];
      const r = await client.query(q, params);
      const pgId = r.rows[0].id;
      inserted++;

      esDocs.push({
        id_pg: pgId,
        empleado,
        telegram_id,
        tipo: it.tipo,
        tipo_combustible: it.tipo === "combustible" ? (it.tipoCombustible ?? null) : null,
        km_final: toNum(it.kmFinal),
        tanqueo_operacional: !!it.tanqueoOperacional,
        galones_tanqueados: toNum(it.galonesTanqueados),
        valor_total_combustible: it.tipo === "combustible" ? toNum(it.valorTotalCombustible) : null,
        valor_total: it.tipo === "combustible" ? null : toNum(it.valorTotal),
        location: (typeof loc_lat === "number" && typeof loc_lon === "number") ? { lat: loc_lat, lon: loc_lon } : null,
        location_ts: loc_ts ? loc_ts.toISOString() : null,
        created_at: nowISO,
      });
    }

    await client.query("COMMIT");

    // ==== Elasticsearch bulk ====
    let esIndexed = 0;
    let esErrors: any[] = [];
    try {
      await ensureIndex();
      if (esDocs.length) {
        const body = esDocs.flatMap(d => [{ index: { _index: ES_INDEX, _id: String(d.id_pg) } }, d]);
        const bulkRes = await es.bulk({ refresh: 'true', body });
        if (bulkRes.errors) {
          // @ts-ignore
          for (const item of bulkRes.items) {
            const op = item.index || item.create || item.update || item.delete;
            if (op?.error) esErrors.push(op.error);
          }
          esIndexed = esDocs.length - esErrors.length;
        } else {
          esIndexed = esDocs.length;
        }
      }
    } catch (e: any) {
      console.error("Error indexando ES:", e?.meta?.body ?? e);
      esErrors.push(e?.message || "error ES");
    }

    return NextResponse.json({
      success: true,
      empleado,
      inserted,
      es_indexed: esIndexed,
      es_errors: esErrors.length ? esErrors.slice(0, 3) : undefined,
    });
  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("Error guardando gastos:", {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
    });
    return NextResponse.json(
      { error: "Error al guardar", detail: error?.detail ?? error?.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
