-- Agregar columna fecha_gasto a gastos_operacionales
-- Permite que el usuario seleccione la fecha real del gasto desde el formulario
-- en lugar de usar created_at (timestamp de inserción en BD)

ALTER TABLE public.gastos_operacionales
ADD COLUMN IF NOT EXISTS fecha_gasto DATE;

-- Rellenar registros existentes con la fecha de created_at
UPDATE public.gastos_operacionales
SET fecha_gasto = created_at::DATE
WHERE fecha_gasto IS NULL;

-- Verificar
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'gastos_operacionales'
  AND column_name = 'fecha_gasto';
