export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * Endpoint para sincronizar coordenadas GPS con Odoo
 *
 * Este endpoint:
 * 1. Busca registros con coordenadas nuevas que no se han enviado a Odoo
 * 2. Actualiza Odoo con las coordenadas usando el odoo_record_id
 * 3. Marca los registros como enviados (odoo_coordenadas_enviadas = TRUE)
 *
 * Debe ser llamado periódicamente (ej: cada minuto via cron)
 */
export async function POST(request: Request) {
  try {
    console.log("[Sync] Iniciando sincronización de coordenadas con Odoo...");

    // Obtener token dinámico de la API de empleados
    const tokenResponse = await fetch("http://35.223.72.198:4001/empleados", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Error obteniendo token: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json();
    const token = tokenData.token;

    if (!token) {
      throw new Error("No se pudo obtener token de autenticación");
    }

    const client = await pool.connect();

    try {
      // Buscar registros con coordenadas nuevas que no se han enviado a Odoo
      const pendingQuery = `
        SELECT
          id,
          id_ubicacion,
          telegram_id,
          odoo_record_id,
          tipo,
          empleado,
          valor_total,
          loc_lat,
          loc_lon,
          loc_ts,
          created_at
        FROM public.gastos_operacionales
        WHERE odoo_record_id IS NOT NULL
          AND loc_lat IS NOT NULL
          AND loc_lon IS NOT NULL
          AND odoo_coordenadas_enviadas = FALSE
          AND loc_ts >= NOW() - INTERVAL '1 hour'
        ORDER BY loc_ts DESC
        LIMIT 50
      `;

      const pendingRecords = await client.query(pendingQuery);

      console.log(
        `[Sync] Encontrados ${pendingRecords.rows.length} registros pendientes de sincronización`
      );

      const results = [];

      for (const record of pendingRecords.rows) {
        try {
          // Preparar las coordenadas en el formato que espera Odoo
          const lat_origin = record.loc_lat.toString();
          const long_origin = record.loc_lon.toString();

          console.log(
            `[Sync] Actualizando Odoo record ${record.odoo_record_id} con coords: ${lat_origin}, ${long_origin}`
          );

          // Actualizar Odoo con las coordenadas
          // Nota: Ajusta esta URL según el endpoint real de Odoo para actualizar coordenadas
          const odooResponse = await fetch(
            `https://viacotur16-qa11-22388022.dev.odoo.com/api/gastos/${record.odoo_record_id}`,
            {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                ubicacion_gps_telegram: `${lat_origin}, ${long_origin}`,
                // Si Odoo tiene campos separados para lat/lon, agrégalos aquí
                // lat_origin: lat_origin,
                // long_origin: long_origin,
              }),
              signal: AbortSignal.timeout(15000),
            }
          );

          if (odooResponse.ok) {
            // Marcar como enviado en PostgreSQL
            await client.query(
              `
              UPDATE public.gastos_operacionales
              SET odoo_coordenadas_enviadas = TRUE
              WHERE id = $1
            `,
              [record.id]
            );

            results.push({
              id: record.id,
              id_ubicacion: record.id_ubicacion,
              odoo_record_id: record.odoo_record_id,
              tipo: record.tipo,
              status: "success",
            });

            console.log(
              `[Sync] ✅ Actualizado exitosamente: ${record.id_ubicacion} (Odoo ID: ${record.odoo_record_id})`
            );
          } else {
            const errorText = await odooResponse.text();
            results.push({
              id: record.id,
              id_ubicacion: record.id_ubicacion,
              odoo_record_id: record.odoo_record_id,
              tipo: record.tipo,
              status: "error",
              error: `HTTP ${odooResponse.status}: ${errorText}`,
            });

            console.error(
              `[Sync] ❌ Error Odoo para ${record.id_ubicacion}:`,
              errorText
            );
          }
        } catch (error) {
          results.push({
            id: record.id,
            id_ubicacion: record.id_ubicacion,
            odoo_record_id: record.odoo_record_id,
            tipo: record.tipo,
            status: "error",
            error: error instanceof Error ? error.message : "Error desconocido",
          });

          console.error(
            `[Sync] ❌ Error procesando ${record.id_ubicacion}:`,
            error
          );
        }
      }

      const successCount = results.filter((r) => r.status === "success").length;
      const errorCount = results.filter((r) => r.status === "error").length;

      console.log(
        `[Sync] Completado: ${successCount} exitosos, ${errorCount} errores`
      );

      return NextResponse.json({
        success: true,
        summary: {
          total_processed: results.length,
          successful: successCount,
          failed: errorCount,
        },
        results: results,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[Sync] Error general:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Error en sincronización",
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
  try {
    const client = await pool.connect();
    try {
      // Obtener estadísticas de sincronización
      const stats = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE odoo_record_id IS NOT NULL AND loc_lat IS NOT NULL AND loc_lon IS NOT NULL AND odoo_coordenadas_enviadas = FALSE) as pending,
          COUNT(*) FILTER (WHERE odoo_coordenadas_enviadas = TRUE) as synced,
          COUNT(*) FILTER (WHERE odoo_record_id IS NULL) as no_odoo_id
        FROM public.gastos_operacionales
        WHERE created_at >= NOW() - INTERVAL '24 hours'
      `);

      return NextResponse.json({
        service: "sincronizar-coordenadas-odoo",
        status: "online",
        description: "Sincronización periódica de coordenadas GPS con Odoo",
        stats: {
          last_24h: stats.rows[0],
        },
      });
    } finally {
      client.release();
    }
  } catch (error) {
    return NextResponse.json(
      {
        service: "sincronizar-coordenadas-odoo",
        status: "error",
        error: error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
