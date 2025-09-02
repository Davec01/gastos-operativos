// app/page.tsx  (Server Component, sin "use client")
import { Suspense } from "react";

// evita que Next intente prerenderizar estático
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main>
      <Suspense fallback={<div>Cargando…</div>}>
        <GastosFormClient />
      </Suspense>
    </main>
  );
}

// Importamos el componente cliente (usa hooks del router, etc.)
import GastosFormClient from "./GastosFormClient";
