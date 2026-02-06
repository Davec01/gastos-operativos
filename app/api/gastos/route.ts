export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { ES_INDEX, ensureIndex, bulkIndex } from "@/lib/elastic";

type ArchivoAdjunto = {
  nombre: string;
  tipo: "pdf" | "image";
  base64: string;
};

type GastoOperativo = {
  id?: string;
  tipo: "alimentacion" | "hospedaje" | "peajes" | "otros";
  valorTotal?: string | number;
  archivo?: ArchivoAdjunto;
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
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic " + Buffer.from("Vi4c0:P@ssw0rd").toString("base64"),
      },
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
 * Obtiene la ubicación del vehículo desde la API externa de flota
 */
async function obtenerUbicacionVehiculo(telegramId: number | null): Promise<{
  lat: number | null;
  lon: number | null;
  placa: string | null;
  timestamp: string | null;
} | null> {
  if (!telegramId) return null;

  try {
    const response = await fetch(
      `http://localhost:3000/api/vehiculo-ubicacion?telegram_id=${telegramId}`,
      {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      console.warn(`No se pudo obtener ubicación del vehículo: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.success && data.ubicacion) {
      return {
        lat: data.ubicacion.lat,
        lon: data.ubicacion.lon,
        placa: data.placa,
        timestamp: data.ubicacion.timestamp,
      };
    }

    return null;
  } catch (error) {
    console.warn("Error obteniendo ubicación del vehículo:", error);
    return null;
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
  ubicacionVehiculo: {
    lat: number | null;
    lon: number | null;
    placa: string | null;
    timestamp: string | null;
  } | null;
  token: string;
}): Promise<{ success: boolean; message?: string; odoo_id?: number }> {
  try {
    const { empleado, telegram_id, employee_id, gasto, ubicacion, ubicacionVehiculo, token } = params;

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

    // Preparar ubicación GPS del Telegram
    const ubicacion_gps_telegram = ubicacion.lat && ubicacion.lon
      ? `${ubicacion.lat}° N, ${ubicacion.lon}° E`
      : "No disponible";

    // Preparar ubicación GPS del vehículo (coordenadas + placa)
    const ubicacion_gps_vehiculo = ubicacionVehiculo?.lat && ubicacionVehiculo?.lon
      ? `${ubicacionVehiculo.lat}° N, ${ubicacionVehiculo.lon}° E - Placa: ${ubicacionVehiculo.placa}`
      : "No disponible";

    // Preparar payload para Odoo (endpoint /api/gastos/register)
    const odooPayload: Record<string, any> = {
      name: name,
      product_id: product_id,
      total_amount: valor,
      employee_id: employee_id,
      description: `Gasto registrado por ${empleado}`,
      date: fecha,
      id_telegram: telegram_id ? String(telegram_id) : "",
      ubicacion_gps_vehiculo: ubicacion_gps_vehiculo,
      ubicacion_gps_telegram: ubicacion_gps_telegram,
      company_id: 1,
      state: "draft",
    };

    // Agregar attachment si existe
    if (gasto.archivo && gasto.archivo.base64) {
      // Odoo hr.expense solo acepta 'pdf' como type_file válido
      odooPayload.type_file = 'pdf';
      odooPayload.attachment_filename = gasto.archivo.nombre;
      odooPayload.attachment = gasto.archivo.base64;
      console.log(`📎 Adjuntando archivo: ${gasto.archivo.nombre} (type_file: pdf)`);
    }

    console.log("Enviando gasto individual a Odoo:", {
      ...odooPayload,
      attachment: odooPayload.attachment ? `[base64 ${odooPayload.attachment.length} chars]` : undefined
    });

    const response = await fetch(
      // "https://www.viacotur.com/api/gastos/register",
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

    // Parsear respuesta de Odoo (solo para logging)
    try {
      const resultJson = JSON.parse(resultText);
      console.log("✅ Gasto enviado a Odoo:", resultJson.response || resultText);
    } catch {
      console.log("✅ Gasto enviado a Odoo:", resultText);
    }

    // Nota: Odoo no devuelve ID, usamos nuestro propio ID de PostgreSQL (odoo_record_id)
    return { success: true, message: resultText, odoo_id: undefined };

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

    // Obtener ubicación del vehículo ANTES de insertar en la BD
    console.log("Obteniendo ubicación del vehículo para guardar en BD...");
    const ubicacionVehiculoBD = await obtenerUbicacionVehiculo(telegram_id);

    const q = `
      INSERT INTO public.gastos_operacionales (
        empleado, telegram_id, tipo, valor_total,
        loc_lat, loc_lon, loc_ts,
        vehiculo_placa, vehiculo_lat, vehiculo_lon, vehiculo_ts, ubicacion_gps_vehiculo,
        archivo_nombre, archivo_tipo, archivo_base64
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id, id_ubicacion
    `;

    let inserted = 0;
    const gastosPG: Array<{ pgId: number; idUbicacion: string; gasto: GastoOperativo }> = [];

    for (const it of items) {
      // Construir POINT de PostGIS para ubicación del vehículo si existe
      let ubicacionGpsVehiculoPoint = null;
      if (ubicacionVehiculoBD?.lat && ubicacionVehiculoBD?.lon) {
        // PostGIS usa formato POINT(longitud latitud) - nota el orden!
        ubicacionGpsVehiculoPoint = `POINT(${ubicacionVehiculoBD.lon} ${ubicacionVehiculoBD.lat})`;
      }

      const params = [
        empleado,
        telegram_id,
        it.tipo,
        toNum(it.valorTotal),
        loc_lat,
        loc_lon,
        loc_ts ? loc_ts.toISOString() : null,
        // Datos del vehículo
        ubicacionVehiculoBD?.placa || null,
        ubicacionVehiculoBD?.lat || null,
        ubicacionVehiculoBD?.lon || null,
        ubicacionVehiculoBD?.timestamp || null,
        ubicacionGpsVehiculoPoint, // Campo POINT de PostGIS
        // Datos del archivo adjunto
        it.archivo?.nombre || null,
        it.archivo?.tipo || null,
        it.archivo?.base64 || null,
      ];
      const r = await client.query(q, params);
      const pgId = r.rows[0].id;
      const idUbicacion = r.rows[0].id_ubicacion;
      inserted++;

      // Guardar la asociación entre el ID de PG, id_ubicacion y el gasto
      gastosPG.push({ pgId, idUbicacion, gasto: it });

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

    // ==== NO ENVIAR A ODOO TODAVÍA ====
    // Los gastos se enviarán a Odoo cuando el usuario envíe su ubicación desde Telegram
    // El webhook /api/actualizar-coordenadas se encargará de enviar a Odoo
    console.log("✅ Gastos guardados en BD. Esperando coordenadas del empleado desde Telegram para enviar a Odoo...");

    const odooSuccess = false;
    const odooMessage = "Esperando coordenadas del empleado desde Telegram";

    // DEBUG: Log de ubicaciones para verificar que se están devolviendo correctamente
    const ubicacionesResponse = gastosPG.map(g => ({
      tipo: g.gasto.tipo,
      id_ubicacion: g.idUbicacion
    }));
    console.log("📍 Ubicaciones a devolver al frontend:", JSON.stringify(ubicacionesResponse));

    return NextResponse.json({
      success: true,
      empleado,
      inserted,
      es_indexed: esIndexed,
      es_errors: esErrors.length ? esErrors.slice(0, 3) : undefined,
      odoo_success: odooSuccess,
      odoo_message: odooSuccess ? "Enviado a Odoo exitosamente" : `Error Odoo: ${odooMessage}`,
      // Devolver los id_ubicacion para que el formulario los pueda usar
      ubicaciones: ubicacionesResponse
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
