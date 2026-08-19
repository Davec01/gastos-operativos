// app/api/migrate-vehiculo/route.ts
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

/**
 * GET /api/migrate-vehiculo
 *
 * Endpoint temporal para ejecutar la migración de campos de vehículo
 * IMPORTANTE: Este endpoint debe eliminarse después de ejecutar la migración en producción
 */
export async function GET() {
  const client = await pool.connect();

  try {
    console.log('🚀 Iniciando migración de campos de vehículo...');

    // Ejecutar todas las queries de migración (SIN PostGIS)
    const migrations = [
      // 1. Agregar columnas (sin campo GEOGRAPHY de PostGIS)
      `ALTER TABLE public.gastos_operacionales
       ADD COLUMN IF NOT EXISTS vehiculo_placa VARCHAR(20),
       ADD COLUMN IF NOT EXISTS vehiculo_lat DOUBLE PRECISION,
       ADD COLUMN IF NOT EXISTS vehiculo_lon DOUBLE PRECISION,
       ADD COLUMN IF NOT EXISTS vehiculo_ts TIMESTAMP WITH TIME ZONE,
       ADD COLUMN IF NOT EXISTS ubicacion_gps_vehiculo TEXT;`,

      // 2. Índice para placa
      `CREATE INDEX IF NOT EXISTS idx_gastos_vehiculo_placa
       ON public.gastos_operacionales(vehiculo_placa);`,

      // 3. Comentarios
      `COMMENT ON COLUMN public.gastos_operacionales.vehiculo_placa IS 'Placa del vehículo asociado al gasto';`,
      `COMMENT ON COLUMN public.gastos_operacionales.vehiculo_lat IS 'Latitud del vehículo';`,
      `COMMENT ON COLUMN public.gastos_operacionales.vehiculo_lon IS 'Longitud del vehículo';`,
      `COMMENT ON COLUMN public.gastos_operacionales.vehiculo_ts IS 'Timestamp de ubicación del vehículo';`,
      `COMMENT ON COLUMN public.gastos_operacionales.ubicacion_gps_vehiculo IS 'Ubicación GPS en formato texto (lat, lon)';`,
    ];

    const results = [];

    for (const [index, sql] of migrations.entries()) {
      try {
        console.log(`Ejecutando migración ${index + 1}/${migrations.length}...`);
        await client.query(sql);
        results.push({ step: index + 1, status: 'success', sql: sql.substring(0, 100) + '...' });
        console.log(`✅ Migración ${index + 1} completada`);
      } catch (error: any) {
        console.error(`❌ Error en migración ${index + 1}:`, error);
        results.push({
          step: index + 1,
          status: 'error',
          error: error.message,
          sql: sql.substring(0, 100) + '...'
        });
      }
    }

    // Verificar que las columnas existan
    const checkQuery = `
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'gastos_operacionales'
        AND column_name IN ('vehiculo_placa', 'vehiculo_lat', 'vehiculo_lon', 'vehiculo_ts', 'ubicacion_gps_vehiculo')
      ORDER BY column_name;
    `;

    const checkResult = await client.query(checkQuery);
    const columnsCreated = checkResult.rows;

    console.log('✅ Migración completada. Columnas creadas:', columnsCreated);

    return NextResponse.json({
      success: true,
      message: 'Migración ejecutada exitosamente',
      migrations: results,
      columnsCreated: columnsCreated,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('❌ Error fatal en migración:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Error ejecutando migración',
        details: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );

  } finally {
    client.release();
  }
}
