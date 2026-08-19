# 🚀 Pasos para Desplegar el Sistema de Coordenadas GPS

## ⚠️ Problemas Actuales Detectados

1. ❌ **Las columnas de tracking no existen en la base de datos**
   - Solución: Ejecutar script de migración SQL

2. ❌ **El `odoo_record_id` no se está guardando (undefined)**
   - Solución: Ya se agregó logging mejorado para ver la respuesta de Odoo

3. ❌ **El bot no está llamando al webhook**
   - Solución: Reemplazar bot_unificado.py con bot_unificado_updated.py

---

## 📝 Paso 1: Ejecutar Migración de Base de Datos

### Opción A: Usando script automatizado (Windows)
```bash
run-migration.bat
```

### Opción B: Usando script automatizado (Linux/Mac)
```bash
chmod +x run-migration.sh
./run-migration.sh
```

### Opción C: Manual con psql
```bash
psql -h 34.174.97.159 -p 5432 -d viacotur -U <tu-usuario> -f migrations/add_odoo_tracking.sql
```

### Opción D: Copiar y pegar en pgAdmin o tu cliente favorito
```sql
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

CREATE INDEX IF NOT EXISTS idx_gastos_odoo_record
  ON public.gastos_operacionales(odoo_record_id)
  WHERE odoo_record_id IS NOT NULL;
```

**✅ Verificar:** Luego de ejecutar, verifica que las columnas existan:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'gastos_operacionales'
  AND column_name IN ('id_ubicacion', 'odoo_record_id', 'odoo_coordenadas_enviadas', 'ubicacion_gps_telegram');
```

Deberías ver 4 filas.

---

## 📝 Paso 2: Actualizar el Bot de Telegram

**IMPORTANTE:** El archivo `bot_unificado_updated.py` contiene la integración con el webhook.

### Opción A: Reemplazar el archivo
```bash
# Hacer backup del bot actual (si existe)
copy bot_unificado.py bot_unificado_backup.py

# Reemplazar con la versión actualizada
copy bot_unificado_updated.py bot_unificado.py
```

### Opción B: Renombrar
```bash
# Si NO tienes bot_unificado.py, simplemente renombra:
ren bot_unificado_updated.py bot_unificado.py
```

**✅ Verificar:** Abre el archivo y busca esta línea (aprox. línea 414):
```python
webhook_url = f"{URL_GASTOS_OPERATIVOS}/api/actualizar-coordenadas"
```

---

## 📝 Paso 3: Reiniciar el Bot

Después de actualizar el archivo del bot, reinicia el proceso del bot:

```bash
# Detener el bot actual (Ctrl+C si está en consola)
# Luego iniciar de nuevo:
python bot_unificado.py
```

---

## 📝 Paso 4: Desplegar Next.js (con logging mejorado)

El código de Next.js ya tiene las mejoras para capturar la respuesta de Odoo.

```bash
# Si usas Cloud Run, despliega normalmente:
gcloud run deploy gastos-operativos --source .

# O si usas npm:
npm run build
```

---

## 🧪 Paso 5: Probar el Flujo Completo

### Test 1: Enviar formulario y ubicación

1. **Abre el bot en Telegram**
2. **Selecciona "🧾 Formularios" → "💰 Gastos Operativos"**
3. **Llena el formulario y envía**
4. **Dentro de 10 minutos, envía tu ubicación GPS**

### Test 2: Verificar logs del bot

Deberías ver en la consola del bot:

```
📍 Ubicación de 2039625899: -33.4372, -70.6506
✅ Ubicación guardada en ubicaciones_telegram
🔄 Llamando webhook: https://gastos-operativos-120049768418.southamerica-west1.run.app/api/actualizar-coordenadas
✅ Webhook exitoso: {'success': True, 'message': '...', 'data': {'records_updated': 1}}
```

### Test 3: Verificar logs de Next.js

En Cloud Run logs o consola local, deberías ver:

```
[Webhook] Coordenadas recibidas: { telegram_id: '2039625899', lat: -33.4372, lon: -70.6506 }
[Webhook] 1 registro(s) actualizado(s): [123]
```

### Test 4: Verificar la respuesta de Odoo

Ahora deberías ver en los logs:

```
📦 Respuesta completa de Odoo: {
  "id": 12345,
  ...
}
✅ Gasto enviado exitosamente a Odoo. ID extraído: 12345
```

### Test 5: Verificar en la base de datos

```sql
SELECT
  id,
  empleado,
  telegram_id,
  tipo,
  loc_lat,
  loc_lon,
  odoo_record_id,
  odoo_coordenadas_enviadas,
  ubicacion_gps_telegram
