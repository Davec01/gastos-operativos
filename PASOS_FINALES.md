# ✅ Pasos Finales - Sistema GPS Simplificado

## 🎯 Arquitectura Final

**NO sincronizamos coordenadas con Odoo.** Solo guardamos en PostgreSQL.

```
Usuario → Formulario → PG + Odoo (sin coords) → Usuario envía GPS → Solo se actualiza PG
```

---

## 📋 Checklist de Despliegue

### ✅ Paso 1: Migración SQL (YA HECHO)

Ya ejecutaste el SQL en pgAdmin. ✅

Verifica que las columnas existen:
```sql
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'gastos_operacionales'
  AND column_name IN ('id_ubicacion', 'odoo_record_id', 'ubicacion_gps_telegram');
```

---

### 🔴 Paso 2: Desplegar Next.js a Cloud Run (PENDIENTE)

Ejecuta desde tu terminal:

```bash
cd "c:\Tools\Collectif\Conversional form\gastos-operativos"
gcloud run deploy gastos-operativos --source . --region=southamerica-west1 --allow-unauthenticated
```

O usa el script:
```bash
deploy-to-cloudrun.bat
```

**Verificar después del despliegue:**
```bash
curl https://gastos-operativos-120049768418.southamerica-west1.run.app/api/actualizar-coordenadas

# Deberías ver:
{
  "service": "actualizar-coordenadas",
  "status": "online",
  ...
}
```

---

### 🔴 Paso 3: Actualizar Bot de Python (PENDIENTE)

El bot ya está corriendo la versión actualizada según tus logs:
```
INFO:viacotur:🔄 Llamando webhook: https://...
```

✅ **Ya está usando bot_unificado_updated.py**

Solo asegúrate de que el archivo que ejecutas se llama `bot_unificado.py` y tiene el código correcto.

---

### 🔴 Paso 4: Probar el Flujo Completo (DESPUÉS DEL PASO 2)

1. **Enviar formulario desde Telegram**
2. **Enviar ubicación GPS (dentro de 10 min)**
3. **Verificar logs del bot:**

```
📍 Ubicación de 2039625899: ...
🔄 Llamando webhook: https://...
✅ Webhook exitoso: ...
📊 Gastos actualizados: 1
```

4. **Verificar en PostgreSQL:**

```sql
SELECT
  id,
  empleado,
  tipo,
  loc_lat,
  loc_lon,
  odoo_record_id,
  ubicacion_gps_telegram
FROM public.gastos_operacionales
WHERE telegram_id = '2039625899'
ORDER BY created_at DESC
LIMIT 1;
```

**Deberías ver:**
- ✅ `loc_lat` y `loc_lon` con valores
- ✅ `odoo_record_id` = mismo valor que `id`
- ✅ `ubicacion_gps_telegram` = "POINT(lon lat)"

---

## 🗑️ Archivos que NO se usan

Estos archivos existen pero **NO son necesarios** en la arquitectura simplificada:

- ❌ `app/api/sincronizar-coordenadas-odoo/route.ts` - No hay sincronización con Odoo
- ❌ `app/api/cron/sync-coordinates/route.ts` - No hay cron jobs
- ❌ `PROBLEMA_ODOO_ID.md` - Ya no aplica (no necesitamos ID de Odoo)

Puedes eliminarlos o dejarlos (no afectan el funcionamiento).

---

## 📊 Flujo Técnico Detallado

### Cuando el usuario envía el formulario:

1. **Next.js recibe POST `/api/gastos`**
   ```typescript
   // Guardar en PostgreSQL
   const result = await client.query(insertQuery, params);
   const pgId = result.rows[0].id;  // ej: 123

   // Enviar a Odoo (con coords = "No disponible")
   await enviarGastoIndividualAOdoo({ ... });

   // Guardar odoo_record_id = pgId
   await client.query(
     `UPDATE gastos_operacionales SET odoo_record_id = $1 WHERE id = $2`,
     [pgId, pgId]  // odoo_record_id = 123
   );
   ```

2. **Odoo recibe el gasto:**
   ```json
   {
     "name": "ALOJAMIENTO OPERATIVO",
     "product_id": 12132,
     "total_amount": 213164,
     "employee_id": 3949,
     "ubicacion_gps_telegram": "No disponible",  // ← No tiene coords aún
     ...
   }
   ```

3. **PostgreSQL queda así:**
   ```
   id: 123
   empleado: "ADOLFO JIMENEZ BUENO"
   tipo: "hospedaje"
   telegram_id: "2039625899"
   loc_lat: NULL        ← Sin coords aún
   loc_lon: NULL
   odoo_record_id: 123  ← Mismo que id
   created_at: 2025-12-15 23:40:09
   ```

### Cuando el usuario envía ubicación GPS:

1. **Bot llama webhook `/api/actualizar-coordenadas`**
   ```python
   response = await client.post(
       webhook_url,
       json={
           "telegram_id": "2039625899",
           "lat": 6.168499,
           "lon": -75.615104
       }
   )
   ```

2. **Webhook actualiza PostgreSQL:**
   ```sql
   UPDATE public.gastos_operacionales
   SET
     loc_lat = 6.168499,
     loc_lon = -75.615104,
     loc_ts = NOW(),
     ubicacion_gps_telegram = 'POINT(-75.615104 6.168499)'
   WHERE telegram_id = '2039625899'
     AND created_at >= NOW() - INTERVAL '10 minutes'
     AND loc_lat IS NULL
   ```

3. **PostgreSQL queda así:**
   ```
   id: 123
   empleado: "ADOLFO JIMENEZ BUENO"
   tipo: "hospedaje"
   telegram_id: "2039625899"
   loc_lat: 6.168499    ← ✅ Actualizado
   loc_lon: -75.615104  ← ✅ Actualizado
   ubicacion_gps_telegram: "POINT(-75.615104 6.168499)"  ← ✅ Actualizado
   odoo_record_id: 123
   loc_ts: 2025-12-15 23:42:15  ← ✅ Actualizado
   ```

4. **Odoo NO se actualiza** (se queda con "No disponible")

---

## 🎯 Lo Más Importante

### ✅ Lo que SÍ funciona ahora:

1. ✅ Bot llama al webhook correctamente
2. ✅ El código de Next.js guarda `odoo_record_id = id`
3. ✅ Migración SQL ejecutada

### ❌ Lo único que falta:

1. ❌ **Desplegar Next.js a Cloud Run**

   El bot está intentando llamar a `/api/actualizar-coordenadas` pero ese endpoint no existe en Cloud Run (404):

   ```
   INFO:httpx:HTTP Request: POST .../api/actualizar-coordenadas "HTTP/1.1 404 Not Found"
   ```

---

## 🚀 Siguiente Paso: DESPLEGAR

Ejecuta:

```bash
cd "c:\Tools\Collectif\Conversional form\gastos-operativos"
gcloud run deploy gastos-operativos --source . --region=southamerica-west1 --allow-unauthenticated
```

Después de desplegar, prueba de nuevo el flujo completo y verás:

```
INFO:httpx:HTTP Request: POST .../api/actualizar-coordenadas "HTTP/1.1 200 OK"
✅ Webhook exitoso: {'success': True, 'message': '...', 'data': {'records_updated': 1}}
```

---

**Última actualización:** 2025-12-15
**Versión:** 3.0 (Final Simplificada)
