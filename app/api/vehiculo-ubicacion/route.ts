// app/api/vehiculo-ubicacion/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

/**
 * Extrae la placa del campo vehiculo_nombre
 * Ejemplo: "Chevrolet/NQR/NNZ396" -> "NNZ396"
 */
function extraerPlaca(vehiculoNombre: string): string | null {
  if (!vehiculoNombre) return null;

  const partes = vehiculoNombre.split('/');
  if (partes.length >= 3) {
    return partes[partes.length - 1].trim();
  }

  // Si no tiene el formato esperado, retornar el último segmento
  return partes[partes.length - 1]?.trim() || null;
}

/**
 * Obtiene la ubicación más reciente de un vehículo desde la API externa de flota
 */
async function obtenerUbicacionVehiculo(placa: string) {
  try {
    const url = 'http://31.97.98.223:8081/api/v1/external/flota';
    const headers = {
      'x-api-key': 'viacotur-secret-key-123',
    };

    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(30000), // 30 segundos timeout
    });

    if (!response.ok) {
      throw new Error(`Error API flota: ${response.status} ${response.statusText}`);
    }

    const datos = await response.json();

    // La API puede retornar {data: [...]} o directamente un array
    const vehiculos = Array.isArray(datos) ? datos : (datos.data || []);

    if (!Array.isArray(vehiculos)) {
      throw new Error('Formato de respuesta inesperado de API flota');
    }

    console.log(`🚗 API flota devolvió ${vehiculos.length} vehículos`);

    // Extraer todas las placas disponibles para debugging
    const placasDisponibles = vehiculos.map((v: any) => {
      if (!v.matricula) return null;
      const partes = v.matricula.split('/');
      return partes[partes.length - 1];
    }).filter(Boolean);

    console.log(`📋 Buscando placa: ${placa.toUpperCase()}`);
    console.log(`📋 Placas disponibles (primeras 10): ${placasDisponibles.slice(0, 10).join(', ')}`);

    // Verificar si la placa existe
    const placaExiste = placasDisponibles.some((p: string) => p.toUpperCase() === placa.toUpperCase());
    console.log(`🔍 ¿Placa ${placa} encontrada en flota?: ${placaExiste ? 'SÍ' : 'NO'}`);

    // Filtrar por placa (case-insensitive) y obtener el registro más reciente
    const vehiculosFiltrados = vehiculos.filter((v: any) => {
      if (!v.matricula) return false;

      // La matrícula puede venir como "BLINDADA/LAX701", extraemos la placa
      const matriculaPartes = v.matricula.split('/');
      const placaVehiculo = matriculaPartes[matriculaPartes.length - 1];

      return placaVehiculo.toUpperCase() === placa.toUpperCase();
    });

    if (vehiculosFiltrados.length === 0) {
      return null;
    }

    // Ordenar por timestamp descendente y tomar el más reciente
    vehiculosFiltrados.sort((a: any, b: any) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return dateB - dateA;
    });

    const vehiculoMasReciente = vehiculosFiltrados[0];

    return {
      vehiculo_id: vehiculoMasReciente.vehiculo_id,
      timestamp: vehiculoMasReciente.timestamp,
      lat: vehiculoMasReciente.coordenadas?.lat || null,
      lon: vehiculoMasReciente.coordenadas?.long || null,
      matricula: vehiculoMasReciente.matricula,
      velocidad: vehiculoMasReciente.velocidad,
      placa: placa,
    };
  } catch (error) {
    console.error('Error obteniendo ubicación del vehículo:', error);
    throw error;
  }
}

/**
 * GET /api/vehiculo-ubicacion?telegram_id=123456
 *
 * Obtiene la ubicación más reciente del vehículo asociado a un telegram_user_id
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const telegramId = searchParams.get('telegram_id');

    if (!telegramId) {
      return NextResponse.json(
        { error: 'Falta el parámetro telegram_id' },
        { status: 400 }
      );
    }

    // 1. Buscar el vehículo asociado al telegram_user_id
    const queryVehiculo = `
      SELECT
        vehiculo_nombre,
        telegram_user_id,
        created_at,
        updated_at
      FROM public.estado_vehiculos
      WHERE telegram_user_id = $1
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    `;

    const resultVehiculo = await pool.query(queryVehiculo, [telegramId]);

    if (resultVehiculo.rows.length === 0) {
      return NextResponse.json(
        {
          error: 'No se encontró vehículo asociado a este telegram_id',
          telegram_id: telegramId
        },
        { status: 404 }
      );
    }

    const vehiculo = resultVehiculo.rows[0];
    const placa = extraerPlaca(vehiculo.vehiculo_nombre);

    if (!placa) {
      return NextResponse.json(
        {
          error: 'No se pudo extraer la placa del vehículo',
          vehiculo_nombre: vehiculo.vehiculo_nombre
        },
        { status: 400 }
      );
    }

    console.log(`Buscando ubicación para placa: ${placa} (telegram_id: ${telegramId})`);

    // 2. Obtener ubicación desde API externa
    const ubicacion = await obtenerUbicacionVehiculo(placa);

    if (!ubicacion) {
      return NextResponse.json(
        {
          error: 'No se encontró ubicación reciente para el vehículo',
          placa,
          vehiculo_nombre: vehiculo.vehiculo_nombre
        },
        { status: 404 }
      );
    }

    // 3. Retornar la información completa
    return NextResponse.json({
      success: true,
      telegram_id: telegramId,
      vehiculo_nombre: vehiculo.vehiculo_nombre,
      placa,
      ubicacion: {
        lat: ubicacion.lat,
        lon: ubicacion.lon,
        timestamp: ubicacion.timestamp,
        velocidad: ubicacion.velocidad,
        vehiculo_id: ubicacion.vehiculo_id,
        matricula: ubicacion.matricula,
      },
    });

  } catch (error) {
    console.error('Error en /api/vehiculo-ubicacion:', error);

    return NextResponse.json(
      {
        error: 'Error al obtener ubicación del vehículo',
        details: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}
