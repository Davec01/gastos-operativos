"use client"

import React, { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2, FileText, Calculator, Utensils, Bed, Car, AlertCircle } from "lucide-react"

// ────────────────────────────────────────────────────────────────────────────────
// Tipos y constantes
// ────────────────────────────────────────────────────────────────────────────────

type TipoGasto = "alimentacion" | "hospedaje" | "peajes" | "otros"

interface GastoOperativo {
  id: string
  tipo: TipoGasto | ""
  valorTotal?: string
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
  actualizar: (campo: keyof GastoOperativo, valor: string | boolean) => void
}) {
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
            <Label className="text-sm font-semibold text-slate-900">Facturas {gasto.tipo}</Label>
            <Input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="h-11 sm:h-12 bg-slate-200 border-slate-400 rounded-xl file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-blue-700 file:text-white"
            />
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
  onActualizar: (id: string, campo: keyof GastoOperativo, valor: string | boolean) => void
}) {
  const actualizar = (campo: keyof GastoOperativo, valor: string | boolean) => onActualizar(gasto.id, campo, valor)

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

export function GastosOperativosForm() {
  const [gastosOperativos, setGastosOperativos] = useState<GastoOperativo[]>([])
  const [empleado, setEmpleado] = useState<string>("")

  // Autocompletar empleado usando PIN (telegram_id como PIN)
  useEffect(() => {
    const pin = getTelegramIdFallback()
    if (!pin) return
    ;(async () => {
      try {
        // Buscar empleado por PIN en la API externa
        const r = await fetch(`/api/usuario-por-pin?pin=${encodeURIComponent(pin)}`)
        const j = await r.json()
        const nombre = (j?.empleado || "").trim()
        if (nombre) {
          setEmpleado(nombre)
          console.log(`✅ Empleado encontrado por PIN: ${nombre}`)
        } else {
          console.warn(`⚠️ No se encontró empleado con PIN: ${pin}`)
        }
      } catch (e) {
        console.error("No se pudo autocompletar empleado:", e)
      }
    })()
  }, [])

  const agregarGasto = () => setGastosOperativos((prev) => [...prev, nuevoGasto()])
  const eliminarGasto = (id: string) => setGastosOperativos((prev) => prev.filter((g) => g.id !== id))
  const actualizarGasto = (id: string, campo: keyof GastoOperativo, valor: string | boolean) => {
    setGastosOperativos((prev) => prev.map((g) => (g.id === id ? { ...g, [campo]: valor } : g)))
  }

  const totalGeneralNum = useMemo(() => {
    return gastosOperativos.reduce((acc, g) => {
      return acc + parseMonto(g.valorTotal)
    }, 0)
  }, [gastosOperativos])

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()
    if (!empleado.trim()) {
      alert("No se detectó el empleado. Verifica Telegram o escribe tu nombre.")
      return
    }
  
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
      alert(`Gastos guardados para ${empleado}. Filas: ${data.inserted}. Ubicación: ${loc.fresh ? "reciente" : "no disponible"}`)
      setGastosOperativos([])
    } catch (err: any) {
      console.error("❌ Error de red:", err?.message)
      alert("No fue posible enviar el formulario")
    }
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
          {/* Empleado */}
          <Card className="shadow-xl border-slate-300 bg-white rounded-2xl">
            <CardContent className="p-4 sm:p-6 grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-semibold text-slate-900">Empleado</Label>
                <Input value={empleado} onChange={(e) => setEmpleado(e.target.value)} className="h-11 sm:h-12" />
              </div>
            </CardContent>
          </Card>

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
                  className="flex-1 h-12 sm:h-14 text-base sm:text-lg font-semibold bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-800 hover:to-indigo-900 text-white shadow-xl hover:scale-[1.02] rounded-xl"
                >
                  <FileText className="h-5 w-5 mr-2 sm:mr-3" />
                  Enviar
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      </div>
    </div>
  )
}
