# 🔗 Integración del Formulario con el Bot - id_ubicacion

## 📋 Objetivo

Después de que el usuario envíe el formulario de gastos, llamar al bot para guardar el `id_ubicacion` y que el bot lo use cuando el usuario envíe su ubicación GPS.

---

## 🏗️ Arquitectura

```
Usuario llena formulario
    ↓
POST /api/gastos
    ↓
Respuesta incluye id_ubicacion
    ↓
Formulario llama POST http://TU-SERVIDOR-BOT:8000/set_pending_ubicacion
    ↓
Bot guarda en pending_ubicaciones[telegram_id] = id_ubicacion
    ↓
Usuario envía ubicación GPS desde Telegram
    ↓
Bot obtiene id_ubicacion de pending_ubicaciones
    ↓
Bot llama /api/actualizar-coordenadas con id_ubicacion
    ↓
✅ Webhook actualiza la fila correcta
```

---

## 📝 Paso 1: Modificar el Formulario

### Ubicación del Archivo

Busca el componente del formulario de gastos operativos:
- Probablemente en: `components/gastos-operativos-form.tsx`
- O en: `app/gastos-operativos/page.tsx`

### Código a Agregar

Después de enviar el formulario exitosamente, agrega esta llamada al bot:

```typescript
// En la función handleSubmit o similar, DESPUÉS de enviar a /api/gastos

const response = await fetch("/api/gastos", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(formData),
});

const data = await response.json();

if (data.success && data.ubicaciones && data.ubicaciones.length > 0) {
  // NUEVO: Notificar al bot sobre el id_ubicacion
  const telegram_id = formData.telegram_id; // O de donde obtengas el telegram_id
  const id_ubicacion = data.ubicaciones[0].id_ubicacion;

  try {
    // URL del bot (ajusta según tu configuración)
    const BOT_URL = process.env.NEXT_PUBLIC_BOT_URL || "http://TU-SERVIDOR-BOT:8000";

    const botResponse = await fetch(`${BOT_URL}/set_pending_ubicacion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegram_id: parseInt(telegram_id),
        id_ubicacion: id_ubicacion
      }),
    });

    const botData = await botResponse.json();

    if (botData.ok) {
      console.log("✅ id_ubicacion enviado al bot:", id_ubicacion);
    } else {
      console.warn("⚠️ Error enviando id_ubicacion al bot:", botData);
    }
  } catch (error) {
    console.error("❌ Error llamando al bot:", error);
    // NO hacer fail el formulario por esto
  }

  // Mostrar mensaje de éxito al usuario
  alert(
    "✅ Formulario enviado exitosamente.\n\n" +
    "📍 Ahora envía tu ubicación GPS desde Telegram dentro de los próximos 10 minutos."
  );
}
```

---

## 🔧 Paso 2: Configurar Variable de Entorno

Agrega la URL del bot a tu archivo `.env.local`:

```env
# URL del servidor donde corre el bot de Telegram
NEXT_PUBLIC_BOT_URL=http://DIRECCION-IP-DEL-SERVIDOR:8000

# Ejemplo si el bot corre en el mismo servidor:
# NEXT_PUBLIC_BOT_URL=http://localhost:8000

# Ejemplo si el bot está en un servidor remoto:
# NEXT_PUBLIC_BOT_URL=http://34.174.97.159:8000
```

**IMPORTANTE:**
- Si el bot corre en un servidor diferente, usa la IP pública
- Asegúrate de que el puerto 8000 esté abierto en el firewall
- Si usas Cloud Run para Next.js, no podrás usar `localhost`

---

## 🌐 Paso 3: Configurar CORS en el Bot

El bot ya tiene CORS configurado para permitir todas las conexiones:

```python
# En bot_modificaciones_ubicacion.py (ya incluido)
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite todas las origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 🧪 Paso 4: Testing

### Test 1: Verificar endpoint del bot

```bash
curl -X POST http://TU-SERVIDOR:8000/set_pending_ubicacion \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": 2039625899,
    "id_ubicacion": "f47ac10b-58cc-4372-a567-0e02b2c3d479"
  }'

# Respuesta esperada:
{
  "ok": true,
  "telegram_id": 2039625899,
  "id_ubicacion": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "message": "id_ubicacion guardado correctamente"
}
```

### Test 2: Verificar que se guardó

```bash
curl http://TU-SERVIDOR:8000/pending_ubicacion/2039625899

# Respuesta esperada:
{
  "ok": true,
  "telegram_id": 2039625899,
  "id_ubicacion": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "age_seconds": 15.3
}
```

### Test 3: Flujo completo

1. **Llena el formulario en el navegador**
2. **Verifica en consola del navegador (F12):**
   ```
   ✅ id_ubicacion enviado al bot: f47ac10b-58cc-4372-a567-0e02b2c3d479
   ```
3. **Verifica en logs del bot (servidor):**
   ```
   INFO:viacotur:✅ id_ubicacion guardado para telegram_id 2039625899: f47ac10b-58cc-4372-a567-0e02b2c3d479
   ```
