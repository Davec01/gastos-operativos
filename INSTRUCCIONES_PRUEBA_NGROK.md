# 📋 Instrucciones de Prueba con ngrok

## ✅ Cambios Implementados

### 1. **Formulario Modificado** ([gastos-operativos-form.tsx](components/gastos-operativos-form.tsx))

El formulario ahora:
- ✅ Recibe `id_ubicacion` en la respuesta de `/api/gastos`
- ✅ Llama automáticamente al endpoint `/set_pending_ubicacion` del bot
- ✅ Muestra mensaje al usuario para enviar GPS por Telegram

### 2. **Variable de Entorno** ([.env.local](.env.local))

- ✅ Agregada: `NEXT_PUBLIC_BOT_URL=http://34.174.97.159:8000`

---

## 🚀 Pasos para Probar

### Paso 1: Reiniciar Next.js

Como modificamos `.env.local`, necesitas reiniciar el servidor de desarrollo:

```bash
# Detén el servidor actual (Ctrl+C) y reinicia:
npm run dev
```

### Paso 2: Verificar que ngrok esté corriendo

Asegúrate de que ngrok esté expuesto en la URL que mencionaste:

```
https://d261dca339cd.ngrok-free.app
```

Si necesitas reiniciar ngrok:

```bash
ngrok http 3000
```

(Ajusta el puerto según donde corre tu Next.js)

### Paso 3: Probar el Flujo Completo

#### 3.1 Llenar el formulario desde Telegram WebApp

1. Abre el formulario en Telegram usando tu ngrok URL:
   ```
   https://d261dca339cd.ngrok-free.app?telegram_id=2039625899
   ```

2. Llena el formulario:
   - El empleado debería autocompletarse con tu PIN
   - Agrega un gasto operativo (ej: Hospedaje por $100,000)
   - Haz clic en **Enviar**

#### 3.2 Verificar en la Consola del Navegador

Abre las **DevTools del navegador** (F12) y verifica en la **Consola**:

✅ **Éxito esperado:**
```
✅ Empleado encontrado por PIN: ADOLFO JIMENEZ BUENO
✅ id_ubicacion enviado al bot: f47ac10b-58cc-4372-a567-0e02b2c3d479
```

❌ **Si ves error:**
```
❌ Error llamando al bot: Failed to fetch
```

**Posibles causas:**
- El bot no está corriendo en el servidor
- El puerto 8000 no está abierto
- Problema de CORS (el bot debe tener CORS habilitado)

#### 3.3 Verificar en los Logs del Bot

Conéctate a tu servidor SSH y verifica los logs:

```bash
ssh usuario@34.174.97.159

# Si el bot corre con screen:
screen -r viacotur

# O ver logs si usas systemd:
sudo journalctl -u viacotur-bot -f
```

✅ **Éxito esperado:**
```
INFO:viacotur:✅ id_ubicacion guardado para telegram_id 2039625899: f47ac10b-58cc-4372-a567-0e02b2c3d479
```

#### 3.4 Enviar Ubicación GPS desde Telegram

1. Abre el chat del bot en Telegram
2. Envía tu **ubicación GPS** (📍 Adjuntar → Ubicación)
3. El bot debe responder:
   ```
   ✅ Ubicación asociada correctamente
   ```

#### 3.5 Verificar en los Logs del Bot (de nuevo)

Deberías ver:

```
INFO:viacotur:📍 Ubicación de 2039625899: 6.168499, -75.615104
INFO:viacotur:✅ Ubicación guardada en ubicaciones_telegram
INFO:viacotur:✅ id_ubicacion encontrado: f47ac10b-58cc-4372-a567-0e02b2c3d479
INFO:viacotur:📦 Enviando con id_ubicacion: f47ac10b-58cc-4372-a567-0e02b2c3d479
INFO:viacotur:🔄 Llamando webhook: https://d261dca339cd.ngrok-free.app/api/actualizar-coordenadas
INFO:httpx:HTTP Request: POST .../api/actualizar-coordenadas "HTTP/1.1 200 OK"
INFO:viacotur:✅ Webhook exitoso: {'success': True, 'message': '...', 'data': {'records_updated': 1}}
```

#### 3.6 Verificar en PostgreSQL

Conéctate a PostgreSQL y ejecuta:

```sql
SELECT
  id,
  id_ubicacion,
  empleado,
  tipo,
  telegram_id,
  loc_lat,
  loc_lon,
  ubicacion_gps_telegram,
  created_at
FROM public.gastos_operacionales
WHERE telegram_id = '2039625899'
ORDER BY created_at DESC
LIMIT 1;
```

✅ **Resultado esperado:**
```
id: 123
id_ubicacion: f47ac10b-58cc-4372-a567-0e02b2c3d479
empleado: ADOLFO JIMENEZ BUENO
tipo: hospedaje
telegram_id: 2039625899
loc_lat: 6.168499
loc_lon: -75.615104
ubicacion_gps_telegram: POINT(-75.615104 6.168499)
created_at: 2025-12-15 23:40:09
```

---

## 🔍 Troubleshooting

### Problema 1: Error "Failed to fetch" en el navegador

**Síntoma:**
```
❌ Error llamando al bot: Failed to fetch
```

**Soluciones:**

