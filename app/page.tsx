import { Suspense } from "react"
// 👇 Alias para no chocar con la export especial
import NextDynamic from "next/dynamic"

// 👇 Export especial de Next (no la quites)
export const dynamic = "force-dynamic"

// Carga dinámica del form (si el componente usa useSearchParams o router hooks)
const GastosOperativosForm = NextDynamic(
  () => import("@/components/gastos-operativos-form").then(m => m.GastosOperativosForm),
  { ssr: false }
)

export default function Home() {
  return (
    <main className="min-h-screen">
      <Suspense fallback={<div>Cargando…</div>}>
        <GastosOperativosForm />
      </Suspense>
    </main>
  )
}
