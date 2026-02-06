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

// ──────────────────────────────────────────────────────────────────────────────
// Sistema de caché en memoria
// ──────────────────────────────────────────────────────────────────────────────
interface CacheEntry {
  data: EmpleadosResponse;
  timestamp: number;
}

let empleadosCache: CacheEntry | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos en milisegundos

function getCachedEmpleados(): EmpleadosResponse | null {
  if (!empleadosCache) return null;

  const now = Date.now();
  const age = now - empleadosCache.timestamp;

  if (age > CACHE_TTL) {
    console.log("🗑️ Caché expirado, necesita actualización");
    empleadosCache = null;
    return null;
  }

  console.log(`💾 Usando caché (edad: ${Math.round(age / 1000)}s)`);
  return empleadosCache.data;
}

function setCachedEmpleados(data: EmpleadosResponse): void {
  empleadosCache = {
    data,
    timestamp: Date.now(),
  };
  console.log(`✅ Caché actualizado con ${data.items?.length || 0} empleados`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Sistema de reintentos con backoff exponencial
// ──────────────────────────────────────────────────────────────────────────────
async function fetchEmpleadosConReintentos(
  url: string,
  maxRetries = 3,
  timeoutMs = 30000
): Promise<EmpleadosResponse> {
  let lastError: Error | null = null;

  for (let intento = 1; intento <= maxRetries; intento++) {
    try {
      console.log(`🔄 Intento ${intento}/${maxRetries} de conectar a la API`);

      const response = await fetch(url, {
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

      const data: EmpleadosResponse = await response.json();
      console.log(`✅ Intento ${intento} exitoso`);
      return data;

    } catch (error: any) {
      lastError = error;
      const errorType = error?.name || "UnknownError";

      console.warn(`⚠️ Intento ${intento} falló: ${errorType} - ${error?.message}`);

      // Si no es el último intento, esperar antes de reintentar
      if (intento < maxRetries) {
        // Backoff exponencial: 1s, 2s, 4s, etc.
        const waitTime = Math.pow(2, intento - 1) * 1000;
        console.log(`⏳ Esperando ${waitTime}ms antes del siguiente intento...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  // Si llegamos aquí, todos los intentos fallaron
  throw lastError || new Error("Todos los intentos de conexión fallaron");
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
    // Intentar obtener datos del caché primero
    let data: EmpleadosResponse | null = getCachedEmpleados();

    if (!data) {
      // Caché vacío o expirado, llamar a la API externa con reintentos
      const url = "http://35.223.72.198:4001/empleados";

      console.log(`🔍 Consultando API de empleados para PIN: ${pin}`);
      const startTime = Date.now();

      // Usar sistema de reintentos con backoff exponencial
      const responseData = await fetchEmpleadosConReintentos(url, 3, 30000);

      const elapsed = Date.now() - startTime;
      console.log(`⏱️ Datos obtenidos en ${elapsed}ms con ${responseData.items?.length || 0} empleados`);

      // Guardar en caché
      setCachedEmpleados(responseData);
      data = responseData;
    }

    if (!data || !data.items || data.items.length === 0) {
      return NextResponse.json({ empleado: "", mensaje: "No hay empleados disponibles" }, { status: 200 });
    }

    // Buscar empleado cuyo codigo_pin coincida con el PIN proporcionado
    // IMPORTANTE: Solo buscar entre empleados con puesto_trabajo = "Conductor"
    const empleadoEncontrado = data.items.find(
      (emp) =>
        emp.codigo_pin &&
        emp.codigo_pin.trim() === pin.trim() &&
        emp.puesto_trabajo &&
        emp.puesto_trabajo.trim().toLowerCase() === "conductor"
    );

    if (!empleadoEncontrado) {
      console.log(`⚠️ No se encontró empleado conductor con PIN: ${pin}`);
      return NextResponse.json({
        empleado: "",
        mensaje: `No se encontró empleado conductor con PIN ${pin}`
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
    // Identificar el tipo de error
    const errorType = error?.name || "UnknownError";
    const errorMsg = error?.message || "Error desconocido";

    console.error("❌ Error consultando API de empleados:", {
      type: errorType,
      message: errorMsg,
      code: error?.code,
      pin: pin,
    });

    // Mensajes específicos según el tipo de error
    let mensaje = "Error al buscar empleado";
    if (errorType === "TimeoutError" || errorType === "AbortError") {
      mensaje = "La API de empleados tardó demasiado en responder";
      console.error("⏰ TIMEOUT: La API no respondió en 30 segundos");
    } else if (errorType === "TypeError" && errorMsg.includes("fetch")) {
      mensaje = "No se pudo conectar a la API de empleados";
      console.error("🔌 CONEXIÓN: No se pudo alcanzar la API");
    }

    // No rompas el flujo si hay error
    return NextResponse.json({
      empleado: "",
      mensaje: mensaje
    }, { status: 200 });
  }
}
