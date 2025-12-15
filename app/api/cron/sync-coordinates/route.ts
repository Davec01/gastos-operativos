export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * Endpoint cron para sincronización automática de coordenadas
 *
 * Este endpoint debe ser llamado por un servicio de cron externo (cada minuto)
 * Incluye autenticación mediante token para seguridad
 */
export async function GET(request: Request) {
  try {
    // Verificar token de autorización
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.CRON_SECRET_TOKEN;

    if (!expectedToken) {
      console.error("[Cron] CRON_SECRET_TOKEN no configurado");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${expectedToken}`) {
      console.error("[Cron] Token inválido");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Cron] Ejecutando sincronización programada...");

    // Llamar al endpoint de sincronización
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      process.env.VERCEL_URL ||
      "http://localhost:3000";

    const syncUrl = `${baseUrl}/api/sincronizar-coordenadas-odoo`;

    const response = await fetch(syncUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(50000), // 50 segundos de timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Error en sincronización: ${response.status} - ${errorText}`
      );
    }

    const result = await response.json();

    console.log("[Cron] Sincronización completada:", result.summary);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      sync_result: result,
    });
  } catch (error) {
    console.error("[Cron] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error desconocido",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Endpoint POST (alternativo) para llamar desde servicios que prefieren POST
 */
export async function POST(request: Request) {
  return GET(request);
}
