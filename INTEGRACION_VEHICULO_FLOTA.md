# Integración de Ubicación de Vehículos con API de Flota

## Descripción General

Esta funcionalidad integra automáticamente la ubicación GPS de los vehículos asignados a los empleados al momento de registrar gastos operativos. La ubicación se obtiene desde la API externa de flota y se asocia con cada gasto registrado.

## Arquitectura

```
┌─────────────────────┐
│   Formulario Web    │
│   (Telegram User)   │
└──────────┬──────────┘
           │
           ├─── 1. Cargar empleado por telegram_id
           │
           ├─── 2. Obtener vehículo asociado
           │         (tabla: estado_vehiculos)
           │
           ├─── 3. Consultar API Flota
           │         (http://31.97.98.223:8081)
           │
           ├─── 4. Extraer placa del vehiculo_nombre
           │         Ej: "Chevrolet/NQR/NNZ396" → "NNZ396"
           │
           ├─── 5. Buscar última posición en API
           │         Filtrar por placa
           │
           └─── 6. Registrar gasto + ubicación vehículo
                      ↓
              PostgreSQL + Odoo
```

---

## Componentes Implementados

### 1. API Endpoint: `/api/vehiculo-ubicacion`

**Archivo:** `app/api/vehiculo-ubicacion/route.ts`

**Propósito:** Obtener la ubicación más reciente del vehículo asociado a un empleado.

**Método:** GET

**Parámetros:**
- `telegram_id` (query param): ID de Telegram del empleado

**Flujo:**
1. Busca el vehículo en `estado_vehiculos` usando `telegram_user_id`
2. Extrae la placa del campo `vehiculo_nombre` (split por "/")
3. Consulta la API externa de flota con la placa
4. Retorna la ubicación más reciente del vehículo

**Ejemplo de Request:**
```bash
GET /api/vehiculo-ubicacion?telegram_id=123456789
```

**Ejemplo de Response:**
```json
{
  "success": true,
  "telegram_id": "123456789",
  "vehiculo_nombre": "Chevrolet/NQR/NNZ396",
  "placa": "NNZ396",
  "ubicacion": {
    "lat": 6.21393333333,
    "lon": -75.5793066667,
    "timestamp": "2025-12-19T16:19:06-05:00",
    "velocidad": 7.0,
    "vehiculo_id": "27258012",
    "matricula": "BLINDADA/LAX701"
  }
}
```

---

### 2. API Externa de Flota

**URL:** `http://31.97.98.223:8081/api/v1/external/flota`

**Header requerido:** `x-api-key: viacotur-secret-key-123`

**Timeout:** 30 segundos

**Formato de respuesta:**
```json
[
  {
    "vehiculo_id": "27258012",
    "timestamp": "2025-12-19T16:19:06-05:00",
    "coordenadas": {
      "lat": 6.21393333333,
      "long": -75.5793066667
    },
    "matricula": "BLINDADA/LAX701",
    "velocidad": 7.0
  }
]
```

**Función de extracción de placa:**
```typescript
function extraerPlaca(vehiculoNombre: string): string | null {
  // Ejemplo: "Chevrolet/NQR/NNZ396" → "NNZ396"
  const partes = vehiculoNombre.split('/');
  if (partes.length >= 3) {
    return partes[partes.length - 1].trim();
  }
  return partes[partes.length - 1]?.trim() || null;
}
```

---

### 3. Modificaciones en `/api/gastos`

**Archivo:** `app/api/gastos/route.ts`

**Cambios principales:**

1. **Nueva función `obtenerUbicacionVehiculo()`**
   - Llama internamente a `/api/vehiculo-ubicacion`
   - Se ejecuta una vez por formulario (no por cada gasto)
   - Retorna `null` si no hay vehículo asociado

2. **Actualización de `enviarGastoIndividualAOdoo()`**
   - Nuevo parámetro: `ubicacionVehiculo`
   - Campo `ubicacion_gps_vehiculo` ahora contiene:
     - Coordenadas (lat, lon)
     - Placa del vehículo
     - Timestamp de la ubicación

3. **Inserción en PostgreSQL**
   - Nuevos campos en el INSERT:
     - `vehiculo_placa`
     - `vehiculo_lat`
     - `vehiculo_lon`
     - `vehiculo_ts`

**Ejemplo de ubicacion_gps_vehiculo en Odoo:**
```
6.21393° N, -75.57931° E - Placa: NNZ396 - 19/12/2025, 4:19 p. m.
```

---

### 4. Migración de Base de Datos

**Archivo:** `migrations/add_vehiculo_tracking.sql`

