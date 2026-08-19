# 📊 Resumen del Estado Actual - Sistema GPS

## ✅ Lo que YA funciona:

1. ✅ **Script SQL creado** - [migrations/add_odoo_tracking.sql](migrations/add_odoo_tracking.sql)
2. ✅ **Bot actualizado** - [bot_unificado_updated.py](bot_unificado_updated.py) con integración de webhook
3. ✅ **Webhook endpoint creado** - `/api/actualizar-coordenadas`
4. ✅ **Sync endpoint creado** - `/api/sincronizar-coordenadas-odoo`
5. ✅ **Cron endpoint creado** - `/api/cron/sync-coordinates`
6. ✅ **Bot llama al webhook** - Confirmado en tus logs

## ❌ Lo que AÚN NO funciona:

### 1. ❌ Migración SQL no ejecutada
**Síntoma:** Las columnas `id_ubicacion`, `odoo_record_id`, `odoo_coordenadas_enviadas`, `ubicacion_gps_telegram` no existen en la base de datos.

**Solución:** Ejecutar el query SQL en pgAdmin (ya te lo pasé arriba).

### 2. ❌ Endpoints no desplegados en Cloud Run
**Síntoma:**
```
INFO:httpx:HTTP Request: POST .../api/actualizar-coordenadas "HTTP/1.1 404 Not Found"
```

**Solución:** Desplegar Next.js a Cloud Run usando [deploy-to-cloudrun.bat](deploy-to-cloudrun.bat)

### 3. ❌ Odoo no devuelve ID del registro
**Síntoma:**
```
📦 Respuesta completa de Odoo: {
  "response": "The registry has been created: ALOJAMIENTO OPERATIVO"
}
✅ Gasto enviado exitosamente a Odoo. ID extraído: undefined
```

**Problema:** Odoo NO devuelve el ID del registro creado.

**Impacto:** **SIN el ID, NO es posible sincronizar las coordenadas GPS con Odoo.**

**Solución:** Contactar al equipo de Odoo y pedirles que modifiquen el endpoint `/api/gastos/register` para que devuelva el ID. Ver detalles en [PROBLEMA_ODOO_ID.md](PROBLEMA_ODOO_ID.md)

---

## 📋 Pasos Siguientes (en orden de prioridad)

### Paso 1: Ejecutar Migración SQL ⚠️ URGENTE
```sql
-- Copiar y pegar en pgAdmin conectado a: 34.174.97.159:5432 viacotur

ALTER TABLE public.gastos_operacionales
ADD COLUMN IF NOT EXISTS id_ubicacion UUID DEFAULT gen_random_uuid() UNIQUE,
ADD COLUMN IF NOT EXISTS odoo_record_id INTEGER,
ADD COLUMN IF NOT EXISTS odoo_coordenadas_enviadas BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ubicacion_gps_telegram TEXT;

-- Índices
CREATE INDEX IF NOT EXISTS idx_gastos_id_ubicacion
  ON public.gastos_operacionales(id_ubicacion);

CREATE INDEX IF NOT EXISTS idx_gastos_telegram_pending
  ON public.gastos_operacionales(telegram_id, odoo_coordenadas_enviadas)
  WHERE odoo_coordenadas_enviadas = FALSE;

CREATE INDEX IF NOT EXISTS idx_gastos_odoo_record
  ON public.gastos_operacionales(odoo_record_id)
  WHERE odoo_record_id IS NOT NULL;
```

**Verificar:**
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'gastos_operacionales'
  AND column_name IN ('id_ubicacion', 'odoo_record_id', 'odoo_coordenadas_enviadas', 'ubicacion_gps_telegram');
```
Deberías ver 4 filas.

---

### Paso 2: Desplegar Next.js a Cloud Run ⚠️ URGENTE

**Opción A: Usando gcloud CLI**
```bash
cd "c:\Tools\Collectif\Conversional form\gastos-operativos"
gcloud run deploy gastos-operativos --source . --region=southamerica-west1 --allow-unauthenticated
```

**Opción B: Usando script automatizado**
```bash
cd "c:\Tools\Collectif\Conversional form\gastos-operativos"
deploy-to-cloudrun.bat
```

**Opción C: Desde Google Cloud Console**
1. Ve a https://console.cloud.google.com/run
2. Selecciona `gastos-operativos`
3. Click "Edit & Deploy New Revision"
4. Upload código o conecta con GitHub
5. Deploy

**Verificar:**
```bash
curl https://gastos-operativos-120049768418.southamerica-west1.run.app/api/actualizar-coordenadas

