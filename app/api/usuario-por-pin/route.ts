// app/api/usuario-por-pin/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

/**
 * Interfaz para empleado desde el endpoint externo
 */
interface EmpleadoExterno {
  id: number;
  nombre: string;
  identificacion: string;
  codigo_pin: string;
  puesto_trabajo: string;
  telefono_movil_laboral: string;
  correo_laboral: string;
  compania: string;
}

/**
 * Respuesta del endpoint /empleados
 */
interface EmpleadosResponse {
  status: string;
  token: string;
  total_estimado: number;
  paginas_recorridas: number;
  items: EmpleadoExterno[];
}

/**
 * GET /api/usuario-por-pin?pin=123456789
 *
 * Busca un empleado por su código PIN en la API externa de empleados.
 * El PIN corresponde al telegram_id del usuario.
 */
export async function GET(req: NextRequest) {
  const pin = req.nextUrl.searchParams.get("pin");

  // Respuesta tolerante: nunca rompas el front
  if (!pin) {
    return NextResponse.json({ empleado: "", mensaje: "PIN no proporcionado" }, { status: 200 });
  }

  try {
    // Llamar a la API externa de empleados
    const url = "http://35.223.72.198:4001/empleados";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      // Timeout de 10 segundos
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      console.error(`❌ Error obteniendo empleados: ${response.status} ${response.statusText}`);
      return NextResponse.json({ empleado: "", mensaje: "Error al consultar empleados" }, { status: 200 });
    }

    const data: EmpleadosResponse = await response.json();

    if (!data.items || data.items.length === 0) {
      return NextResponse.json({ empleado: "", mensaje: "No hay empleados disponibles" }, { status: 200 });
    }

    // Buscar empleado cuyo codigo_pin coincida con el PIN proporcionado
    const empleadoEncontrado = data.items.find(
      (emp) => emp.codigo_pin && emp.codigo_pin.trim() === pin.trim()
    );

    if (!empleadoEncontrado) {
      console.log(`⚠️ No se encontró empleado con PIN: ${pin}`);
      return NextResponse.json({
        empleado: "",
        mensaje: `No se encontró empleado con PIN ${pin}`
      }, { status: 200 });
    }

    // Retornar el nombre del empleado encontrado
    const nombre = empleadoEncontrado.nombre.trim();
    console.log(`✅ Empleado encontrado: ${nombre} (PIN: ${pin})`);

    return NextResponse.json({
      empleado: nombre,
      identificacion: empleadoEncontrado.identificacion,
      puesto_trabajo: empleadoEncontrado.puesto_trabajo,
      mensaje: "Empleado encontrado"
    }, { status: 200 });

  } catch (error: any) {
    console.error("❌ Error consultando API de empleados:", error);

    // No rompas el flujo si hay error
    return NextResponse.json({
      empleado: "",
      mensaje: error?.message || "Error al buscar empleado"
    }, { status: 200 });
  }
}