**Campos agregados a `gastos_operacionales`:**
```sql
ALTER TABLE public.gastos_operacionales
ADD COLUMN IF NOT EXISTS vehiculo_placa VARCHAR(20),
ADD COLUMN IF NOT EXISTS vehiculo_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS vehiculo_lon DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS vehiculo_ts TIMESTAMP WITH TIME ZONE;
```

**Índice creado:**
```sql
CREATE INDEX IF NOT EXISTS idx_gastos_vehiculo_placa
ON public.gastos_operacionales(vehiculo_placa);
```

**Ejecutar migración:**

Windows:
```bash
run-vehiculo-migration.bat
```

Linux/Mac:
```bash
chmod +x run-vehiculo-migration.sh
./run-vehiculo-migration.sh
```

O manualmente:
```bash
psql -h 34.174.97.159 -U viacotur -d viacotur -p 5432 -f migrations/add_vehiculo_tracking.sql
```

---

### 5. Interfaz de Usuario (Formulario)

**Archivo:** `components/gastos-operativos-form.tsx`

**Nuevas características:**

1. **Estado de carga de ubicación del vehículo:**
   ```typescript
   const [ubicacionVehiculo, setUbicacionVehiculo] = useState<UbicacionVehiculo | null>(null)
   const [cargandoVehiculo, setCargandoVehiculo] = useState<boolean>(false)
   ```

2. **Carga automática al iniciar:**
   - Se ejecuta en paralelo con la búsqueda del empleado
   - Usa el `telegram_id` del usuario

3. **Tres estados visuales:**
   - **Cargando:** Spinner azul con mensaje
   - **Vehículo encontrado:** Tarjeta verde con información completa
   - **Sin vehículo:** Advertencia ámbar informando que no hay vehículo asociado

4. **Información mostrada:**
   - Placa del vehículo (destacada)
   - Nombre completo del vehículo
   - Coordenadas GPS (formato decimal)
   - Última actualización (fecha y hora local)
   - Indicador visual de que la ubicación se registrará automáticamente

**UI/UX:**
- Tarjeta con gradiente verde para indicar éxito
- Icono de auto (`Car`) en el header
- Grid responsivo (1 columna móvil, 2 columnas desktop)
- Punto parpadeante para indicar actividad
- Diseño coherente con el resto del formulario

---

## Flujo Completo de Datos

### Al Cargar el Formulario

```
1. Usuario abre formulario desde Telegram
   ↓
2. Se obtiene telegram_id (WebApp o querystring)
   ↓
3. Búsqueda en paralelo:
   ├─ /api/usuario-por-pin → Nombre del empleado
   └─ /api/vehiculo-ubicacion → Vehículo y ubicación
        ↓
        ├─ Buscar en estado_vehiculos por telegram_user_id
        ├─ Extraer placa de vehiculo_nombre
        ├─ Consultar API flota (http://31.97.98.223:8081)
        └─ Filtrar y ordenar por timestamp DESC
   ↓
4. Mostrar tarjeta con información del vehículo
```

### Al Enviar el Formulario

```
1. Usuario llena gastos y presiona "Enviar"
   ↓
2. Endpoint /api/gastos ejecuta:
   ├─ Obtener ubicación del vehículo (una sola vez)
   ├─ Insertar gastos en PostgreSQL con:
   │  ├─ Datos del gasto
   │  ├─ Ubicación Telegram (si está disponible)
   │  └─ Ubicación del vehículo (placa, lat, lon, timestamp)
   ├─ Indexar en Elasticsearch
   └─ Enviar a Odoo con:
       ├─ ubicacion_gps_telegram
       └─ ubicacion_gps_vehiculo (NUEVO)
```

---

## Relación con Tabla `estado_vehiculos`

**Tabla:** `public.estado_vehiculos`

**Campos relevantes:**
- `telegram_user_id`: ID de Telegram del empleado (FK lógica)
- `vehiculo_nombre`: Formato "Marca/Modelo/Placa" (ej: "Chevrolet/NQR/NNZ396")

**Query de asociación:**
```sql
SELECT vehiculo_nombre, telegram_user_id
FROM public.estado_vehiculos
WHERE telegram_user_id = '123456789'
ORDER BY updated_at DESC NULLS LAST, created_at DESC
LIMIT 1;
```

**Importante:** La placa se extrae del último segmento de `vehiculo_nombre` usando split por "/".

---

## Manejo de Errores

### 1. Sin vehículo asociado
- El formulario muestra advertencia ámbar
- El gasto se registra sin ubicación del vehículo
- `ubicacion_gps_vehiculo` en Odoo = "No disponible"

### 2. API de flota no responde
- Timeout de 30 segundos
- Log de error en consola
- Se retorna `null` sin bloquear el formulario

### 3. Vehículo sin ubicación reciente
- Si la placa no se encuentra en la API de flota
- Se retorna error 404 con mensaje descriptivo