4. **Envía ubicación GPS desde Telegram**
5. **Verifica en logs del bot:**
   ```
   INFO:viacotur:✅ id_ubicacion encontrado: f47ac10b-58cc-4372-a567-0e02b2c3d479
   INFO:viacotur:📦 Enviando con id_ubicacion: f47ac10b-58cc-4372-a567-0e02b2c3d479
   INFO:viacotur:✅ Webhook exitoso: ...
   ```
6. **Verifica en PostgreSQL:**
   ```sql
   SELECT id, id_ubicacion, empleado, tipo, loc_lat, loc_lon
   FROM public.gastos_operacionales
   WHERE id_ubicacion = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
   ```

---

## ⚙️ Opciones de Despliegue

### Opción A: Bot en servidor dedicado (Recomendada)

Si el bot corre en un servidor separado (ej: `34.174.97.159`):

```env
# .env.local
NEXT_PUBLIC_BOT_URL=http://34.174.97.159:8000
```

**Ventajas:**
- ✅ Simple y directo
- ✅ No requiere configuración adicional

**Desventajas:**
- ⚠️ Requiere que el puerto 8000 esté abierto públicamente
- ⚠️ Conexión sin encriptación (HTTP)

### Opción B: Proxy inverso con HTTPS

Si quieres HTTPS, agrega Nginx delante del bot:

```nginx
server {
    listen 443 ssl;
    server_name bot.tudominio.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location /set_pending_ubicacion {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```env
# .env.local
NEXT_PUBLIC_BOT_URL=https://bot.tudominio.com
```

### Opción C: Autenticación con token

Para mayor seguridad, agrega autenticación:

```python
# En el bot, modifica set_pending_ubicacion:
@api.post("/set_pending_ubicacion")
def set_pending_ubicacion(
    telegram_id: int = Body(...),
    id_ubicacion: str = Body(...),
    auth_token: str = Body(...)  # NUEVO
):
    # Verificar token
    EXPECTED_TOKEN = os.getenv("BOT_AUTH_TOKEN", "tu-token-secreto")
    if auth_token != EXPECTED_TOKEN:
        return {"ok": False, "error": "Unauthorized"}

    # ... resto del código
```

```typescript
// En el formulario:
body: JSON.stringify({
  telegram_id: parseInt(telegram_id),
  id_ubicacion: id_ubicacion,
  auth_token: process.env.NEXT_PUBLIC_BOT_AUTH_TOKEN
}),
```

---

## 🔍 Troubleshooting

### Problema: CORS error en el navegador

**Síntoma:**
```
Access to fetch at 'http://...:8000/set_pending_ubicacion' from origin 'https://...'
has been blocked by CORS policy
```

**Solución:**
Verifica que el bot tenga CORS configurado (ya está en el código proporcionado).

### Problema: Connection refused

**Síntoma:**
```
Failed to fetch: net::ERR_CONNECTION_REFUSED
```

**Solución:**
1. Verifica que el bot esté corriendo: `ps aux | grep python`
2. Verifica que el puerto 8000 esté abierto: `sudo netstat -tlnp | grep 8000`
3. Verifica el firewall: `sudo ufw status`

### Problema: Timeout

**Síntoma:**
```
Failed to fetch: net::ERR_CONNECTION_TIMED_OUT
```

**Solución:**
1. Verifica la IP del servidor en `.env.local`
2. Verifica que el firewall permita tráfico en el puerto 8000
3. Si el servidor está detrás de un NAT, configura port forwarding

---

## 📊 Diagrama de Secuencia

```
Usuario              Formulario Next.js       Bot (FastAPI)        PostgreSQL
  |                         |                      |                    |
  |--[Llena formulario]---->|                      |                    |
  |                         |                      |                    |
  |                         |--[POST /api/gastos]->|                    |
  |                         |                      |--[INSERT]--------->|
  |                         |                      |<--[id, uuid]-------|
  |                         |<--[ubicaciones]------|                    |
  |                         |                      |                    |
  |                         |--[POST /set_pending_ubicacion]----------->|
  |                         |                      |--[Guardar dict]----|
  |                         |<--[ok: true]---------|                    |
  |                         |                      |                    |
  |<--[✅ Ahora envía GPS]--|                      |                    |
  |                         |                      |                    |
  |--[Envía GPS Telegram]------------------------>|                    |
  |                         |                      |--[Get dict]------->|
  |                         |                      |<--[id_ubicacion]---|
  |                         |                      |                    |
  |                         |<--[POST /api/actualizar-coordenadas]------|
  |                         |                      |                    |
  |                         |------------------UPDATE con id_ubicacion->|
  |                         |<----------------------------------[OK]-----|
  |                         |                      |                    |
  |<--[✅ Ubicación OK]------------------------------|                    |
```

---

**Última actualización:** 2025-12-16
**Versión:** 1.0