1. **Verificar que el bot esté corriendo:**
   ```bash
   ssh usuario@34.174.97.159
   ps aux | grep python
   ```

2. **Verificar que el puerto 8000 esté abierto:**
   ```bash
   sudo ufw status
   sudo ufw allow 8000
   ```

3. **Probar manualmente desde tu máquina local:**
   ```bash
   curl -X POST http://34.174.97.159:8000/set_pending_ubicacion \
     -H "Content-Type: application/json" \
     -d '{"telegram_id": 2039625899, "id_ubicacion": "test-uuid-123"}'
   ```

   Debería devolver:
   ```json
   {"ok": true, "telegram_id": 2039625899, "id_ubicacion": "test-uuid-123", ...}
   ```

### Problema 2: CORS Error

**Síntoma:**
```
Access to fetch at 'http://34.174.97.159:8000/set_pending_ubicacion' from origin 'https://d261dca339cd.ngrok-free.app'
has been blocked by CORS policy
```

**Solución:**

Verifica que el bot tenga el middleware CORS configurado. En `bot_modificaciones_ubicacion.py` debe tener:

```python
from fastapi.middleware.cors import CORSMiddleware

api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permite todas las origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Problema 3: El bot no encuentra el id_ubicacion

**Síntoma:**
```
INFO:viacotur:⚠️ No se encontró id_ubicacion para 2039625899, usando fallback
```

**Solución:**

1. Verifica que el formulario esté llamando `/set_pending_ubicacion`
2. Verifica en consola del navegador (F12) si hay errores
3. Verifica que la URL del bot sea correcta en `.env.local`
4. Envía la ubicación GPS **inmediatamente** después del formulario (el diccionario tiene timeout de 30 minutos pero es mejor ser rápido)

### Problema 4: Webhook devuelve 404

**Síntoma:**
```
INFO:httpx:HTTP Request: POST .../api/actualizar-coordenadas "HTTP/1.1 404 Not Found"
```

**Solución:**

1. **Verifica que Next.js esté corriendo:**
   ```bash
   npm run dev
   ```

2. **Verifica que ngrok esté exponiendo el puerto correcto:**
   ```bash
   ngrok http 3000
   ```
   (Cambia 3000 por el puerto donde corre tu Next.js)

3. **Verifica que el archivo exista:**
   ```bash
   ls "c:\Tools\Collectif\Conversional form\gastos-operativos\app\api\actualizar-coordenadas\route.ts"
   ```

4. **Prueba manualmente el endpoint:**
   ```bash
   curl -X POST https://d261dca339cd.ngrok-free.app/api/actualizar-coordenadas \
     -H "Content-Type: application/json" \
     -d '{"telegram_id": "2039625899", "lat": 6.168499, "lon": -75.615104, "id_ubicacion": "test-uuid-123"}'
   ```

---

## 📊 Diagrama del Flujo

```
Usuario → Telegram WebApp (ngrok) → Next.js Local
    ↓
Next.js guarda en PostgreSQL (genera id_ubicacion)
    ↓
Next.js envía a Odoo (sin coords)
    ↓
Next.js devuelve al formulario: { ubicaciones: [{ id_ubicacion: "uuid..." }] }
    ↓
Formulario llama POST http://34.174.97.159:8000/set_pending_ubicacion
    ↓
Bot guarda en memoria: pending_ubicaciones[2039625899] = "uuid..."
    ↓
Usuario envía GPS desde Telegram
    ↓
Bot obtiene id_ubicacion de memoria
    ↓
Bot llama POST https://ngrok.../api/actualizar-coordenadas con id_ubicacion
    ↓
Next.js actualiza PostgreSQL usando WHERE id_ubicacion = "uuid..."
    ↓
✅ Coordenadas asociadas al gasto correcto
```

---

## ✅ Checklist de Verificación

- [ ] Next.js reiniciado después de modificar `.env.local`
- [ ] ngrok corriendo y exponiendo el puerto correcto
- [ ] Bot corriendo en el servidor (34.174.97.159:8000)
- [ ] Puerto 8000 abierto en el firewall del servidor
- [ ] Bot tiene CORS habilitado
- [ ] Endpoint `/set_pending_ubicacion` responde correctamente (prueba con curl)
- [ ] Formulario muestra el mensaje: "📍 Ahora envía tu ubicación GPS desde Telegram..."
- [ ] Consola del navegador muestra: "✅ id_ubicacion enviado al bot: ..."
- [ ] Logs del bot muestran: "✅ id_ubicacion guardado para telegram_id ..."
- [ ] Ubicación GPS se guarda correctamente en PostgreSQL

---

## 🎯 Resultado Final Esperado

Cuando todo funcione correctamente, el flujo completo será:

1. Usuario llena formulario → ✅ Formulario enviado
2. Formulario notifica al bot → ✅ id_ubicacion guardado en memoria
3. Usuario envía GPS → ✅ Bot recibe ubicación
4. Bot llama webhook con id_ubicacion → ✅ Webhook actualiza PostgreSQL
5. PostgreSQL actualizado con coordenadas exactas → ✅ Sistema completo funcionando

**Todo automático, sin intervención manual del usuario.** 🎉

---

**Última actualización:** 2025-12-15
**Versión:** 1.0
