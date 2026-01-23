// app/api/notificar-bot/route.ts
// Proxy para llamar al bot desde el servidor (evita problemas de CORS)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

const BOT_URL = process.env.BOT_URL || "http://35.223.72.198:4002";

/**
 * POST /api/notificar-bot
 *
 * Proxy que llama a los endpoints del bot desde el servidor.
 * Esto evita problemas de CORS cuando el formulario intenta llamar al bot directamente.
 *
 * Body esperado:
 * {
 *   "action": "set_pending_ubicacion" | "solicitar_ubicacion",
 *   "telegram_id": number,
 *   "id_ubicacion": string (solo para set_pending_ubicacion)
 * }
 */
export async function POST(req: NextRequest) {
  console.log("🚀 /api/notificar-bot - Inicio de request");

  try {
    const body = await req.json();
    const { action, telegram_id, id_ubicacion } = body;

    console.log("📨 Body recibido:", JSON.stringify(body));

    if (!action || !telegram_id) {
      console.error("❌ Faltan parámetros requeridos");
      return NextResponse.json(
        { ok: false, error: "action y telegram_id son requeridos" },
        { status: 400 }
      );
    }

    console.log(`📤 Notificando al bot: action=${action}, telegram_id=${telegram_id}`);

    let endpoint = "";
    let payload: Record<string, any> = { telegram_id };

    switch (action) {
      case "set_pending_ubicacion":
        if (!id_ubicacion) {
          console.error("❌ Falta id_ubicacion para set_pending_ubicacion");
          return NextResponse.json(
            { ok: false, error: "id_ubicacion es requerido para set_pending_ubicacion" },
            { status: 400 }
          );
        }
        endpoint = "/set_pending_ubicacion";
        payload.id_ubicacion = id_ubicacion;
        break;

      case "solicitar_ubicacion":
        endpoint = "/solicitar_ubicacion";
        break;

      default:
        console.error(`❌ Acción desconocida: ${action}`);
        return NextResponse.json(
          { ok: false, error: `Acción desconocida: ${action}` },
          { status: 400 }
        );
    }

    const url = `${BOT_URL}${endpoint}`;
    console.log(`📡 Llamando a: ${url}`);
    console.log(`📦 Payload:`, JSON.stringify(payload));

    // Agregar timeout de 10 segundos para evitar que la conexión se quede colgada
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      console.log(`📥 Respuesta del bot (${response.status}):`, responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { raw: responseText };
      }

      if (!response.ok) {
        console.error(`❌ Error del bot: ${response.status}`, data);
        return NextResponse.json(
          { ok: false, error: `Error del bot: ${response.status}`, data },
          { status: response.status }
        );
      }

      console.log(`✅ Bot notificado exitosamente: ${action}`);
      return NextResponse.json({ ok: true, data });

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error("❌ Timeout llamando al bot (10s)");
        return NextResponse.json(
          { ok: false, error: "Timeout: el bot no respondió en 10 segundos" },
          { status: 504 }
        );
      }
      throw fetchError;
    }

  } catch (error: any) {
    console.error("❌ Error llamando al bot:", error?.message || error);
    console.error("❌ Stack:", error?.stack);
    return NextResponse.json(
      { ok: false, error: error?.message || "Error de conexión con el bot" },
      { status: 500 }
    );
  }
}
