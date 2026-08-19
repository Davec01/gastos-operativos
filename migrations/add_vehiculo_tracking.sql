-- migrations/add_vehiculo_tracking.sql
-- Agregar campos para tracking de ubicación del vehículo en la tabla gastos_operacionales

-- Habilitar PostGIS si no está habilitado (solo si es necesario)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Agregar columnas para ubicación del vehículo
ALTER TABLE public.gastos_operacionales
ADD COLUMN IF NOT EXISTS vehiculo_placa VARCHAR(20),
ADD COLUMN IF NOT EXISTS vehiculo_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS vehiculo_lon DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS vehiculo_ts TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ubicacion_gps_vehiculo GEOGRAPHY(POINT, 4326);

-- Agregar índices
CREATE INDEX IF NOT EXISTS idx_gastos_vehiculo_placa
ON public.gastos_operacionales(vehiculo_placa);

CREATE INDEX IF NOT EXISTS idx_gastos_ubicacion_gps_vehiculo
ON public.gastos_operacionales USING GIST(ubicacion_gps_vehiculo);

-- Agregar comentarios para documentación
COMMENT ON COLUMN public.gastos_operacionales.vehiculo_placa IS 'Placa del vehículo asociado al gasto (obtenida de API flota)';
COMMENT ON COLUMN public.gastos_operacionales.vehiculo_lat IS 'Latitud del vehículo al momento del gasto';
COMMENT ON COLUMN public.gastos_operacionales.vehiculo_lon IS 'Longitud del vehículo al momento del gasto';
COMMENT ON COLUMN public.gastos_operacionales.vehiculo_ts IS 'Timestamp de la ubicación del vehículo';
COMMENT ON COLUMN public.gastos_operacionales.ubicacion_gps_vehiculo IS 'Ubicación GPS del vehículo en formato POINT(lon, lat) usando PostGIS';
