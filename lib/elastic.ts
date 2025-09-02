// lib/elastic.ts
import "server-only";
import { Client } from "@elastic/elasticsearch";

let es: Client | null = null;

export const ES_INDEX =
  process.env.ELASTICSEARCH_INDEX || "gastos_operativos";

function getClient(): Client {
  if (es) return es;

  // Fuentes de configuración admitidas
  const node =
    process.env.ELASTICSEARCH_URL ||
    process.env.ELASTIC_NODE || // alias común
    undefined;

  const cloudId = process.env.ELASTICSEARCH_CLOUD_ID;
  const apiKey = process.env.ELASTICSEARCH_API_KEY;
  const username =
    process.env.ELASTICSEARCH_USERNAME || process.env.ELASTIC_USERNAME;
  const password =
    process.env.ELASTICSEARCH_PASSWORD || process.env.ELASTIC_PASSWORD;

  if (!node && !cloudId) {
    // Lanzamos SOLO cuando realmente intentamos usar el cliente
    throw new Error(
      "Elastic no configurado: define ELASTICSEARCH_URL (o ELASTIC_NODE) o ELASTICSEARCH_CLOUD_ID"
    );
  }

  // Prioridad: node -> cloudId
  if (node) {
    es = new Client({
      node,
      auth: apiKey
        ? { apiKey }
        : username && password
        ? { username, password }
        : undefined,
      // Si ES tiene TLS self-signed y lo necesitas (no recomendado):
      // tls: { rejectUnauthorized: false },
      // Para compat con clusters v8 si usas cliente v9:
      // headers: {
      //   accept:
      //     "application/vnd.elasticsearch+json; compatible-with=8",
      //   "content-type":
      //     "application/vnd.elasticsearch+json; compatible-with=8",
      // },
    });
  } else {
    es = new Client({
      cloud: { id: cloudId! },
      auth: apiKey
        ? { apiKey }
        : username && password
        ? { username, password }
        : undefined,
    });
  }

  return es!;
}

export async function ensureIndex() {
  try {
    const client = getClient();
    const exists = await client.indices.exists({ index: ES_INDEX });
    // en v8 devuelve boolean directamente; en dudas, convierte:
    const ok = typeof exists === "boolean" ? exists : (exists as any);

    if (!ok) {
      await client.indices.create({
        index: ES_INDEX,
        mappings: {
          properties: {
            empleado: { type: "keyword" },
            telegram_id: { type: "long" },
            tipo: { type: "keyword" },
            tipo_combustible: { type: "keyword" },
            km_final: { type: "float" },
            tanqueo_operacional: { type: "boolean" },
            galones_tanqueados: { type: "float" },
            valor_total_combustible: { type: "float" },
            valor_total: { type: "float" },
            location: { type: "geo_point" },
            location_ts: { type: "date" },
            created_at: { type: "date" },
            id_pg: { type: "long" },
          },
        },
      });
      console.info(`✅ Índice ${ES_INDEX} creado`);
    }
  } catch (e) {
    // No rompas el build si falla; registra y deja que el handler responda
    console.warn("⚠️ No se pudo asegurar el índice en ES:", e);
  }
}

/** Reindexa (o sobreescribe) documentos por _id = id_pg */
export async function bulkIndex(docs: any[]) {
  if (!docs?.length) return { indexed: 0, errors: [] as any[] };
  const client = getClient();

  const body = docs.flatMap((d: any) => [
    { index: { _index: ES_INDEX, _id: String(d.id_pg) } },
    d,
  ]);

  const res = await client.bulk({ refresh: "wait_for", body });

  const items = (res as any).items ?? [];
  const errors =
    items
      .map((it: any) => it.index?.error || it.create?.error || it.update?.error)
      .filter(Boolean) || [];

  return { indexed: docs.length - errors.length, errors };
}