# Deberías ver:
{
  "service": "actualizar-coordenadas",
  "status": "online",
  "description": "Webhook para recibir coordenadas GPS desde el bot de Telegram"
}
```

---

### Paso 3: Contactar Equipo de Odoo 🔴 BLOQUEANTE

**Problema:** El endpoint `/api/gastos/register` NO devuelve el ID del registro creado.

**Lo que necesitas pedirles:**

> Hola equipo de Odoo,
>
> Necesitamos que el endpoint `POST /api/gastos/register` devuelva el **ID del registro creado** en la respuesta.
>
> **Respuesta actual:**
> ```json
> {
>   "response": "The registry has been created: ALOJAMIENTO OPERATIVO"
> }
> ```
>
> **Respuesta necesaria:**
> ```json
> {
>   "id": 12345,
>   "response": "The registry has been created: ALOJAMIENTO OPERATIVO"
> }
> ```
>
> **Razón:** Necesitamos el ID para poder actualizar el registro con las coordenadas GPS del usuario después de que las envíe desde Telegram.
>
> Sin el ID, no podemos sincronizar las ubicaciones GPS con Odoo.
>
> Ver detalles técnicos en el documento adjunto: [PROBLEMA_ODOO_ID.md](PROBLEMA_ODOO_ID.md)

---

### Paso 4: Probar el Flujo Completo (después de Pasos 1, 2, 3)

1. **Enviar formulario desde Telegram**
   - Abre el bot
   - Selecciona "🧾 Formularios" → "💰 Gastos Operativos"
   - Llena el formulario
   - Envía

2. **Enviar ubicación GPS**
   - Dentro de 10 minutos, toca "📍 Enviar ubicación"
   - Comparte tu ubicación

3. **Verificar logs del bot** (deberías ver):
   ```
   📍 Ubicación de 2039625899: ...
   🔄 Llamando webhook: https://...
   ✅ Webhook exitoso: ...
   📊 Gastos actualizados: 1
   ```

4. **Verificar logs de Next.js** (deberías ver):
   ```
   [Webhook] Coordenadas recibidas: ...
   [Webhook] 1 registro(s) actualizado(s): [123]
   📦 Respuesta completa de Odoo: { "id": 12345, ... }
   ✅ Gasto enviado exitosamente a Odoo. ID extraído: 12345
   ✅ odoo_record_id actualizado en PG: 12345
   ```

5. **Verificar en PostgreSQL**:
   ```sql
   SELECT
     id,
     empleado,
     tipo,
     loc_lat,
     loc_lon,
     odoo_record_id,
     odoo_coordenadas_enviadas,
     ubicacion_gps_telegram
   FROM public.gastos_operacionales
   ORDER BY created_at DESC
   LIMIT 1;
   ```

   Deberías ver:
   - ✅ `loc_lat` y `loc_lon` con valores
   - ✅ `odoo_record_id` con un número (no NULL) ← **Solo cuando Odoo devuelva el ID**
   - ✅ `ubicacion_gps_telegram` con formato "POINT(lon lat)"

---

## 🚧 Solución Temporal (mientras Odoo se actualiza)

**Opción:** Guardar las coordenadas solo en PostgreSQL, sin sincronizar a Odoo.

El flujo funcionará así:
1. ✅ Usuario envía formulario
2. ✅ Se guarda en PostgreSQL
3. ✅ Se envía a Odoo (sin coords)
4. ⚠️ NO se guarda odoo_record_id (porque Odoo no lo devuelve)
5. ✅ Usuario envía ubicación
6. ✅ Coordenadas se guardan en PostgreSQL
7. ❌ NO se sincronizan a Odoo (porque no tenemos odoo_record_id)

**Ventajas:**
- El bot funciona normalmente
- Las coordenadas se guardan en PostgreSQL
- Puedes consultar las coordenadas desde tu dashboard

**Desventajas:**
- Odoo NO tendrá las coordenadas GPS
- El cron de sincronización no hará nada

**Cuando Odoo se actualice:**
- Solo necesitas redesplegar Next.js
- El sistema empezará a sincronizar automáticamente
- NO necesitas cambiar nada en el bot

---

## 📊 Estado de Implementación

| Componente | Estado | Bloqueado por |
|------------|--------|---------------|
| Script SQL | ✅ Creado | ⚠️ Ejecutar en DB |
| Bot con webhook | ✅ Creado | ⚠️ Renombrar archivo |
| Endpoint `/actualizar-coordenadas` | ✅ Creado | ⚠️ Desplegar a Cloud Run |
| Endpoint `/sincronizar-coordenadas-odoo` | ✅ Creado | ⚠️ Desplegar a Cloud Run |
| Endpoint `/cron/sync-coordinates` | ✅ Creado | ⚠️ Desplegar a Cloud Run |
| Odoo devuelve ID | ❌ No implementado | 🔴 Equipo de Odoo |

---

## 📝 Checklist de Despliegue

- [ ] Ejecutar script SQL en pgAdmin
- [ ] Verificar que las 4 columnas nuevas existen
- [ ] Desplegar Next.js a Cloud Run
- [ ] Verificar que `/api/actualizar-coordenadas` devuelve 200
- [ ] Renombrar `bot_unificado_updated.py` → `bot_unificado.py`
- [ ] Reiniciar el bot de Python
- [ ] Contactar equipo de Odoo sobre el ID
- [ ] Probar flujo: formulario + ubicación
- [ ] Verificar logs del bot (webhook exitoso)
- [ ] Verificar coordenadas en PostgreSQL
- [ ] (Opcional) Configurar cron job
- [ ] (Cuando Odoo devuelva ID) Verificar sincronización a Odoo

---

**Última actualización:** 2025-12-15
**Versión:** 1.0
