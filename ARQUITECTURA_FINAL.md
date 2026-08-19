# 🏗️ Arquitectura Final - Sistema GPS con id_ubicacion

## ✅ Lógica Correcta Implementada

**Ahora usamos `id_ubicacion` (UUID) como identificador único para cada gasto.**

---

## 🔄 Flujo Completo

```
1. Usuario llena formulario →
2. Next.js guarda en PostgreSQL →
   - Se genera id_ubicacion (UUID automático)
   - Se guarda odoo_record_id = id (PK)
3. Next.js envía a Odoo (sin coords) →
4. Next.js devuelve al formulario:
   {
     "success": true,
     "ubicaciones": [
       {
         "tipo": "hospedaje",
         "id_ubicacion": "uuid-aqui"
       }
     ]
   }
5. Formulario guarda id_ubicacion en localStorage o estado →
6. Usuario envía ubicación GPS →
7. Bot llama /api/actualizar-coordenadas con:
   {
     "telegram_id": "2039625899",
     "lat": 6.168499,
     "lon": -75.615104,
     "id_ubicacion": "uuid-aqui"  ← NUEVO
   }
8. Webhook busca por id_ubicacion específico →
9. Actualiza SOLO esa fila en PostgreSQL →
10. ✅ FIN
```

---

## 🗄️ Cambios en Base de Datos

### Columna `id_ubicacion`

```sql
ALTER TABLE public.gastos_operacionales
ADD COLUMN IF NOT EXISTS id_ubicacion UUID DEFAULT gen_random_uuid() UNIQUE;

CREATE INDEX IF NOT EXISTS idx_gastos_id_ubicacion
  ON public.gastos_operacionales(id_ubicacion);
```

**Características:**
- ✅ UUID generado automáticamente
- ✅ UNIQUE (no puede repetirse)
- ✅ Se crea al hacer INSERT (no requiere código adicional)

---

## 📡 Cambios en Endpoints

### 1. `/api/gastos` (POST)

**Request:** (sin cambios)
```json
{
  "empleado": "ADOLFO JIMENEZ BUENO",
  "telegram_id": "2039625899",
  "gastosOperativos": [
    {
      "tipo": "hospedaje",
      "valorTotal": 213164
    }
  ]
}
```

**Response:** (NUEVO - incluye ubicaciones)
```json
{
  "success": true,
  "empleado": "ADOLFO JIMENEZ BUENO",
  "inserted": 1,
  "odoo_success": true,
  "ubicaciones": [
    {
      "tipo": "hospedaje",
      "id_ubicacion": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    }
  ]
}
```

### 2. `/api/actualizar-coordenadas` (POST)

**Request:** (NUEVO - incluye id_ubicacion)
```json
{
  "telegram_id": "2039625899",
  "lat": 6.168499,
  "lon": -75.615104,
  "id_ubicacion": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
}
```

**Lógica:**
```sql
-- Si id_ubicacion está presente (PREFERIDO):
UPDATE public.gastos_operacionales
SET loc_lat = $1, loc_lon = $2, loc_ts = NOW(),
    ubicacion_gps_telegram = CONCAT('POINT(', $2, ' ', $1, ')')
WHERE id_ubicacion = $3::uuid
  AND telegram_id = $4
  AND (loc_lat IS NULL OR loc_lon IS NULL);

-- Si NO está presente (FALLBACK):
UPDATE public.gastos_operacionales
SET loc_lat = $1, loc_lon = $2, loc_ts = NOW(),
    ubicacion_gps_telegram = CONCAT('POINT(', $2, ' ', $1, ')')
WHERE telegram_id = $3
  AND created_at >= NOW() - INTERVAL '10 minutes'
  AND (loc_lat IS NULL OR loc_lon IS NULL);
```

---

## 🤖 Bot de Telegram

**El bot NO necesita cambios** porque actualmente no tiene acceso al `id_ubicacion`.

**PERO**, el formulario web SÍ necesita cambios para:
1. Recibir el `id_ubicacion` en la respuesta
2. Mostrarlo al usuario o guardarlo temporalmente
3. Pasarlo al bot de alguna forma

---

## 🎨 Opciones para Pasar id_ubicacion al Bot

### Opción A: Formulario muestra el UUID al usuario

**En el formulario (React/Next.js):**
```typescript
// Después de enviar el formulario exitosamente:
const response = await fetch('/api/gastos', { ... });
const data = await response.json();

if (data.success && data.ubicaciones) {
  const mensaje = data.ubicaciones
    .map(u => `${u.tipo}: ${u.id_ubicacion}`)
    .join('\n');

  alert(`✅ Formulario enviado.\n\nID de ubicación:\n${mensaje}\n\nCopia este ID y envíalo al bot junto con tu ubicación.`);
}
```

**Problema:** El usuario tendría que copiar/pegar el UUID manualmente.

### Opción B: LocalStorage + QR Code

