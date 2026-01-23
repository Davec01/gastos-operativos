"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, FileText, Calculator, Utensils, Bed, Car, AlertCircle, ShieldX } from "lucide-react"

// ────────────────────────────────────────────────────────────────────────────────
// Tipos y constantes
// ────────────────────────────────────────────────────────────────────────────────

type TipoGasto = "alimentacion" | "hospedaje" | "peajes" | "otros"

interface ArchivoAdjunto {
  nombre: string
  tipo: "pdf" | "image"
  base64: string
}

interface GastoOperativo {
  id: string
  tipo: TipoGasto | ""
  valorTotal?: string
  archivo?: ArchivoAdjunto
}

const TIPOS_GASTO: { value: TipoGasto; label: string; icon: any }[] = [
  { value: "alimentacion", label: "Alimentación", icon: Utensils },
  { value: "hospedaje", label: "Hospedaje", icon: Bed },
  { value: "peajes", label: "Peajes", icon: Car },
  { value: "otros", label: "Otros Imprevistos", icon: AlertCircle },
]

// ────────────────────────────────────────────────────────────────────────────────
/** Helpers */
// ────────────────────────────────────────────────────────────────────────────────

function nuevoGasto(): GastoOperativo {
  return { id: String(Date.now()), tipo: "" }
}

async function convertirArchivoABase64(file: File): Promise<ArchivoAdjunto | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      // Remover el prefijo "data:application/pdf;base64," o "data:image/jpeg;base64,"
      const base64Data = base64.split(",")[1]

      // Determinar el tipo de archivo
      const esPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
      const tipo: "pdf" | "image" = esPdf ? "pdf" : "image"

      resolve({
        nombre: file.name,
        tipo,
        base64: base64Data,
      })
    }
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}
function parseMonto(s?: string) {
  if (!s) return 0
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : 0
}
function getTelegramIdFallback(): string | null {
  try {
    // Telegram WebApp
    const tg = (window as any)?.Telegram?.WebApp?.initDataUnsafe?.user?.id
    if (tg) return String(tg)
    // Querystring
    const url = new URL(window.location.href)
    const q = url.searchParams.get("telegram_id")
    if (q) return q
  } catch {}
  return null
}

const fmtCOP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0, // cambia a 2 si quieres centavos
})
function formatCOP(v?: string | number | null) {
  if (v === null || v === undefined || v === "") return "—"
  const n = Number.parseFloat(String(v))
  return Number.isFinite(n) ? fmtCOP.format(n) : "—"
}

// ────────────────────────────────────────────────────────────────────────────────
/** Campos específicos por tipo */
// ────────────────────────────────────────────────────────────────────────────────