FROM public.gastos_operacionales
WHERE telegram_id = '2039625899'
ORDER BY created_at DESC
LIMIT 1;
```

**Deberías ver:**
- ✅ `loc_lat` y `loc_lon` con valores
- ✅ `odoo_record_id` con un número (no NULL)
- ✅ `odoo_coordenadas_enviadas` = FALSE (se marcará TRUE cuando el cron sincronice)
- ✅ `ubicacion_gps_telegram` con formato "POINT(lon lat)"

---

## 📝 Paso 6: Configurar Cron Job (Opcional, para sincronización automática)

Este paso es opcional. El cron sincroniza las coordenadas con Odoo cada minuto.

### Configurar variable de entorno

Agrega a `.env.local`:
```env
CRON_SECRET_TOKEN=tu-token-super-secreto-generado-aleatoriamente
```

### Opción A: Google Cloud Scheduler

```bash
gcloud scheduler jobs create http sync-gastos-coordinates \
  --location=southamerica-west1 \
  --schedule="*/1 * * * *" \
  --uri="https://gastos-operativos-120049768418.southamerica-west1.run.app/api/cron/sync-coordinates" \
  --http-method=GET \
  --headers="Authorization=Bearer tu-token-super-secreto"
```

### Opción B: Servicio externo (cron-job.org)

1. Ve a https://cron-job.org
2. Crea un nuevo job:
   - **URL:** `https://gastos-operativos-120049768418.southamerica-west1.run.app/api/cron/sync-coordinates`
   - **Schedule:** `*/1 * * * *` (cada minuto)
   - **Headers:** `Authorization: Bearer tu-token-super-secreto`

### Test manual del cron

```bash
curl https://gastos-operativos-120049768418.southamerica-west1.run.app/api/cron/sync-coordinates \
  -H "Authorization: Bearer tu-token-super-secreto"
```

---

## ✅ Checklist Final

- [ ] Script SQL ejecutado exitosamente
- [ ] Columnas nuevas existen en la base de datos
- [ ] Bot actualizado con webhook (bot_unificado_updated.py → bot_unificado.py)
- [ ] Bot reiniciado
- [ ] Next.js desplegado con logging mejorado
- [ ] Test formulario + ubicación exitoso
- [ ] Webhook llama correctamente desde el bot
- [ ] Coordenadas se guardan en PostgreSQL
- [ ] `odoo_record_id` se guarda correctamente
- [ ] (Opcional) Cron job configurado

---

## 🐛 Troubleshooting

### Problema: No aparecen las columnas nuevas

**Solución:** Ejecuta el script SQL manualmente en pgAdmin o tu cliente favorito.

### Problema: El bot no llama al webhook

**Síntomas:**
- No ves logs `🔄 Llamando webhook:` en la consola del bot
- El formulario se envía pero las coordenadas no se actualizan

**Solución:**
1. Verifica que estés ejecutando `bot_unificado.py` (no `bot_unificado_updated.py`)
2. Busca la línea 414 en el archivo, debe contener: `webhook_url = f"{URL_GASTOS_OPERATIVOS}/api/actualizar-coordenadas"`
3. Reinicia el bot completamente

### Problema: odoo_record_id sigue siendo undefined

**Síntomas:**
- En logs ves: `✅ Gasto enviado exitosamente a Odoo. ID: undefined`

**Solución:**
1. Ahora el código tiene logging mejorado
2. Busca en los logs: `📦 Respuesta completa de Odoo:`
3. Envía un formulario nuevo y revisa la respuesta completa
4. Comparte la respuesta completa de Odoo para ajustar el parsing

### Problema: Error "No se encontró registro pendiente en los últimos 10 minutos"

**Síntomas:**
- El bot responde con este error al enviar ubicación

**Solución:**
- Asegúrate de enviar la ubicación **dentro de 10 minutos** después de enviar el formulario
- Si pasaron más de 10 minutos, envía el formulario de nuevo

---

## 📊 Verificación de Logs Importantes

### Bot logs (deberías ver):
```
📍 Ubicación de 2039625899: -33.4372, -70.6506
🔄 Llamando webhook: https://...
✅ Webhook exitoso: {...}
```

### Next.js logs (deberías ver):
```
[Webhook] Coordenadas recibidas: {...}
📦 Respuesta completa de Odoo: {...}
✅ Gasto enviado exitosamente a Odoo. ID extraído: 12345
✅ odoo_record_id actualizado en PG: 12345
```

---

**Última actualización:** 2025-12-15
**Versión:** 2.0
