-- Script para agregar columnas de tracking de Odoo a gastos_operacionales
-- Base de datos: 34.174.97.159:5432 viacotur

-- Agregar columnas necesarias para tracking de coordenadas con Odoo
ALTER TABLE public.gastos_operacionales
ADD COLUMN IF NOT EXISTS id_ubicacion UUID DEFAULT gen_random_uuid() UNIQUE,
ADD COLUMN IF NOT EXISTS odoo_record_id INTEGER,
ADD COLUMN IF NOT EXISTS odoo_coordenadas_enviadas BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ubicacion_gps_telegram TEXT;

-- Crear índices para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_gastos_id_ubicacion
  ON public.gastos_operacionales(id_ubicacion);

CREATE INDEX IF NOT EXISTS idx_gastos_telegram_pending
  ON public.gastos_operacionales(telegram_id, odoo_coordenadas_enviadas)
  WHERE odoo_coordenadas_enviadas = FALSE;

-- Crear índice para búsquedas por odoo_record_id
CREATE INDEX IF NOT EXISTS idx_gastos_odoo_record
  ON public.gastos_operacionales(odoo_record_id)
  WHERE odoo_record_id IS NOT NULL;

-- Verificar la estructura
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'gastos_operacionales'
ORDER BY ordinal_position;
