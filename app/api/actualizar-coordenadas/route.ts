export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * Webhook para recibir coordenadas desde el bot de Telegram
 *
 * El bot llama este endpoint después de que el usuario envía su ubicación
 * Se actualiza el último gasto registrado en los últimos 10 minutos
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { telegram_id, lat, lon } = body;

    console.log("[Webhook] Coordenadas recibidas:", { telegram_id, lat, lon });

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
      // Buscar el último registro pendiente de este usuario (últimos 10 minutos)
      // Solo actualizar si no tiene coordenadas ya
      const query = `
        UPDATE public.gastos_operacionales
        SET
          loc_lat = $1,
          loc_lon = $2,
          loc_ts = NOW(),
          ubicacion_gps_telegram = CONCAT('POINT(', $2, ' ', $1, ')')
        WHERE telegram_id = $3
          AND created_at >= NOW() - INTERVAL '10 minutes'
          AND (loc_lat IS NULL OR loc_lon IS NULL)
        RETURNING id, id_ubicacion, odoo_record_id, empleado
      `;

      const result = await client.query(query, [latNum, lonNum, telegram_id]);

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
        updatedRecords.map((r) => r.id)
      );

      return NextResponse.json({
        success: true,
        message: `Coordenadas guardadas correctamente. ${updatedRecords.length} gasto(s) actualizado(s)`,
        data: {
          records_updated: updatedRecords.length,
          records: updatedRecords.map((r) => ({
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