**En el formulario:**
```typescript
const response = await fetch('/api/gastos', { ... });
const data = await response.json();

if (data.success && data.ubicaciones) {
  // Guardar en localStorage
  localStorage.setItem('pending_ubicacion', JSON.stringify({
    id_ubicacion: data.ubicaciones[0].id_ubicacion,
    telegram_id: telegram_id,
    timestamp: Date.now()
  }));

  // Generar QR code con deep link
  const deepLink = `https://t.me/tu_bot?start=ubicacion_${data.ubicaciones[0].id_ubicacion}`;
  // Mostrar QR code
}
```

**En el bot:**
```python
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    args = context.args
    if args and args[0].startswith('ubicacion_'):
        id_ubicacion = args[0].replace('ubicacion_', '')
        context.user_data['pending_id_ubicacion'] = id_ubicacion
        await update.message.reply_text("📍 Por favor, envía tu ubicación ahora.")
```

### Opción C: API del bot (RECOMENDADA)

**Agregar endpoint al bot para guardar temporalmente:**

```python
# En el bot (FastAPI):
pending_ubicaciones = {}  # {telegram_id: id_ubicacion}

@api.post("/set_pending_ubicacion")
def set_pending_ubicacion(telegram_id: int, id_ubicacion: str):
    pending_ubicaciones[telegram_id] = id_ubicacion
    return {"ok": True}
```

**En el formulario:**
```typescript
const response = await fetch('/api/gastos', { ... });
const data = await response.json();

if (data.success && data.ubicaciones) {
  // Notificar al bot
  await fetch('http://tu-servidor-bot:8000/set_pending_ubicacion', {
    method: 'POST',
    body: JSON.stringify({
      telegram_id: telegram_id,
      id_ubicacion: data.ubicaciones[0].id_ubicacion
    })
  });

  alert('✅ Ahora envía tu ubicación en Telegram');
}
```

**En handle_location del bot:**
```python
async def handle_location(update: Update, context: ContextTypes.DEFAULT_TYPE):
    chat_id = update.effective_chat.id
    lat = update.message.location.latitude
    lon = update.message.location.longitude

    # Obtener id_ubicacion del diccionario
    id_ubicacion = pending_ubicaciones.pop(chat_id, None)

    # Llamar webhook con id_ubicacion
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            webhook_url,
            json={
                "telegram_id": str(chat_id),
                "lat": lat,
                "lon": lon,
                "id_ubicacion": id_ubicacion  # ← NUEVO
            }
        )
```

---

## ✅ Ventajas de Usar id_ubicacion

1. ✅ **Precisión:** Actualiza exactamente el gasto correcto
2. ✅ **Múltiples gastos:** Usuario puede enviar varios formularios y luego varias ubicaciones
3. ✅ **Sin ventana de tiempo:** No depende de los 10 minutos
4. ✅ **Escalable:** Funciona con miles de usuarios simultáneos
5. ✅ **Auditoría:** Cada gasto tiene un ID único rastreable

---

## 📊 Comparación

| Característica | Método Anterior (tiempo) | Método Nuevo (id_ubicacion) |
|----------------|--------------------------|------------------------------|
| Búsqueda | telegram_id + 10 min | id_ubicacion específico |
| Múltiples gastos | ❌ Solo el último | ✅ Cualquiera |
| Precisión | ⚠️ Puede confundirse | ✅ 100% preciso |
| Timeout | ❌ 10 minutos | ✅ Sin límite* |
| Complejidad | ✅ Simple | ⚠️ Requiere coordinación |

*Se puede agregar timeout opcional si se desea.

---

## 🚀 Próximos Pasos

### 1. Desplegar Next.js ⚠️ URGENTE
```bash
cd "c:\Tools\Collectif\Conversional form\gastos-operativos"
gcloud run deploy gastos-operativos --source . --region=southamerica-west1
```

### 2. Decidir método para pasar id_ubicacion

Opciones:
- **A)** Mostrar UUID al usuario (manual)
- **B)** QR Code + deep link
- **C)** API del bot (recomendada)

### 3. Implementar método elegido

Si eliges **Opción C** (recomendada), necesito:
1. Agregar endpoint al bot
2. Modificar formulario para llamar al endpoint
3. Modificar handle_location para usar el id_ubicacion

---

## 🧪 Testing

### Test 1: Verificar que id_ubicacion se crea

```sql
SELECT id, id_ubicacion, empleado, tipo, telegram_id
FROM public.gastos_operacionales
ORDER BY created_at DESC
LIMIT 1;
```

Deberías ver un UUID en `id_ubicacion`.

### Test 2: Probar webhook con id_ubicacion

```bash
curl -X POST https://gastos-operativos-.../api/actualizar-coordenadas \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": "2039625899",
    "lat": 6.168499,
    "lon": -75.615104,
    "id_ubicacion": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }'
```

### Test 3: Probar fallback (sin id_ubicacion)

```bash
curl -X POST https://gastos-operativos-.../api/actualizar-coordenadas \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": "2039625899",
    "lat": 6.168499,
    "lon": -75.615104
  }'
```

Debería funcionar usando el método anterior (tiempo).

---

**Última actualización:** 2025-12-16
**Versión:** 4.0 (Con id_ubicacion)
