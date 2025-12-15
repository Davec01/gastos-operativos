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

// Mapeo de tipos de gasto a product_id de Odoo
const PRODUCT_ID_MAP: Record<string, number> = {
  alimentacion: 9680, // ALIMENTACION OPERATIVO
  hospedaje: 12132, // ALOJAMIENTO OPERATIVO
  peajes: 9684, // PEAJE OPERATIVO
  otros: 12166, // GASTOS VARIOS
};

// Nombres descriptivos para cada tipo de gasto
const GASTO_NAMES: Record<string, string> = {
  alimentacion: "ALIMENTACION OPERATIVO",
  hospedaje: "ALOJAMIENTO OPERATIVO",
  peajes: "PEAJE OPERATIVO",
  otros: "GASTOS VARIOS",
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
 * Envía un gasto individual a Odoo usando el endpoint /api/gastos/register
 */
async function enviarGastoIndividualAOdoo(params: {
  empleado: string;
  telegram_id: number | null;
  employee_id: number | null;
  gasto: GastoOperativo;
  ubicacion: {
    lat: number | null;
    lon: number | null;
    ts: Date | null;
  };
  token: string;
}): Promise<{ success: boolean; message?: string; odoo_id?: number }> {
  try {
    const { empleado, telegram_id, employee_id, gasto, ubicacion, token } = params;

    const valor = toNum(gasto.valorTotal) || 0;
    if (valor <= 0) {
      return { success: false, message: "Valor del gasto debe ser mayor a 0" };
    }

    // Obtener product_id y nombre según el tipo de gasto
    const product_id = PRODUCT_ID_MAP[gasto.tipo];
    const name = GASTO_NAMES[gasto.tipo];

    if (!product_id) {
      return { success: false, message: `Tipo de gasto no soportado: ${gasto.tipo}` };
    }

    // Preparar fecha actual en formato YYYY-MM-DD
    const fecha = ubicacion.ts
      ? new Date(ubicacion.ts).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    // Preparar ubicación GPS
    const ubicacion_gps_telegram = ubicacion.lat && ubicacion.lon
      ? `${ubicacion.lat}° N, ${ubicacion.lon}° E`
      : "No disponible";

    // Preparar payload para Odoo (endpoint /api/gastos/register)
    const odooPayload = {
      name: name,
      product_id: product_id,
      total_amount: valor,
      employee_id: employee_id,
      description: `Gasto registrado por ${empleado}`,
      date: fecha,
      id_telegram: telegram_id ? String(telegram_id) : "",
      ubicacion_gps_vehiculo: "No disponible", // Por ahora no tenemos ubicación del vehículo
      ubicacion_gps_telegram: ubicacion_gps_telegram,
      company_id: 1,
      state: "draft",
      // No enviamos attachment por ahora (type_file, attachment_filename, attachment)
    };

    console.log("Enviando gasto individual a Odoo:", odooPayload);

    const response = await fetch(
      "https://viacotur16-qa11-22388022.dev.odoo.com/api/gastos/register",
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

    const resultText = await response.text();

    if (!response.ok) {
      console.error(`Error enviando a Odoo: ${response.status} - ${resultText}`);
      return { success: false, message: `Error ${response.status}: ${resultText}` };
    }

    // Intentar parsear la respuesta para obtener el ID de Odoo
    let odoo_id: number | undefined;
    try {
      const resultJson = JSON.parse(resultText);
      odoo_id = resultJson.id || resultJson.record_id || undefined;
      console.log("✅ Gasto enviado exitosamente a Odoo. ID:", odoo_id);
    } catch {
      console.log("✅ Gasto enviado exitosamente a Odoo (respuesta no JSON):", resultText);
    }

    return { success: true, message: resultText, odoo_id };

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
    const gastosPG: Array<{ pgId: number; gasto: GastoOperativo }> = [];

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

      // Guardar la asociación entre el ID de PG y el gasto para luego enviar a Odoo
      gastosPG.push({ pgId, gasto: it });

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

    // ==== Enviar a Odoo (cada gasto individualmente) ====
    let odooSuccess = false;
    let odooMessage = "";
    const odooResults: Array<{ tipo: string; success: boolean; message?: string }> = [];

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
          console.log(`Enviando ${items.length} gastos individuales a Odoo...`);

          // Enviar cada gasto individualmente y actualizar odoo_record_id
          for (const { pgId, gasto } of gastosPG) {
            const odooResult = await enviarGastoIndividualAOdoo({
              empleado,
              telegram_id,
              employee_id: empleadoOdoo.id, // Usamos el ID real de Odoo
              gasto: gasto,
              ubicacion: {
                lat: loc_lat,
                lon: loc_lon,
                ts: loc_ts,
              },
              token,
            });

            odooResults.push({
              tipo: gasto.tipo,
              success: odooResult.success,
              message: odooResult.message,
            });

            if (odooResult.success) {
              console.log(`✅ Gasto ${gasto.tipo} enviado exitosamente a Odoo. ID: ${odooResult.odoo_id}`);

              // Actualizar el odoo_record_id en PostgreSQL
              if (odooResult.odoo_id) {
                try {
                  await client.query(
                    `UPDATE public.gastos_operacionales SET odoo_record_id = $1 WHERE id = $2`,
                    [odooResult.odoo_id, pgId]
                  );
                  console.log(`✅ odoo_record_id actualizado en PG para gasto ${pgId}`);
                } catch (updateError) {
                  console.error(`Error actualizando odoo_record_id para gasto ${pgId}:`, updateError);
                }
              }
            } else {
              console.warn(`⚠️ Error al enviar gasto ${gasto.tipo} a Odoo:`, odooResult.message);
            }
          }

          // Considerar éxito si al menos un gasto se envió correctamente
          const gastosExitosos = odooResults.filter(r => r.success).length;
          odooSuccess = gastosExitosos > 0;
          odooMessage = `${gastosExitosos}/${items.length} gastos enviados a Odoo`;

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