### 4. Formato incorrecto de vehiculo_nombre
- Si el campo no tiene el formato esperado
- Se intenta extraer el último segmento de todas formas
- Si falla, se retorna `null`

---

## Logs y Debugging

**Endpoint vehiculo-ubicacion:**
```javascript
console.log(`Buscando ubicación para placa: ${placa} (telegram_id: ${telegramId})`)
```

**Endpoint gastos:**
```javascript
console.log("Obteniendo ubicación del vehículo para guardar en BD...")
console.log(`✅ Ubicación del vehículo obtenida: Placa ${ubicacionVehiculo.placa}, Lat: ${ubicacionVehiculo.lat}, Lon: ${ubicacionVehiculo.lon}`)
console.warn("⚠️ No se pudo obtener ubicación del vehículo, se usará 'No disponible'")
```

**Frontend:**
```javascript
console.log(`✅ Ubicación del vehículo cargada: Placa ${dataVehiculo.placa}`)
console.warn(`⚠️ No se encontró vehículo asociado al empleado`)
```

---

## Pruebas

### 1. Prueba de Endpoint

```bash
# Con vehículo asociado
curl "http://localhost:3000/api/vehiculo-ubicacion?telegram_id=123456789"

# Sin vehículo asociado
curl "http://localhost:3000/api/vehiculo-ubicacion?telegram_id=999999999"
```

### 2. Prueba de API Externa

```bash
curl -H "x-api-key: viacotur-secret-key-123" \
     "http://31.97.98.223:8081/api/v1/external/flota"
```

### 3. Verificar en Base de Datos

```sql
-- Ver gastos con ubicación de vehículo
SELECT
  id,
  empleado,
  vehiculo_placa,
  vehiculo_lat,
  vehiculo_lon,
  vehiculo_ts,
  created_at
FROM public.gastos_operacionales
WHERE vehiculo_placa IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

### 4. Verificar en Odoo

Revisar que el campo `ubicacion_gps_vehiculo` contenga el formato:
```
6.21393° N, -75.57931° E - Placa: NNZ396 - 19/12/2025, 4:19 p. m.
```

---

## Dependencias

1. **PostgreSQL:** Tabla `estado_vehiculos` debe existir
2. **API Externa de Flota:** Debe estar accesible en `http://31.97.98.223:8081`
3. **API Key:** `viacotur-secret-key-123` debe ser válida
4. **Campos en Odoo:** `ubicacion_gps_vehiculo` debe existir en el endpoint `/api/gastos/register`

---

## Configuración de Variables de Entorno

**No se requieren nuevas variables**, pero asegúrate de que existan:

```env
# .env.local
DATABASE_URL=postgresql://viacotur:viacotur_pass@34.174.97.159:5432/viacotur
```

**Nota:** La URL de la API de flota está hardcodeada en el código. Si cambia, editar en:
- `app/api/vehiculo-ubicacion/route.ts` línea 24

---

## Roadmap Futuro

### Posibles mejoras:

1. **Cache de ubicaciones:**
   - Redis para cachear ubicaciones por 5 minutos
   - Reducir llamadas a la API externa

2. **Histórico de ubicaciones:**
   - Guardar todas las posiciones del vehículo
   - Tabla `ubicaciones_vehiculo_historico`

3. **Validación de distancia:**
   - Comparar ubicación del Telegram vs ubicación del vehículo
   - Alertar si están muy separados (posible fraude)

4. **Mapa interactivo:**
   - Mostrar mapa con la ubicación del vehículo
   - Usar Leaflet o Google Maps

5. **Notificaciones:**
   - Enviar mensaje al Telegram si no se encuentra el vehículo
   - Alertas si el vehículo está fuera de zona

---

## Soporte y Contacto

Para problemas con la integración:

1. Revisar logs del servidor: `console.log` en los endpoints
2. Verificar conectividad a la API externa de flota
3. Comprobar que la tabla `estado_vehiculos` tenga datos
4. Validar que los `telegram_user_id` coincidan entre sistemas

---

## Resumen de Archivos Modificados/Creados

### Nuevos Archivos:
- ✅ `app/api/vehiculo-ubicacion/route.ts`
- ✅ `migrations/add_vehiculo_tracking.sql`
- ✅ `run-vehiculo-migration.bat`
- ✅ `run-vehiculo-migration.sh`
- ✅ `INTEGRACION_VEHICULO_FLOTA.md`

### Archivos Modificados:
- ✅ `app/api/gastos/route.ts`
- ✅ `components/gastos-operativos-form.tsx`

---

**Última actualización:** 2025-12-19
**Versión:** 1.0
**Estado:** ✅ Implementado y funcional
