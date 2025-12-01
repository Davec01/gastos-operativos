// app/api/sync-empleados-pin/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

/**
 * Interfaz para empleado desde el endpoint externo
 */
interface EmpleadoExterno {
  id: number;
  nombre: string;
  codigo_pin: string;
  puesto_trabajo: string;
  telefono_movil_laboral: string;
  correo_laboral: string;
  compania: string;
  departamento: string;
  centro_trabajo: string;
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
 * Usuario registrado en PostgreSQL
 */
interface UsuarioRegistrado {
  id?: number;
  telegram_id: bigint;
  nombre: string;
  nif?: string; // Documento de identidad (opcional, puede no existir en la tabla)
}

/**
 * Obtiene todos los empleados del endpoint externo
 */
async function obtenerEmpleadosExternos(): Promise<{
  empleados: EmpleadoExterno[];
  token: string;
}> {
  const url = "http://35.223.72.198:4001/empleados";

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      // Timeout de 10 segundos
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(
        `Error al obtener empleados: ${response.status} ${response.statusText}`
      );
    }

    const data: EmpleadosResponse = await response.json();

    return {
      empleados: data.items || [],
      token: data.token,
    };
  } catch (error) {
    console.error("Error obteniendo empleados externos:", error);
    throw error;
  }
}

/**
 * Obtiene usuarios registrados de PostgreSQL
 * Nota: La columna 'nif' es opcional. Si no existe, se puede usar telegram_id como identificador
 */
async function obtenerUsuariosRegistrados(): Promise<UsuarioRegistrado[]> {
  const client = await pool.connect();

  try {
    // Intentar obtener con nif primero
    try {
      const result = await client.query(`
        SELECT id, telegram_id, nombre, nif
        FROM public.usuarios_registrados
        ORDER BY telegram_id ASC
      `);
      return result.rows;
    } catch (error) {
      // Si falla (columna nif no existe), intentar sin nif
      console.warn("Columna 'nif' no encontrada, usando solo telegram_id y nombre");
      const result = await client.query(`
        SELECT telegram_id, nombre
        FROM public.usuarios_registrados
        ORDER BY telegram_id ASC
      `);
      return result.rows;
    }
  } finally {
    client.release();
  }
}

/**
 * Registra un código PIN para un empleado
 */
