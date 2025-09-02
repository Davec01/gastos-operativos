// lib/elastic.ts
import 'server-only'

// (tu polyfill y cliente Client como ya lo tienes)
const { Client } = require('@elastic/elasticsearch')

const node = process.env.ELASTICSEARCH_URL!
const apiKey = process.env.ELASTICSEARCH_API_KEY!
export const ES_INDEX = process.env.ELASTICSEARCH_INDEX || 'gastos_operativos'

export const es = new Client({
  node,
  auth: { apiKey },
  // si usas cliente v9 con cluster v8, añade headers compat:
  // headers: {
  //   accept: 'application/vnd.elasticsearch+json; compatible-with=8',
  //   'content-type': 'application/vnd.elasticsearch+json; compatible-with=8',
  // },
})

export async function ensureIndex() {
  try {
    const exists = await es.indices.exists({ index: ES_INDEX })
    if (!exists) {
      await es.indices.create({
        index: ES_INDEX,
        mappings: {
          properties: {
            empleado: { type: 'keyword' },
            telegram_id: { type: 'long' },
            tipo: { type: 'keyword' },
            tipo_combustible: { type: 'keyword' },
            km_final: { type: 'float' },
            tanqueo_operacional: { type: 'boolean' },
            galones_tanqueados: { type: 'float' },
            valor_total_combustible: { type: 'float' },
            valor_total: { type: 'float' },
            location: { type: 'geo_point' }, // ← importante
            location_ts: { type: 'date' },
            created_at: { type: 'date' },
            id_pg: { type: 'long' },
          }
        }
      })
      console.info(`✅ Índice ${ES_INDEX} creado`)
    }
  } catch (e) {
    console.warn('⚠️ No se pudo asegurar el índice en ES:', e)
  }
}

/** Reindexa (o sobreescribe) documentos por _id = id_pg */
export async function bulkIndex(docs: any[]) {
  if (!docs?.length) return { indexed: 0, errors: [] as any[] }

  const body = docs.flatMap((d) => [
    { index: { _index: ES_INDEX, _id: String(d.id_pg) } },
    d,
  ])

  const res = await es.bulk({ refresh: 'true', body })
  let errors: any[] = []
  if (res.errors) {
    // @ts-ignore
    for (const it of res.items) {
      const op = it.index || it.create || it.update || it.delete
      if (op?.error) errors.push(op.error)
    }
  }
  return { indexed: docs.length - errors.length, errors }
}
