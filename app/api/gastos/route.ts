export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ES_INDEX, ensureIndex, bulkIndex } from "@/lib/elastic";

type GastoOperativo = {
  id?: string;
  tipo: "alimentacion" | "hospedaje" | "peajes" | "otros";
  valorTotal?: string | number;
};

function toNum(v: unknown) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/**
 * Obtiene el token dinámico y datos de empleados de la API
 */
async function obtenerDatosEmpleados(): Promise<{
  token: string | null;
  empleados: any[];
}> {
  try {
    const response = await fetch("http://35.223.72.198:4001/empleados", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`Error obteniendo datos empleados: ${response.status}`);
      return { token: null, empleados: [] };
    }

    const data = await response.json();
    return {
      token: data.token || null,
      empleados: data.items || [],
    };
  } catch (error) {
    console.error("Error obteniendo datos de empleados:", error);
    return { token: null, empleados: [] };
  }
}

/**
 * Envía los gastos a Odoo
 */
async function enviarGastosAOdoo(params: {
  empleado: string;
  telegram_id: number | null;
  employee_id: number | null;
  gastos: GastoOperativo[];
  ubicacion: {
    lat: number | null;
    lon: number | null;
    ts: Date | null;
  };
  token: string;
}): Promise<{ success: boolean; message?: string }> {
  try {
    const { empleado, telegram_id, employee_id, gastos, ubicacion, token } = params;

    // Calcular totales por tipo
    const totales = {
      feeding_value: 0,
      lodging_value: 0,
      tolls_value: 0,
      others_value: 0,
    };

    gastos.forEach((gasto) => {
      const valor = toNum(gasto.valorTotal) || 0;

      switch (gasto.tipo) {
        case "alimentacion":
          totales.feeding_value += valor;
          break;
        case "hospedaje":
          totales.lodging_value += valor;
          break;
        case "peajes":
          totales.tolls_value += valor;
          break;
        case "otros":
          totales.others_value += valor;
          break;
      }
    });

    // Preparar payload para Odoo
    // IMPORTANTE: Odoo espera valores específicos según el ejemplo de Postman
    const odooPayload: any = {
      state: "draft",
      company_id: 1,
      employee_id: employee_id, // ID del empleado en Odoo (no telegram_id)

      // Fechas (check_in y check_out)
      check_in: ubicacion.ts ? new Date(ubicacion.ts).toISOString().replace('T', ' ').split('.')[0] : new Date().toISOString().replace('T', ' ').split('.')[0],
      check_out: new Date().toISOString().replace('T', ' ').split('.')[0],

      // Valores de gastos (solo enviar valor numérico, sin el campo booleano)
      ...(totales.feeding_value > 0 && {
        feeding_value: totales.feeding_value,
      }),
      ...(totales.lodging_value > 0 && {
        lodging_value: totales.lodging_value,
      }),
      ...(totales.tolls_value > 0 && {
        tolls_value: totales.tolls_value,
      }),
      ...(totales.others_value > 0 && {
        others_value: totales.others_value,
      }),

      // Campos de combustible (siempre 0 porque eliminamos combustible)
      fuel_type: "diesel",
      fuel_value: 0.0,

      // Observaciones
      observations: `Gastos operativos registrados por ${empleado}`,
      notes: telegram_id ? `Telegram ID: ${telegram_id}` : "Sin Telegram ID",
    };

    console.log("Enviando gastos a Odoo:", odooPayload);

    const response = await fetch(
      "https://viacotur16-qa11-22388022.dev.odoo.com/api/posoperacional/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(odooPayload),
        signal: AbortSignal.timeout(15000),
      }
    );

    const result = await response.text();

    if (!response.ok) {
      console.error(`Error enviando a Odoo: ${response.status} - ${result}`);
      return { success: false, message: `Error ${response.status}: ${result}` };
    }

    console.log("✅ Gastos enviados exitosamente a Odoo:", result);
    return { success: true, message: result };

  } catch (error: any) {
    console.error("Error enviando gastos a Odoo:", error);
    return { success: false, message: error?.message || "Error desconocido" };
  }
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
    if (it.valorTotal === undefined || it.valorTotal === "") {
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
        empleado, telegram_id, tipo, valor_total,
        loc_lat, loc_lon, loc_ts
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id
    `;

    let inserted = 0;
    for (const it of items) {
      const params = [
        empleado,
        telegram_id,
        it.tipo,
        toNum(it.valorTotal),
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
        valor_total: toNum(it.valorTotal),
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
        const result = await bulkIndex(esDocs);
        esIndexed = result.indexed;
        esErrors = result.errors;
      }
    } catch (e: any) {
      console.error("Error indexando ES:", e?.meta?.body ?? e);
      esErrors.push(e?.message || "error ES");
    }

    // ==== Enviar a Odoo ====
    let odooSuccess = false;
    let odooMessage = "";

    try {
      console.log("Obteniendo datos de API empleados...");
      const { token, empleados } = await obtenerDatosEmpleados();

      if (token && empleados.length > 0) {
        // Buscar el employee_id real en Odoo usando el codigo_pin (telegram_id)
        const empleadoOdoo = empleados.find(
          (emp: any) => emp.codigo_pin === String(telegram_id)
        );

        if (empleadoOdoo) {
          console.log(`Empleado encontrado en Odoo: ID ${empleadoOdoo.id}, PIN ${empleadoOdoo.codigo_pin}`);
          console.log("Enviando gastos a Odoo...");

          const odooResult = await enviarGastosAOdoo({
            empleado,
            telegram_id,
            employee_id: empleadoOdoo.id, // Usamos el ID real de Odoo
            gastos: items,
            ubicacion: {
              lat: loc_lat,
              lon: loc_lon,
              ts: loc_ts,
            },
            token,
          });

          odooSuccess = odooResult.success;
          odooMessage = odooResult.message || "";

          if (odooResult.success) {
            console.log("✅ Gastos enviados exitosamente a Odoo");
          } else {
            console.warn("⚠️ Error al enviar gastos a Odoo:", odooResult.message);
          }
        } else {
          console.warn(`⚠️ Empleado con PIN ${telegram_id} no encontrado en Odoo`);
          odooMessage = `Empleado con PIN ${telegram_id} no encontrado en sistema Odoo`;
        }
      } else {
        console.warn("⚠️ No se pudo obtener token o datos de empleados");
        odooMessage = "No se pudo obtener token o datos de empleados";
      }
    } catch (odooError: any) {
      console.error("Error en integración con Odoo:", odooError);
      odooMessage = odooError?.message || "Error desconocido";
    }

    return NextResponse.json({
      success: true,
      empleado,
      inserted,
      es_indexed: esIndexed,
      es_errors: esErrors.length ? esErrors.slice(0, 3) : undefined,
      odoo_success: odooSuccess,
      odoo_message: odooSuccess ? "Enviado a Odoo exitosamente" : `Error Odoo: ${odooMessage}`,
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
