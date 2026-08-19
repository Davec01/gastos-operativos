-- Script para agregar columnas de archivos adjuntos a gastos_operacionales
-- Base de datos: 34.174.97.159:5432 viacotur

-- Agregar columnas para almacenar archivos adjuntos (PDF/imágenes en base64)
ALTER TABLE public.gastos_operacionales
ADD COLUMN IF NOT EXISTS archivo_nombre VARCHAR(255),
ADD COLUMN IF NOT EXISTS archivo_tipo VARCHAR(10),  -- 'pdf' o 'image'
ADD COLUMN IF NOT EXISTS archivo_base64 TEXT;       -- Contenido en base64

-- Verificar la estructura
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'gastos_operacionales'
  AND column_name IN ('archivo_nombre', 'archivo_tipo', 'archivo_base64')
ORDER BY ordinal_position;