function CamposEspecificos({
  gasto,
  actualizar,
}: {
  gasto: GastoOperativo
  actualizar: (campo: keyof GastoOperativo, valor: string | boolean | ArchivoAdjunto | undefined) => void
}) {
  const handleArchivoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      actualizar("archivo", undefined)
      return
    }

    const archivo = await convertirArchivoABase64(file)
    if (archivo) {
      actualizar("archivo", archivo)
    }
  }

  if (gasto.tipo) {
    const tipoInfo = TIPOS_GASTO.find((t) => t.value === gasto.tipo)
    const Icon = (tipoInfo?.icon || AlertCircle) as any

    return (
      <div className="space-y-5 p-4 sm:p-6 bg-slate-100/80 rounded-2xl shadow-sm border border-slate-200">
        <h4 className="font-semibold text-slate-800 flex items-center gap-3 text-base sm:text-lg">
          <span className="p-2 bg-blue-100 rounded-2xl">
            <Icon className="h-5 w-5 text-blue-700" />
          </span>
          Información de {tipoInfo?.label}
        </h4>

        <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold text-slate-900">
              Valor total facturas {gasto.tipo} *
            </Label>
            <Input
              type="number"
              inputMode="numeric"
              step="1"
              min="0"
              placeholder="65000"
              value={gasto.valorTotal || ""}
              onChange={(e) => actualizar("valorTotal", e.target.value)}
              className="h-11 sm:h-12 bg-slate-200 border-slate-400 rounded-xl"
              required
            />
            <p className="text-xs text-slate-600">{formatCOP(gasto.valorTotal || 0)}</p>
          </div>

          <div className="space-y-2.5">
            <Label className="text-sm font-semibold text-slate-900">Factura/Soporte {gasto.tipo} *</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleArchivoChange}
              className="h-11 sm:h-12 bg-slate-200 border-slate-400 rounded-xl file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-700 file:text-white"
            />
            {gasto.archivo && (
              <p className="text-xs text-green-600 flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {gasto.archivo.nombre} ({gasto.archivo.tipo})
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}

// ────────────────────────────────────────────────────────────────────────────────
/** Tarjeta de gasto */
// ────────────────────────────────────────────────────────────────────────────────

function GastoCard({
  gasto,
  index,
  onEliminar,
  onActualizar,
}: {
  gasto: GastoOperativo
  index: number
  onEliminar: (id: string) => void
  onActualizar: (id: string, campo: keyof GastoOperativo, valor: string | boolean | ArchivoAdjunto | undefined) => void
}) {
  const actualizar = (campo: keyof GastoOperativo, valor: string | boolean | ArchivoAdjunto | undefined) => onActualizar(gasto.id, campo, valor)

  return (
    <Card className="shadow-xl border-slate-300 bg-slate-50/90 backdrop-blur-sm hover:shadow-2xl transition rounded-2xl">
      <CardHeader className="p-4 sm:p-6 bg-gradient-to-r from-slate-200 to-slate-300 border-b border-slate-300 rounded-t-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg sm:text-xl font-semibold text-slate-800">Gasto Operativo #{index + 1}</h3>
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => onEliminar(gasto.id)}
            className="h-9 w-9 sm:h-10 sm:w-10 text-red-500 hover:text-white hover:bg-red-500 border-red-300 bg-white rounded-xl"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-8 space-y-6 sm:space-y-8 bg-slate-200/90">
        <div className="space-y-2.5">
          <Label className="text-sm sm:text-base font-semibold text-slate-900">Tipo de Gasto *</Label>
          <Select value={gasto.tipo} onValueChange={(value) => actualizar("tipo", value)}>
            <SelectTrigger className="bg-slate-300 border-slate-500 h-11 sm:h-14 rounded-xl">
              <SelectValue placeholder="Seleccionar tipo de gasto" className="text-slate-800" />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-300 rounded-xl">
              {TIPOS_GASTO.map((tipo) => {
                const Icon = tipo.icon
                return (
                  <SelectItem key={tipo.value} value={tipo.value} className="py-2.5 sm:py-3">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5" />
                      <span className="text-sm sm:text-base">{tipo.label}</span>
                    </div>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>

        <CamposEspecificos gasto={gasto} actualizar={actualizar} />
      </CardContent>
    </Card>
  )
}

// ────────────────────────────────────────────────────────────────────────────────
/** Componente principal */
// ────────────────────────────────────────────────────────────────────────────────

interface UbicacionVehiculo {
  lat: number | null
  lon: number | null
  placa: string | null
  timestamp: string | null
  vehiculo_nombre?: string
}

export function GastosOperativosForm() {
  const [gastosOperativos, setGastosOperativos] = useState<GastoOperativo[]>([])
  const [empleado, setEmpleado] = useState<string>("")
  const [ubicacionVehiculo, setUbicacionVehiculo] = useState<UbicacionVehiculo | null>(null)
  const [cargandoVehiculo, setCargandoVehiculo] = useState<boolean>(false)

  // Estado para validación de usuario registrado
  const [usuarioRegistrado, setUsuarioRegistrado] = useState<boolean | null>(null) // null = cargando
  const [validandoUsuario, setValidandoUsuario] = useState<boolean>(true)

  // Estado para prevenir doble envío
  const [enviando, setEnviando] = useState<boolean>(false)

  // Validar usuario registrado y autocompletar empleado
  useEffect(() => {
    const pin = getTelegramIdFallback()

    // Si no hay telegram_id, el usuario no está autorizado
    if (!pin) {
      setUsuarioRegistrado(false)
      setValidandoUsuario(false)
      return
    }

    ;(async () => {
      try {
        // PASO 1: Validar si el usuario está registrado en usuarios_registrados
        setValidandoUsuario(true)
        const validacionRes = await fetch(`/api/validar-usuario-registrado?telegram_id=${encodeURIComponent(pin)}`)
        const validacionData = await validacionRes.json()

        if (!validacionData.registrado) {
          console.warn(`🚫 Usuario con telegram_id ${pin} NO está registrado`)
          setUsuarioRegistrado(false)
          setValidandoUsuario(false)
          return // No continuar si no está registrado
        }

        // Usuario está registrado
        setUsuarioRegistrado(true)
        setValidandoUsuario(false)
        console.log(`✅ Usuario registrado: ${validacionData.nombre}`)

        // PASO 2: Buscar empleado por PIN en la API externa
        const r = await fetch(`/api/usuario-por-pin?pin=${encodeURIComponent(pin)}`)
        const j = await r.json()
        const nombre = (j?.empleado || "").trim()
        if (nombre) {
          setEmpleado(nombre)
          console.log(`✅ Empleado encontrado por PIN: ${nombre}`)
        } else {
          // Si no se encuentra en API externa, usar nombre de usuarios_registrados
          if (validacionData.nombre) {
            setEmpleado(validacionData.nombre)
            console.log(`✅ Usando nombre de BD local: ${validacionData.nombre}`)
          } else {
            console.warn(`⚠️ No se encontró empleado con PIN: ${pin}`)
          }
        }

        // PASO 3: Obtener ubicación del vehículo
        setCargandoVehiculo(true)
        try {
          const rVehiculo = await fetch(`/api/vehiculo-ubicacion?telegram_id=${encodeURIComponent(pin)}`)
          if (rVehiculo.ok) {
            const dataVehiculo = await rVehiculo.json()
            if (dataVehiculo.success && dataVehiculo.ubicacion) {
              setUbicacionVehiculo({
                lat: dataVehiculo.ubicacion.lat,
                lon: dataVehiculo.ubicacion.lon,
                placa: dataVehiculo.placa,
                timestamp: dataVehiculo.ubicacion.timestamp,
                vehiculo_nombre: dataVehiculo.vehiculo_nombre,
              })
              console.log(`✅ Ubicación del vehículo cargada: Placa ${dataVehiculo.placa}`)
            } else {
              console.warn(`⚠️ No se encontró vehículo asociado al empleado`)
            }
          }
        } catch (eVehiculo) {
          console.error("Error obteniendo ubicación del vehículo:", eVehiculo)
        } finally {
          setCargandoVehiculo(false)
        }
      } catch (e) {
        console.error("Error en validación/carga inicial:", e)
        setUsuarioRegistrado(false)
        setValidandoUsuario(false)
      }
    })()
  }, [])

  const agregarGasto = () => setGastosOperativos((prev) => [...prev, nuevoGasto()])
  const eliminarGasto = (id: string) => setGastosOperativos((prev) => prev.filter((g) => g.id !== id))
  const actualizarGasto = (id: string, campo: keyof GastoOperativo, valor: string | boolean | ArchivoAdjunto | undefined) => {
    setGastosOperativos((prev) => prev.map((g) => (g.id === id ? { ...g, [campo]: valor } : g)))
  }

  const totalGeneralNum = useMemo(() => {
    return gastosOperativos.reduce((acc, g) => {
      return acc + parseMonto(g.valorTotal)
    }, 0)
  }, [gastosOperativos])

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()

    // Prevenir doble envío
    if (enviando) return

    if (!empleado.trim()) {
      alert("No se detectó el empleado. Verifica Telegram o escribe tu nombre.")
      return
    }

    setEnviando(true)
  
    // 1) Detectar telegram_id (del WebApp o querystring)
    const tgId = getTelegramIdFallback()
  
    // 2) Consultar FastAPI por la última ubicación
    let loc: { lat: number|null; lon: number|null; ts: string|null; fresh: boolean } =
      { lat: null, lon: null, ts: null, fresh: false }
  
    if (tgId) {
      try {
        const rLoc = await fetch(
          `/api/ultima-ubicacion?telegram_id=${encodeURIComponent(tgId)}&max_age_min=60`,
          { headers: { Accept: "application/json" } }
        );
        if (rLoc.ok) loc = await rLoc.json()
      } catch (e) {
        console.error("No se pudo obtener última ubicación:", e)
      }
    }
  
    // 3) Enviar TODO a tu API interna
    try {
      const res = await fetch("/api/gastos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram_id: tgId ? Number(tgId) : null,
          empleado,
          gastosOperativos,
          ubicacion: {
            lat: loc.lat, lon: loc.lon, ts: loc.ts, fresh: loc.fresh
          }
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        console.error("❌ Error:", data)
        alert(data?.error || "Error al guardar")
        return
      }

      // Notificar al bot a través de la API proxy (evita CORS)
      // IMPORTANTE: Esperar a que estas llamadas terminen ANTES del alert/reload
      if (data.success && data.ubicaciones && data.ubicaciones.length > 0 && tgId) {
        const idUbicacion = data.ubicaciones[0].id_ubicacion
        console.log("🔄 Notificando al bot con id_ubicacion:", idUbicacion)

        try {
          // 1. Activar modo formulario en el bot
          console.log("📤 Llamando set_pending_ubicacion...")
          const setPendingRes = await fetch("/api/notificar-bot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "set_pending_ubicacion",
              telegram_id: parseInt(tgId),
              id_ubicacion: idUbicacion
            }),
          })
          const setPendingData = await setPendingRes.json()
          console.log("📥 Respuesta set_pending_ubicacion:", setPendingData)

          if (setPendingData.ok) {
            console.log("✅ set_pending_ubicacion enviado al bot:", idUbicacion)
          } else {
            console.warn("⚠️ Error en set_pending_ubicacion:", setPendingData)
          }

          // 2. Solicitar ubicación al usuario (envía mensaje de Telegram)
          console.log("📤 Llamando solicitar_ubicacion...")
          const solicitarRes = await fetch("/api/notificar-bot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "solicitar_ubicacion",
              telegram_id: parseInt(tgId)
            }),
          })
          const solicitarData = await solicitarRes.json()
          console.log("📥 Respuesta solicitar_ubicacion:", solicitarData)

          if (solicitarData.ok) {
            console.log("✅ solicitar_ubicacion enviado al bot")
          } else {
            console.warn("⚠️ Error en solicitar_ubicacion:", solicitarData)
          }

        } catch (error) {
          console.error("❌ Error notificando al bot:", error)
          // NO hacer fail el formulario por esto
        }
      } else {
        console.warn("⚠️ No se pudo notificar al bot:", {
          success: data.success,
          ubicaciones: data.ubicaciones,
          tgId
        })
      }

      // DESPUÉS de notificar al bot, mostrar mensaje y recargar
      alert(
        `✅ Gastos guardados para ${empleado}. Filas: ${data.inserted}.\n\n` +
        `📍 Ahora envía tu ubicación GPS desde Telegram dentro de los próximos 10 minutos.`
      )
      // Recargar la página para resetear todo el formulario
      window.location.reload()
    } catch (err: any) {
      console.error("❌ Error de red:", err?.message)
      alert("No fue posible enviar el formulario")
      setEnviando(false) // Solo resetear si hay error para permitir reintentar
    }
  }
  

  // Pantalla de carga mientras se valida el usuario
  if (validandoUsuario) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-100 to-slate-200 p-4 sm:p-6 flex items-center justify-center">
        <Card className="shadow-xl border-slate-300 bg-white rounded-2xl max-w-md w-full">
          <CardContent className="p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto mb-4"></div>
            <p className="text-slate-700 font-medium">Validando acceso...</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Pantalla de acceso restringido si el usuario no está registrado
  if (usuarioRegistrado === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-red-50 to-slate-200 p-4 sm:p-6 flex items-center justify-center">
        <div className="mx-auto w-full max-w-md">
          <Card className="shadow-xl border-red-300 bg-white rounded-2xl overflow-hidden">
            <CardHeader className="p-6 bg-gradient-to-r from-red-600 to-red-700 text-white">
              <div className="flex items-center justify-center gap-3">
                <span className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                  <ShieldX className="h-8 w-8 text-white" />
                </span>
              </div>
              <h1 className="text-xl font-bold text-center mt-4">Acceso Restringido</h1>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="text-center space-y-3">
                <p className="text-slate-700">
                  Tu cuenta de Telegram <strong>no está registrada</strong> en el sistema.
                </p>
                <p className="text-sm text-slate-500">
                  Para acceder al formulario de gastos operativos, debes estar registrado como usuario autorizado.
                </p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-amber-800">
                  <strong>¿Necesitas acceso?</strong><br />
                  Contacta al administrador del sistema para solicitar tu registro.
                </p>
              </div>
            </CardContent>
          </Card>
          {/* Logo */}
          <div className="mt-6 text-center">
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/viacotur%203-mVFPljekRdowkIldkuouvv2DVHM3C6.png"
              alt="VIACOTUR S.A"
              className="h-10 mx-auto opacity-50"
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-100 to-slate-200 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-screen-md sm:max-w-5xl">
        {/* Encabezado */}
        <div className="mb-6 sm:mb-10 text-center">
          <div className="bg-gradient-to-r from-blue-700 to-indigo-800 p-5 sm:p-8 rounded-2xl shadow-xl mb-6 sm:mb-8">
            <img
              src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/viacotur%203-mVFPljekRdowkIldkuouvv2DVHM3C6.png"
              alt="VIACOTUR S.A - Transporte Especial y de Carga"
              className="h-12 sm:h-20 mx-auto filter brightness-0 invert"
            />
            <h1 className="mt-4 text-xl sm:text-2xl font-bold text-white">Formulario de Gastos Operativos</h1>
          </div>
        </div>

        {/* Título + total */}
        <Card className="shadow-xl border-slate-300 bg-slate-50/90 backdrop-blur-sm rounded-2xl">
          <CardHeader className="p-4 sm:p-6 bg-gradient-to-r from-blue-700 to-indigo-800 text-white rounded-t-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-4">
                <span className="p-2 sm:p-3 bg-white/20 rounded-2xl backdrop-blur-sm">
                  <Calculator className="h-6 w-6 sm:h-7 sm:w-7 text-white" />
                </span>
                <div>
                  <p className="text-xl sm:text-2xl font-bold">Gastos Operativos</p>
                  <p className="text-blue-100 mt-1 text-sm sm:text-lg">Gestión de gastos empresariales</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-blue-100 text-xs sm:text-sm font-medium">Total General</p>
                <p className="font-bold leading-none text-2xl sm:text-4xl break-words">
                  {formatCOP(totalGeneralNum)}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8 mt-6 sm:mt-8">
          {/* Conductor */}
          <Card className="shadow-xl border-slate-300 bg-white rounded-2xl">
            <CardContent className="p-4 sm:p-6 grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-900">Conductor</Label>
                <Input
                  value={empleado}
                  readOnly
                  disabled
                  className="h-11 sm:h-12 bg-slate-100 cursor-not-allowed"
                  placeholder="Cargando conductor..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Información del Vehículo */}
          {cargandoVehiculo && (
            <Card className="shadow-xl border-blue-300 bg-blue-50 rounded-2xl">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <Car className="h-6 w-6 text-blue-600 animate-pulse" />
                  <p className="text-blue-700 font-medium">Cargando información del vehículo...</p>
                </div>
              </CardContent>
            </Card>
          )}

          {ubicacionVehiculo && !cargandoVehiculo && (
            <Card className="shadow-xl border-green-300 bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl">
              <CardHeader className="p-4 sm:p-6 bg-gradient-to-r from-green-600 to-emerald-700 text-white rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                    <Car className="h-6 w-6 text-white" />
                  </span>
                  <div>
                    <p className="text-lg sm:text-xl font-bold">Vehículo Asignado</p>
                    <p className="text-green-100 text-xs sm:text-sm">Última ubicación registrada</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4 sm:p-6 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Placa</Label>
                    <p className="text-lg font-bold text-slate-900 bg-white px-3 py-2 rounded-lg border border-slate-200">
                      {ubicacionVehiculo.placa}
                    </p>
                  </div>
                  {ubicacionVehiculo.vehiculo_nombre && (
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold text-slate-600">Vehículo</Label>
                      <p className="text-sm font-medium text-slate-700 bg-white px-3 py-2 rounded-lg border border-slate-200">
                        {ubicacionVehiculo.vehiculo_nombre}
                      </p>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Coordenadas</Label>
                    <p className="text-sm font-mono text-slate-700 bg-white px-3 py-2 rounded-lg border border-slate-200">
                      {ubicacionVehiculo.lat?.toFixed(6)}, {ubicacionVehiculo.lon?.toFixed(6)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-600">Última actualización</Label>
                    <p className="text-sm text-slate-700 bg-white px-3 py-2 rounded-lg border border-slate-200">
                      {ubicacionVehiculo.timestamp
                        ? new Date(ubicacionVehiculo.timestamp).toLocaleString("es-CO", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })
                        : "N/A"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 p-3 bg-green-100 border border-green-300 rounded-lg">
                  <p className="text-xs text-green-800 flex items-center gap-2">
                    <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    La ubicación del vehículo se registrará automáticamente con este gasto
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {!ubicacionVehiculo && !cargandoVehiculo && (
            <Card className="shadow-xl border-amber-300 bg-amber-50 rounded-2xl">
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-6 w-6 text-amber-600" />
                  <p className="text-amber-700 font-medium text-sm">
                    No se encontró un vehículo asociado a tu usuario. El gasto se registrará sin ubicación del vehículo.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lista de gastos */}
          <div className="space-y-5 sm:space-y-6">
            {gastosOperativos.map((gasto, index) => (
              <GastoCard
                key={gasto.id}
                gasto={gasto}
                index={index}
                onEliminar={eliminarGasto}
                onActualizar={actualizarGasto}
              />
            ))}
          </div>

          {/* Botón agregar */}
          <div className="flex justify-center py-6 sm:py-8">
            <Button
              type="button"
              onClick={agregarGasto}
              variant="outline"
              className="flex items-center gap-3 px-6 py-4 sm:px-10 sm:py-6 text-base sm:text-xl font-semibold border-2 border-dashed border-blue-500 text-blue-700 hover:bg-blue-100 hover:border-blue-600 bg-slate-50/90 backdrop-blur-sm shadow-xl transition hover:scale-105 rounded-2xl"
            >
              <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
              <span>¿Gastos Operativos?</span>
            </Button>
          </div>

          {/* Acciones (sticky en móvil) */}
          <Card className="shadow-xl border-slate-300 bg-slate-50/90 backdrop-blur-sm rounded-2xl sticky bottom-2 sm:static">
            <CardContent className="p-4 sm:p-8">
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setGastosOperativos([])}
                  className="flex-1 h-12 sm:h-14 text-base sm:text-lg font-semibold bg-white/80 hover:bg-slate-100 border-slate-400 text-slate-700 hover:text-slate-800 rounded-xl"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={enviando}
                  className="flex-1 h-12 sm:h-14 text-base sm:text-lg font-semibold bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-800 hover:to-indigo-900 text-white shadow-xl hover:scale-[1.02] rounded-xl disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {enviando ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2 sm:mr-3"></div>
                      Enviando...
                    </>
                  ) : (
                    <>
                      <FileText className="h-5 w-5 mr-2 sm:mr-3" />
                      Enviar
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  )
}