async function registrarCodigoPin(
  empleadoId: number,
  nif: string,
  pin: string,
  token: string
): Promise<{ success: boolean; message: string }> {
  const url = `https://viacotur16-qa11-22388022.dev.odoo.com/api/empleados/register?nif=${encodeURIComponent(
    nif
  )}&id=${empleadoId}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ pin }),
      signal: AbortSignal.timeout(5000),
    });

    const result = await response.text();

    return {
      success: response.ok,
      message: result,
    };
  } catch (error) {
    console.error(`Error registrando PIN para empleado ${empleadoId}:`, error);
    return {
      success: false,
      message: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}

/**
 * Normaliza un nombre para comparación (quita tildes, mayúsculas, espacios extras)
 */
function normalizarNombre(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * POST /api/sync-empleados-pin
 *
 * Sincroniza códigos PIN de empleados comparando la base de datos local
 * con el endpoint externo.
 *
 * Body (opcional):
 * {
 *   "pin": "1234",           // PIN por defecto a asignar
 *   "dryRun": false,         // Si es true, solo simula sin hacer cambios
 *   "filtroNombres": []      // Array de nombres específicos a procesar
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      pin = "0000", // PIN por defecto
      dryRun = false,
      filtroNombres = [],
    } = body;

    console.log("=== Iniciando sincronización de PINs ===");
    console.log(`Modo: ${dryRun ? "SIMULACIÓN" : "PRODUCCIÓN"}`);
    console.log(`PIN por defecto: ${pin}`);

    // 1. Obtener empleados del endpoint externo
    console.log("Obteniendo empleados del endpoint externo...");
    const { empleados: empleadosExternos, token } =
      await obtenerEmpleadosExternos();
    console.log(`✓ ${empleadosExternos.length} empleados obtenidos`);

    // 2. Obtener usuarios registrados de PostgreSQL
    console.log("Obteniendo usuarios registrados de PostgreSQL...");
    const usuariosRegistrados = await obtenerUsuariosRegistrados();
    console.log(`✓ ${usuariosRegistrados.length} usuarios registrados`);

    // 3. Crear mapa de empleados externos por nombre normalizado
    const mapaEmpleados = new Map<string, EmpleadoExterno>();
    empleadosExternos.forEach((emp) => {
      const nombreNormalizado = normalizarNombre(emp.nombre);
      mapaEmpleados.set(nombreNormalizado, emp);
    });

    // 4. Comparar y registrar PINs
    const resultados = {
      procesados: 0,
      sinCoincidendia: 0,
      yaTienenPin: 0,
      registrados: 0,
      errores: 0,
      detalles: [] as Array<{
        nombre: string;
        accion: string;
        detalles?: string;
      }>,
    };

    for (const usuario of usuariosRegistrados) {
      // Aplicar filtro si existe
      if (
        filtroNombres.length > 0 &&
        !filtroNombres.some(
          (f: string) =>
            normalizarNombre(f) === normalizarNombre(usuario.nombre)
        )
      ) {
        continue;
      }

      resultados.procesados++;
      const nombreNormalizado = normalizarNombre(usuario.nombre);
      const empleadoExterno = mapaEmpleados.get(nombreNormalizado);

      if (!empleadoExterno) {
        resultados.sinCoincidendia++;
        resultados.detalles.push({
          nombre: usuario.nombre,
          accion: "SIN_COINCIDENCIA",
          detalles: "No encontrado en endpoint externo",
        });
        continue;
      }

      // Verificar si ya tiene PIN
      if (empleadoExterno.codigo_pin && empleadoExterno.codigo_pin !== "") {
        resultados.yaTienenPin++;
        resultados.detalles.push({
          nombre: usuario.nombre,
          accion: "YA_TIENE_PIN",
          detalles: `PIN existente: ${empleadoExterno.codigo_pin}`,
        });
        continue;
      }

      // Verificar que tengamos el NIF (si no existe, usar telegram_id como fallback)
      const nif = usuario.nif || usuario.telegram_id.toString();

      if (!nif) {
        resultados.errores++;
        resultados.detalles.push({
          nombre: usuario.nombre,
          accion: "ERROR",
          detalles: "No se encontró NIF ni telegram_id para usar como identificador",
        });
        continue;
      }

      // Registrar PIN
      if (dryRun) {
        resultados.detalles.push({
          nombre: usuario.nombre,
          accion: "SIMULAR_REGISTRO",
          detalles: `Se registraría PIN ${pin} para ID ${empleadoExterno.id}, NIF/Telegram_ID ${nif}`,
        });
      } else {
        console.log(
          `Registrando PIN para ${usuario.nombre} (ID: ${empleadoExterno.id}, NIF/Telegram_ID: ${nif})...`
        );

        const resultado = await registrarCodigoPin(
          empleadoExterno.id,
          nif,
          pin,
          token
        );

        if (resultado.success) {
          resultados.registrados++;
          resultados.detalles.push({
            nombre: usuario.nombre,
            accion: "REGISTRADO",
            detalles: resultado.message,
          });
        } else {
          resultados.errores++;
          resultados.detalles.push({
            nombre: usuario.nombre,
            accion: "ERROR",
            detalles: resultado.message,
          });
        }
      }
    }

    console.log("=== Sincronización completada ===");
    console.log(`Total procesados: ${resultados.procesados}`);
    console.log(`Registrados: ${resultados.registrados}`);
    console.log(`Ya tienen PIN: ${resultados.yaTienenPin}`);
    console.log(`Sin coincidencia: ${resultados.sinCoincidendia}`);
    console.log(`Errores: ${resultados.errores}`);

    return NextResponse.json({
      success: true,
      mensaje: dryRun
        ? "Simulación completada (no se realizaron cambios)"
        : "Sincronización completada",
      estadisticas: {
        procesados: resultados.procesados,
        registrados: resultados.registrados,
        yaTienenPin: resultados.yaTienenPin,
        sinCoincidencia: resultados.sinCoincidendia,
        errores: resultados.errores,
      },
      detalles: resultados.detalles,
      token_usado: token,
    });
  } catch (error) {
    console.error("Error en sync-empleados-pin:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/sync-empleados-pin
 *
 * Obtiene un resumen del estado de PINs sin realizar cambios
 */
export async function GET() {
  try {
    console.log("=== Obteniendo resumen de PINs ===");

    // Obtener datos
    const { empleados: empleadosExternos } = await obtenerEmpleadosExternos();
    const usuariosRegistrados = await obtenerUsuariosRegistrados();

    // Crear mapa
    const mapaEmpleados = new Map<string, EmpleadoExterno>();
    empleadosExternos.forEach((emp) => {
      const nombreNormalizado = normalizarNombre(emp.nombre);
      mapaEmpleados.set(nombreNormalizado, emp);
    });

    // Analizar
    let conPin = 0;
    let sinPin = 0;
    let sinCoincidencia = 0;

    const pendientes: string[] = [];

    for (const usuario of usuariosRegistrados) {
      const nombreNormalizado = normalizarNombre(usuario.nombre);
      const empleadoExterno = mapaEmpleados.get(nombreNormalizado);

      if (!empleadoExterno) {
        sinCoincidencia++;
        continue;
      }

      if (empleadoExterno.codigo_pin && empleadoExterno.codigo_pin !== "") {
        conPin++;
      } else {
        sinPin++;
        pendientes.push(usuario.nombre);
      }
    }

    return NextResponse.json({
      success: true,
      resumen: {
        total_usuarios_registrados: usuariosRegistrados.length,
        total_empleados_externos: empleadosExternos.length,
        con_pin: conPin,
        sin_pin: sinPin,
        sin_coincidencia: sinCoincidencia,
      },
      empleados_sin_pin: pendientes,
    });
  } catch (error) {
    console.error("Error en GET sync-empleados-pin:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Error desconocido",
      },
      { status: 500 }
    );
  }
}
