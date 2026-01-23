// app/api/validar-usuario-registrado/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * GET /api/validar-usuario-registrado?telegram_id=XXXXXX
 *
 * Verifica si el telegram_id está registrado en la tabla usuarios_registrados.
 * Retorna { registrado: true/false, nombre?: string }
 */
export async function GET(req: NextRequest) {
  const telegramId = req.nextUrl.searchParams.get("telegram_id");

  if (!telegramId) {
    return NextResponse.json(
      { registrado: false, error: "telegram_id es requerido" },
      { status: 400 }
    );
  }

  // Validar que sea un número válido
  const telegramIdNum = Number(telegramId);
  if (!Number.isFinite(telegramIdNum) || telegramIdNum <= 0) {
    return NextResponse.json(
      { registrado: false, error: "telegram_id debe ser un número válido" },
      { status: 400 }
    );
  }

  try {
    const client = await pool.connect();
    try {
      const query = `
        SELECT telegram_id, nombre
        FROM public.usuarios_registrados
        WHERE telegram_id = $1
        LIMIT 1
      `;
      const result = await client.query(query, [telegramIdNum]);

      if (result.rows.length > 0) {
        const usuario = result.rows[0];
        return NextResponse.json({
          registrado: true,
          nombre: (usuario.nombre || "").trim(),
          telegram_id: usuario.telegram_id
        });
      } else {
        return NextResponse.json({
          registrado: false,
          mensaje: "Usuario no registrado en el sistema"
        });
      }
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("❌ Error validando usuario registrado:", error);
    return NextResponse.json(
      { registrado: false, error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
