# Sistema de Actualización de Coordenadas GPS con Odoo

## 📋 Descripción General

Este sistema permite que los usuarios envíen primero el formulario de gastos operativos y luego, dentro de un plazo de **10 minutos**, envíen su ubicación GPS desde Telegram. Las coordenadas se actualizan automáticamente en la base de datos y se sincronizan con Odoo mediante un proceso periódico.

## 🔄 Flujo del Sistema

```
1. Usuario llena formulario →
2. Se guarda en PostgreSQL y se envía a Odoo (sin coords) →
3. Se guarda odoo_record_id →
4. Usuario envía ubicación en Telegram (máx 10 min) →
5. Bot llama webhook /api/actualizar-coordenadas →
6. Se actualizan coords en PostgreSQL →
7. Cron ejecuta /api/sincronizar-coordenadas-odoo (cada minuto) →
8. Se actualizan coords en Odoo →
9. Se marca como enviado (odoo_coordenadas_enviadas = TRUE)
```

## 🗄️ Cambios en Base de Datos

### Script SQL a Ejecutar

**Archivo:** `migrations/add_odoo_tracking.sql`

```sql
-- Conectar a: 34.174.97.159:5432 viacotur

ALTER TABLE public.gastos_operacionales
ADD COLUMN IF NOT EXISTS id_ubicacion UUID DEFAULT gen_random_uuid() UNIQUE,
ADD COLUMN IF NOT EXISTS odoo_record_id INTEGER,
ADD COLUMN IF NOT EXISTS odoo_coordenadas_enviadas BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ubicacion_gps_telegram TEXT;

CREATE INDEX IF NOT EXISTS idx_gastos_id_ubicacion
  ON public.gastos_operacionales(id_ubicacion);

CREATE INDEX IF NOT EXISTS idx_gastos_telegram_pending
  ON public.gastos_operacionales(telegram_id, odoo_coordenadas_enviadas)
  WHERE odoo_coordenadas_enviadas = FALSE;

CREATE INDEX IF NOT EXISTS idx_gastos_odoo_record
  ON public.gastos_operacionales(odoo_record_id)
  WHERE odoo_record_id IS NOT NULL;
```

### Nuevas Columnas

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id_ubicacion` | UUID | ID único para tracking (auto-generado) |
| `odoo_record_id` | INTEGER | ID del registro en Odoo |
| `odoo_coordenadas_enviadas` | BOOLEAN | Flag para saber si coords ya se enviaron a Odoo |
| `ubicacion_gps_telegram` | TEXT | Coordenadas en formato texto "POINT(lon lat)" |

## 📡 Endpoints Creados

### 1. `/api/actualizar-coordenadas` (Webhook)

**Método:** POST
**Descripción:** Recibe coordenadas desde el bot de Telegram
**Timeout:** Usuario tiene 10 minutos después de enviar formulario

**Request:**
```json
{
  "telegram_id": "123456789",
  "lat": -33.4372,
  "lon": -70.6506
}
```

**Response (éxito):**
```json
{
  "success": true,
  "message": "Coordenadas guardadas correctamente. 2 gasto(s) actualizado(s)",
  "data": {
    "records_updated": 2,
    "records": [
      {
        "id": 1,
        "id_ubicacion": "uuid-aqui",
        "odoo_record_id": 9876,
        "empleado": "Juan Pérez"
      }
    ]
  }
}
```

**Response (error - fuera de tiempo):**
```json
{
  "success": false,
  "error": "No se encontró registro de gastos pendiente en los últimos 10 minutos",
  "hint": "Asegúrate de enviar la ubicación dentro de 10 minutos después de enviar el formulario"
}
```

### 2. `/api/sincronizar-coordenadas-odoo`

**Método:** POST
**Descripción:** Sincroniza coordenadas pendientes con Odoo
**Llamado por:** Cron job cada minuto

**Response:**
```json
{
  "success": true,
  "summary": {
    "total_processed": 5,
    "successful": 4,
    "failed": 1
  },
  "results": [
    {
      "id": 1,
      "id_ubicacion": "uuid-aqui",
      "odoo_record_id": 9876,
      "tipo": "alimentacion",
      "status": "success"
    }
  ]
}
```

**Método:** GET
**Descripción:** Obtiene estadísticas de sincronización

**Response:**
```json
{
  "service": "sincronizar-coordenadas-odoo",
  "status": "online",
  "stats": {
    "last_24h": {
      "pending": 3,
      "synced": 45,
      "no_odoo_id": 2
    }
  }
}
```

### 3. `/api/cron/sync-coordinates`

**Método:** GET o POST
**Descripción:** Endpoint para cron que llama a sincronizar-coordenadas-odoo
**Autenticación:** Bearer token (CRON_SECRET_TOKEN)

**Headers:**
```
Authorization: Bearer tu-token-secreto-aqui
```

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-01-01T12:00:00.000Z",
  "sync_result": {
    "summary": {
      "total_processed": 5,
      "successful": 4,
      "failed": 1
    }
  }
}
```

## 🤖 Actualización del Bot de Telegram

### Modificar `handle_location` en `bot_unificado.py`

El bot ahora llama al webhook de Next.js cuando el usuario envía su ubicación:

```python
# NUEVO: Llamar al webhook de Next.js para actualizar coordenadas
webhook_url = f"{URL_GASTOS_OPERATIVOS}/api/actualizar-coordenadas"

async with httpx.AsyncClient(timeout=15.0) as client:
    response = await client.post(
        webhook_url,
        json={
            "telegram_id": str(chat_id),
            "lat": lat,
            "lon": lon
        },
        headers={"Content-Type": "application/json"}
    )
```

**Ver archivo:** `bot_webhook_update.py` para el código completo

## ⚙️ Variables de Entorno

Agregar a `.env.local`:

```env
# Token secreto para cron (genera uno aleatorio)
CRON_SECRET_TOKEN=tu-token-super-secreto-aqui-12345

# URL base de la aplicación
NEXT_PUBLIC_BASE_URL=https://gastos-operativos-120049768418.southamerica-west1.run.app
```

## 🕐 Configuración del Cron Job

### Opción A: Cron Externo (ej: cron-job.org)

1. Crear un cron job que llame cada minuto:
   ```
   URL: https://gastos-operativos-120049768418.southamerica-west1.run.app/api/cron/sync-coordinates
   Método: GET
   Headers: Authorization: Bearer tu-token-secreto
   Frecuencia: */1 * * * * (cada minuto)
   ```

### Opción B: Cloud Scheduler (Google Cloud)

```bash
gcloud scheduler jobs create http sync-gastos-coordinates \
  --location=southamerica-west1 \
  --schedule="*/1 * * * *" \
  --uri="https://gastos-operativos-120049768418.southamerica-west1.run.app/api/cron/sync-coordinates" \
  --http-method=GET \
  --headers="Authorization=Bearer tu-token-secreto"
```

### Opción C: Vercel Cron

Agregar a `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/cron/sync-coordinates",
    "schedule": "*/1 * * * *"
  }]
}
```

## 📊 Monitoreo y Logs

### Ver estado de sincronización

```bash
curl https://gastos-operativos-120049768418.southamerica-west1.run.app/api/sincronizar-coordenadas-odoo
```

### Logs importantes

- `[Webhook] Coordenadas recibidas:` - Bot envió coordenadas
- `[Sync] Encontrados X registros pendientes` - Cron encontró registros para sincronizar
- `✅ odoo_record_id actualizado en PG` - Odoo ID guardado exitosamente
- `✅ Actualizado exitosamente:` - Coordenadas sincronizadas con Odoo

## 🧪 Testing

### 1. Probar webhook de coordenadas

```bash
curl -X POST https://gastos-operativos-120049768418.southamerica-west1.run.app/api/actualizar-coordenadas \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": "123456789",
    "lat": -33.4372,
    "lon": -70.6506
  }'
```

### 2. Probar sincronización con Odoo

```bash
curl -X POST https://gastos-operativos-120049768418.southamerica-west1.run.app/api/sincronizar-coordenadas-odoo
```

### 3. Probar cron (con autenticación)

```bash
curl https://gastos-operativos-120049768418.southamerica-west1.run.app/api/cron/sync-coordinates \
  -H "Authorization: Bearer tu-token-secreto"
```

## ⚠️ Consideraciones Importantes

### Timeouts

- **Formulario → Ubicación:** 10 minutos máximo
- **Sincronización Odoo:** Solo registros de la última hora
- **Webhook timeout:** 15 segundos
- **Cron timeout:** 50 segundos

### Seguridad

- El endpoint cron requiere token de autenticación
- Las coordenadas solo se actualizan si el gasto fue creado en los últimos 10 minutos
- Solo se sincronizan registros con `odoo_record_id` válido

### Performance

- El cron procesa máximo 50 registros por ejecución
- Los índices en BD optimizan las búsquedas
- Se evita re-enviar coordenadas ya sincronizadas

## 🔧 Troubleshooting

### El webhook no actualiza coordenadas

**Problema:** El bot envía coordenadas pero no se actualizan en la BD

**Solución:**
1. Verificar que el gasto se creó hace menos de 10 minutos
2. Revisar logs del bot: `logger.info("Llamando webhook: %s", webhook_url)`
3. Verificar que `URL_GASTOS_OPERATIVOS` está correcta en el bot

### El cron no se ejecuta

**Problema:** Las coordenadas no se sincronizan con Odoo

**Solución:**
1. Verificar que el cron job está activo
2. Verificar el token de autenticación: `CRON_SECRET_TOKEN`
3. Revisar logs de Cloud Run o Vercel
4. Probar manualmente: `curl .../api/sincronizar-coordenadas-odoo`

### Odoo rechaza la actualización

**Problema:** Error al sincronizar coordenadas con Odoo

**Solución:**
1. Verificar que el endpoint de Odoo es correcto
2. Verificar que el token de Odoo es válido
3. Revisar el formato de coordenadas esperado por Odoo
4. Ajustar el endpoint según la respuesta de error de Odoo

## 📝 Próximos Pasos

- [ ] Ejecutar script SQL en base de datos
- [ ] Actualizar bot de Python con nuevo código
- [ ] Configurar variables de entorno
- [ ] Desplegar aplicación Next.js
- [ ] Configurar cron job
- [ ] Probar flujo completo end-to-end
- [ ] Monitorear logs primeras 24 horas

---

**Última actualización:** 2025-01-15
**Versión:** 1.0
