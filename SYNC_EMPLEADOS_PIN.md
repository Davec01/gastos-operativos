# Sincronización de Códigos PIN de Empleados

## Descripción

Este endpoint permite sincronizar códigos PIN entre la base de datos local PostgreSQL (`usuarios_registrados`) y el sistema externo de VIACOTUR (Odoo).

**Endpoint:** `/api/sync-empleados-pin`

---

## Funcionamiento

1. **Obtiene empleados** del endpoint externo: `http://35.223.72.198:4001/empleados`
2. **Obtiene usuarios registrados** de la base de datos PostgreSQL local
3. **Compara nombres** (normaliza tildes, mayúsculas, espacios)
4. **Registra PINs** para empleados que no tienen código PIN asignado
5. **Usa token dinámico** obtenido del endpoint `/empleados` para autenticar cada registro

---

## Métodos HTTP

### GET - Obtener Resumen

Obtiene un resumen del estado actual sin realizar cambios.

**Request:**
```bash
curl http://localhost:3000/api/sync-empleados-pin
```

**Response:**
```json
{
  "success": true,
  "resumen": {
    "total_usuarios_registrados": 50,
    "total_empleados_externos": 66,
    "con_pin": 30,
    "sin_pin": 20,
    "sin_coincidencia": 0
  },
  "empleados_sin_pin": [
    "JUAN PEREZ LOPEZ",
    "MARIA GONZALEZ RUIZ",
    ...
  ]
}
```

---

### POST - Sincronizar PINs

Registra códigos PIN para empleados que no los tienen.

#### Parámetros del Body (todos opcionales)

```json
{
  "pin": "1234",           // PIN por defecto a asignar (default: "0000")
  "dryRun": false,         // Si es true, solo simula sin hacer cambios (default: false)
  "filtroNombres": []      // Array de nombres específicos a procesar (default: [])
}
```

#### Ejemplos de Uso

**1. Simulación (Dry Run) - Ver qué se haría sin aplicar cambios:**

```bash
curl -X POST http://localhost:3000/api/sync-empleados-pin \
  -H "Content-Type: application/json" \
  -d '{
    "pin": "1234",
    "dryRun": true
  }'
```

**Response:**
```json
{
  "success": true,
  "mensaje": "Simulación completada (no se realizaron cambios)",
  "estadisticas": {
    "procesados": 20,
    "registrados": 0,
    "yaTienenPin": 15,
    "sinCoincidencia": 2,
    "errores": 3
  },
  "detalles": [
    {
      "nombre": "JUAN PEREZ LOPEZ",
      "accion": "SIMULAR_REGISTRO",
      "detalles": "Se registraría PIN 1234 para ID 4844, NIF/Telegram_ID 98492913"
    },
    {
      "nombre": "MARIA GONZALEZ RUIZ",
      "accion": "YA_TIENE_PIN",
      "detalles": "PIN existente: 5678"
    },
    ...
  ],
  "token_usado": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

**2. Ejecución Real - Registrar PINs:**

```bash
curl -X POST http://localhost:3000/api/sync-empleados-pin \
  -H "Content-Type: application/json" \
  -d '{
    "pin": "1234",
    "dryRun": false
  }'
