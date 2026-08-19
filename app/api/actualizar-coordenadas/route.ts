export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

// Mapeo de tipos de gasto a product_id de Odoo
const PRODUCT_ID_MAP: Record<string, number> = {
  alimentacion: 9680,
  hospedaje: 12132,
  peajes: 9684,
  otros: 12166,
};

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
 * Obtiene el token dinámico y datos de empleados de la API con reintentos
 */
async function obtenerDatosEmpleados(): Promise<{
  token: string | null;
  empleados: any[];
}> {
  const maxRetries = 3;
  const timeoutMs = 30000;

  for (let intento = 1; intento <= maxRetries; intento++) {
    try {
      console.log(`[Empleados] 🔄 Intento ${intento}/${maxRetries} de obtener datos`);

      const response = await fetch("http://35.223.72.198:4001/empleados", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + Buffer.from("Vi4c0:P@ssw0rd").toString("base64"),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[Empleados] ✅ Datos obtenidos: ${data.items?.length || 0} empleados`);

      return {
        token: data.token || null,
        empleados: data.items || [],
      };
    } catch (error: any) {
      console.warn(`[Empleados] ⚠️ Intento ${intento} falló: ${error?.message}`);

      if (intento < maxRetries) {
        const waitTime = Math.pow(2, intento - 1) * 1000;
        console.log(`[Empleados] ⏳ Esperando ${waitTime}ms antes del siguiente intento...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  console.error("[Empleados] ❌ Todos los intentos fallaron");
  return { token: null, empleados: [] };
}

/**
 * Envía un gasto individual a Odoo
 */
async function enviarGastoAOdoo(gasto: any, token: string, employeeId: number) {
  try {
    const product_id = PRODUCT_ID_MAP[gasto.tipo];
    const name = GASTO_NAMES[gasto.tipo];

    if (!product_id) {
      return { success: false, message: `Tipo no soportado: ${gasto.tipo}` };
    }

    const valor = toNum(gasto.valor_total) || 0;
    if (valor <= 0) {
      return { success: false, message: "Valor debe ser mayor a 0" };
    }

    // Preparar ubicación GPS del Telegram
    const ubicacion_gps_telegram = gasto.loc_lat && gasto.loc_lon
      ? `${gasto.loc_lat}° N, ${gasto.loc_lon}° E`
      : "No disponible";

    // Preparar ubicación GPS del vehículo
    const ubicacion_gps_vehiculo = gasto.vehiculo_lat && gasto.vehiculo_lon
      ? `${gasto.vehiculo_lat}° N, ${gasto.vehiculo_lon}° E - Placa: ${gasto.vehiculo_placa}`
      : "No disponible";

    const odooPayload: Record<string, any> = {
      name: name,
      product_id: product_id,
      total_amount: valor,
      employee_id: employeeId,
      description: `Gasto registrado por ${gasto.empleado}`,
      date: gasto.fecha_gasto
        ? new Date(gasto.fecha_gasto).toISOString().split('T')[0]
        : gasto.created_at
          ? new Date(gasto.created_at).toISOString().split('T')[0]
          : new Date().toISOString().split('T')[0],
      id_telegram: String(gasto.telegram_id || ""),
      ubicacion_gps_vehiculo: ubicacion_gps_vehiculo,
      ubicacion_gps_telegram: ubicacion_gps_telegram,
      company_id: 1,
      state: "draft",
    };

    // Agregar archivo adjunto si existe
    if (gasto.archivo_base64 && gasto.archivo_nombre) {
      const type_file = gasto.archivo_tipo === 'pdf' ? 'pdf' : 'jpg';
      odooPayload.type_file = type_file;
      odooPayload.attachment_filename = gasto.archivo_nombre;
      odooPayload.attachment = gasto.archivo_base64;
      console.log(`[Odoo] 📎 Adjuntando archivo: ${gasto.archivo_nombre} (type_file: ${type_file})`);
    }

    console.log("[Odoo] Enviando gasto:", {
      ...odooPayload,
      attachment: odooPayload.attachment ? `[base64 ${odooPayload.attachment.length} chars]` : undefined
    });

    const response = await fetch(
      "https://www.viacotur.com/api/gastos/register",
      // "https://viacotur16-qa15-31954089.dev.odoo.com/api/gastos/register",
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
      console.error(`[Odoo] Error: ${response.status} - ${resultText}`);
      return { success: false, message: `Error ${response.status}: ${resultText}` };
    }

    console.log("[Odoo] ✅ Gasto enviado exitosamente");
    return { success: true, message: resultText };

  } catch (error: any) {
    console.error("[Odoo] Error:", error);
    return { success: false, message: error?.message || "Error desconocido" };
  }
}

/**
 * Webhook para recibir coordenadas desde el bot de Telegram
 *
 * El bot llama este endpoint después de que el usuario envía su ubicación
 * Se actualiza el último gasto registrado en los últimos 10 minutos
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { telegram_id, lat, lon, id_ubicacion } = body;

    console.log("[Webhook] Coordenadas recibidas:", { telegram_id, lat, lon, id_ubicacion });

    // Validar parámetros
    if (!telegram_id || !lat || !lon) {
      return NextResponse.json(
        {
          success: false,
          error: "Faltan parámetros requeridos: telegram_id, lat, lon",
        },
        { status: 400 }
      );
    }

    // Validar que sean números válidos
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);

    if (isNaN(latNum) || isNaN(lonNum)) {
      return NextResponse.json(
        {
          success: false,
          error: "Las coordenadas deben ser números válidos",
        },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    try {
      // Buscar por id_ubicacion si está disponible, sino por telegram_id + tiempo
      let query: string;
      let params: any[];

      // Verificar que id_ubicacion tenga un valor válido (no undefined, no null, no vacío)
      const hasValidIdUbicacion = id_ubicacion && typeof id_ubicacion === 'string' && id_ubicacion.trim() !== '';

      if (hasValidIdUbicacion) {
        // MÉTODO PREFERIDO: Buscar por id_ubicacion para identificar la sesión,
        // luego actualizar TODOS los gastos pendientes del mismo usuario en esa sesión.
        // Esto garantiza que si el usuario envió varios gastos a la vez, todos reciben GPS.
        console.log("[Webhook] Usando búsqueda por sesión (id_ubicacion de referencia):", id_ubicacion);
        query = `
          WITH ref AS (
            SELECT telegram_id, created_at
            FROM public.gastos_operacionales
            WHERE id_ubicacion = $3::uuid
              AND telegram_id = $4::bigint
            LIMIT 1
          )
          UPDATE public.gastos_operacionales g
          SET
            loc_lat = $1::double precision,
            loc_lon = $2::double precision,
            loc_ts = NOW(),
            ubicacion_gps_telegram = 'POINT(' || $2::text || ' ' || $1::text || ')'
          FROM ref
          WHERE g.telegram_id = ref.telegram_id
            AND g.created_at >= ref.created_at - INTERVAL '2 minutes'
            AND g.created_at <= ref.created_at + INTERVAL '2 minutes'
            AND (g.loc_lat IS NULL OR g.loc_lon IS NULL)
          RETURNING g.id, g.id_ubicacion, g.odoo_record_id, g.empleado
        `;
        params = [latNum, lonNum, id_ubicacion, Number(telegram_id)];
      } else {
        // FALLBACK: Buscar por telegram_id + ventana de tiempo (comportamiento anterior)
        console.log("[Webhook] Usando búsqueda por tiempo (fallback) para telegram_id:", telegram_id);
        query = `
          UPDATE public.gastos_operacionales
          SET
            loc_lat = $1::double precision,
            loc_lon = $2::double precision,
            loc_ts = NOW(),
            ubicacion_gps_telegram = 'POINT(' || $2::double precision::text || ' ' || $1::double precision::text || ')'
          WHERE telegram_id = $3::bigint
            AND created_at >= NOW() - INTERVAL '10 minutes'
            AND (loc_lat IS NULL OR loc_lon IS NULL)
          RETURNING id, id_ubicacion, odoo_record_id, empleado
        `;
        params = [latNum, lonNum, Number(telegram_id)];
      }

      const result = await client.query(query, params);

      if (result.rows.length === 0) {
        console.log(
          "[Webhook] No se encontró registro pendiente para telegram_id:",
          telegram_id
        );
        return NextResponse.json({
          success: false,
          error:
            "No se encontró registro de gastos pendiente en los últimos 10 minutos",
          hint: "Asegúrate de enviar la ubicación dentro de 10 minutos después de enviar el formulario",
        });
      }

      const updatedRecords = result.rows;
      console.log(
        `[Webhook] ${updatedRecords.length} registro(s) actualizado(s):`,
        updatedRecords.map((r: any) => r.id)
      );

      // ==== ENVIAR A ODOO AHORA QUE TENEMOS TODAS LAS COORDENADAS ====
      console.log("[Webhook] Enviando gastos a Odoo...");

      const { token, empleados } = await obtenerDatosEmpleados();
      let gastosEnviados = 0;

      if (token && empleados.length > 0) {
        for (const record of updatedRecords) {
          // Buscar datos completos del gasto
          const gastoQuery = `
            SELECT * FROM public.gastos_operacionales
            WHERE id = $1
          `;
          const gastoResult = await client.query(gastoQuery, [record.id]);

          if (gastoResult.rows.length === 0) continue;

          const gasto = gastoResult.rows[0];

          // Buscar empleado en Odoo por nombre del conductor (funciona tanto para conductores
          // que envían su propio formulario como para gastos enviados por el admin en su nombre)
          const nombreBuscar = gasto.empleado?.trim().toUpperCase();
          let empleadoOdoo = empleados.find(
            (emp: any) =>
              emp.puesto_trabajo?.toLowerCase() === "conductor" &&
              emp.nombre?.trim().toUpperCase() === nombreBuscar
          );

          // Fallback: buscar por PIN si no se encontró por nombre
          if (!empleadoOdoo) {
            empleadoOdoo = empleados.find(
              (emp: any) =>
                emp.codigo_pin === String(gasto.telegram_id) &&
                emp.puesto_trabajo?.toLowerCase() === "conductor"
            );
          }

          if (!empleadoOdoo) {
            console.warn(`[Webhook] Conductor "${gasto.empleado}" (PIN: ${gasto.telegram_id}) no encontrado en Odoo`);
            continue;
          }

          // Enviar a Odoo
          const odooResult = await enviarGastoAOdoo(gasto, token, empleadoOdoo.id);

          if (odooResult.success) {
            gastosEnviados++;
            // Marcar como enviado en BD
            await client.query(
              `UPDATE public.gastos_operacionales SET odoo_record_id = $1 WHERE id = $2`,
              [record.id, record.id]
            );
            console.log(`[Webhook] ✅ Gasto ${record.id} enviado a Odoo`);
          } else {
            console.error(`[Webhook] ❌ Error enviando gasto ${record.id} a Odoo:`, odooResult.message);
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Coordenadas guardadas y ${gastosEnviados}/${updatedRecords.length} gastos enviados a Odoo`,
        data: {
          records_updated: updatedRecords.length,
          gastos_enviados_odoo: gastosEnviados,
          records: updatedRecords.map((r: any) => ({
            id: r.id,
            id_ubicacion: r.id_ubicacion,
            odoo_record_id: r.odoo_record_id,
            empleado: r.empleado,
          })),
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[Webhook] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error al procesar coordenadas",
        details: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint para verificar el estado del servicio
 */
export async function GET() {
  return NextResponse.json({
    service: "actualizar-coordenadas",
    status: "online",
    description:
      "Webhook para recibir coordenadas GPS desde el bot de Telegram",
  });
}