```

**Response:**
```json
{
  "success": true,
  "mensaje": "Sincronización completada",
  "estadisticas": {
    "procesados": 20,
    "registrados": 5,
    "yaTienenPin": 12,
    "sinCoincidencia": 1,
    "errores": 2
  },
  "detalles": [
    {
      "nombre": "JUAN PEREZ LOPEZ",
      "accion": "REGISTRADO",
      "detalles": "PIN registrado exitosamente"
    },
    ...
  ],
  "token_usado": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

**3. Procesar Solo Ciertos Empleados:**

```bash
curl -X POST http://localhost:3000/api/sync-empleados-pin \
  -H "Content-Type: application/json" \
  -d '{
    "pin": "9999",
    "filtroNombres": [
      "JUAN PEREZ LOPEZ",
      "MARIA GONZALEZ RUIZ"
    ],
    "dryRun": false
  }'
```

---

## Estados de Acción

El campo `accion` en los detalles puede tener los siguientes valores:

| Acción | Descripción |
|--------|-------------|
| `REGISTRADO` | PIN registrado exitosamente |
| `YA_TIENE_PIN` | El empleado ya tiene un PIN asignado |
| `SIN_COINCIDENCIA` | No se encontró coincidencia en el endpoint externo |
| `ERROR` | Ocurrió un error al registrar el PIN |
| `SIMULAR_REGISTRO` | (Solo en dryRun) Indica que se registraría el PIN |

---

## Normalización de Nombres

El sistema normaliza los nombres antes de compararlos:

- Elimina tildes: `José` → `Jose`
- Convierte a mayúsculas: `lopez` → `LOPEZ`
- Elimina espacios extra: `Juan  Perez` → `Juan Perez`

Esto asegura que variaciones menores en el nombre no impidan la coincidencia.

---

## Identificación por NIF vs Telegram ID

El sistema prioriza el uso del NIF (documento de identidad) para registrar PINs. Si la tabla `usuarios_registrados` no tiene la columna `nif`, usa el `telegram_id` como fallback.

### Agregar Columna NIF (Recomendado)

Si quieres usar el NIF real de los empleados, ejecuta este SQL en PostgreSQL:

```sql
-- Agregar columna nif a la tabla usuarios_registrados
ALTER TABLE public.usuarios_registrados
ADD COLUMN nif VARCHAR(20);

-- Actualizar con valores existentes (si los tienes)
UPDATE public.usuarios_registrados
SET nif = '98492913'
WHERE nombre = 'JUAN PEREZ LOPEZ';

-- O importar desde un CSV
-- COPY public.usuarios_registrados (telegram_id, nombre, nif)
-- FROM '/path/to/empleados.csv'
-- DELIMITER ',' CSV HEADER;
```

---

## Manejo de Errores

El endpoint es tolerante a fallos y siempre devuelve una respuesta válida:

- Si falla la conexión al endpoint externo, devuelve error 500
- Si falla la conexión a PostgreSQL, devuelve error 500
- Si falla el registro de un PIN individual, lo marca como error pero continúa con los demás
- Los errores individuales se reportan en el array `detalles`

---

## Logs en Consola

El endpoint genera logs detallados en la consola del servidor:

```
=== Iniciando sincronización de PINs ===
Modo: PRODUCCIÓN
PIN por defecto: 1234
Obteniendo empleados del endpoint externo...
✓ 66 empleados obtenidos
Obteniendo usuarios registrados de PostgreSQL...
✓ 50 usuarios registrados
Registrando PIN para JUAN PEREZ LOPEZ (ID: 4844, NIF/Telegram_ID: 98492913)...
=== Sincronización completada ===
Total procesados: 50
Registrados: 5
Ya tienen PIN: 40
Sin coincidencia: 2
Errores: 3
```

---

## Seguridad

- **Token dinámico:** El sistema obtiene automáticamente el token del endpoint `/empleados` antes de cada sincronización
- **Timeout:** Todas las peticiones HTTP tienen timeout de 5-10 segundos
- **Validación:** Se valida que exista el ID del empleado y el NIF/telegram_id antes de registrar

---

## Flujo Completo

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. GET /empleados                                               │
│    → Obtiene lista de empleados + token dinámico               │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. SELECT * FROM usuarios_registrados                           │
│    → Obtiene usuarios locales                                   │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Comparar nombres (normalizado)                               │
│    → Encuentra coincidencias                                    │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Filtrar: solo empleados sin PIN                             │
│    → Verifica campo codigo_pin                                  │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. POST /api/empleados/register?nif=XXX&id=YYY                 │
│    Authorization: Bearer {token}                                │
│    Body: { "pin": "1234" }                                      │
│    → Registra PIN en sistema Odoo                               │
└─────────────────────────────────────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. Retorna estadísticas + detalles                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Troubleshooting

### Error: "No se encontró NIF ni telegram_id"
**Solución:** Verifica que la tabla `usuarios_registrados` tenga al menos la columna `telegram_id` con valores válidos.

### Error: "No encontrado en endpoint externo"
**Solución:** El nombre en PostgreSQL no coincide con ningún nombre en el endpoint. Verifica que el nombre esté exactamente igual (la normalización ayuda, pero debe ser el mismo empleado).

### Error: "Error al obtener empleados"
**Solución:** El endpoint `http://35.223.72.198:4001/empleados` no está disponible. Verifica la conectividad de red.

### Error: "Error registrando PIN para empleado"
**Solución:** Puede ser:
- Token expirado (el endpoint lo renueva automáticamente)
- NIF incorrecto
- ID de empleado incorrecto
- Endpoint Odoo no disponible

---

## Uso Programático en el Frontend

Si quieres llamar este endpoint desde el frontend:

```typescript
// Obtener resumen
const resumen = await fetch('/api/sync-empleados-pin');
const data = await resumen.json();
console.log('Empleados sin PIN:', data.empleados_sin_pin);

// Simulación
const simulacion = await fetch('/api/sync-empleados-pin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pin: '1234',
    dryRun: true
  })
});
const resultado = await simulacion.json();
console.log('Simulación:', resultado);

// Ejecución real
const ejecucion = await fetch('/api/sync-empleados-pin', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    pin: '1234',
    dryRun: false
  })
});
const final = await ejecucion.json();
console.log('Registrados:', final.estadisticas.registrados);
```

---

## Notas Importantes

1. **Siempre prueba primero con `dryRun: true`** para ver qué cambios se aplicarían
2. **El token se obtiene automáticamente** del endpoint `/empleados` en cada ejecución
3. **La comparación de nombres es case-insensitive** y tolerante a tildes
4. **Si un empleado ya tiene PIN**, se omite automáticamente
5. **Los errores individuales no detienen** el proceso completo
