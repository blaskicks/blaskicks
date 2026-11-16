// API de productos de Blaskicks (Vercel KV / Upstash Redis)
// GET  /api/products  -> público: devuelve los cambios hechos desde el panel
// POST /api/products  -> solo admin: agrega, edita, marca agotado o elimina productos
//
// Requiere en Vercel (Settings -> Environment Variables):
//   ADMIN_USER      -> usuario del panel
//   ADMIN_PASSWORD  -> contraseña del panel
// y la misma base de datos KV que ya usan las reseñas.

const STATE_KEY = "blaskicks_products_state";

function emptyState() {
  return { custom: [], overrides: {}, soldOut: [], available: [], deleted: [] };
}

function normalizeState(s) {
  s = s || {};
  return {
    custom: Array.isArray(s.custom) ? s.custom : [],
    overrides: s.overrides && typeof s.overrides === "object" && !Array.isArray(s.overrides) ? s.overrides : {},
    soldOut: Array.isArray(s.soldOut) ? s.soldOut : [],
    available: Array.isArray(s.available) ? s.available : [],
    deleted: Array.isArray(s.deleted) ? s.deleted : []
  };
}

async function readState(KV_URL, KV_TOKEN) {
  const kvRes = await fetch(`${KV_URL}/get/${STATE_KEY}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` }
  });
  const data = await kvRes.json();
  if (!data.result) return emptyState();
  const parsed = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
  return normalizeState(parsed);
}

async function writeState(KV_URL, KV_TOKEN, state) {
  const kvRes = await fetch(`${KV_URL}/set/${STATE_KEY}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(state)
  });
  if (!kvRes.ok) throw new Error("No se pudo guardar en la base de datos");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const KV_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (req.method === "GET") {
    try {
      if (KV_URL && KV_TOKEN) {
        return res.status(200).json(await readState(KV_URL, KV_TOKEN));
      }
      return res.status(200).json(emptyState());
    } catch (e) {
      console.error("Error en GET /api/products:", e);
      return res.status(200).json(emptyState());
    }
  }

  if (req.method === "POST") {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (_) { body = {}; }
      }
      body = body || {};

      // 1. Verificar credenciales de administrador (guardadas en Vercel, no en la página)
      const ADMIN_USER = process.env.ADMIN_USER;
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
      if (!ADMIN_USER || !ADMIN_PASSWORD) {
        return res.status(500).json({ error: "Faltan ADMIN_USER / ADMIN_PASSWORD en las variables de entorno de Vercel" });
      }
      if (body.user !== ADMIN_USER || body.password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
      }

      if (!KV_URL || !KV_TOKEN) {
        return res.status(500).json({ error: "Sin base de datos configurada" });
      }

      const action = body.action;

      if (action === "login") {
        return res.status(200).json({ success: true, state: await readState(KV_URL, KV_TOKEN) });
      }

      const state = await readState(KV_URL, KV_TOKEN);
      const id = typeof body.id === "string" ? body.id : "";

      if (action === "add") {
        const product = body.product;
        if (!product || !product.id || !product.name) {
          return res.status(400).json({ error: "Producto inválido" });
        }
        // Evitar duplicados: si ya existe ese id, se reemplaza
        state.custom = state.custom.filter(p => p.id !== product.id);
        state.custom.unshift(product);
        state.deleted = state.deleted.filter(x => x !== product.id);
      } else if (action === "update") {
        const data = body.data;
        if (!id || !data || typeof data !== "object") {
          return res.status(400).json({ error: "Datos inválidos" });
        }
        const idx = state.custom.findIndex(p => p.id === id);
        if (idx !== -1) {
          state.custom[idx] = { ...state.custom[idx], ...data, id };
        } else {
          state.overrides[id] = { ...(state.overrides[id] || {}), ...data };
        }
      } else if (action === "setSoldOut") {
        if (!id) return res.status(400).json({ error: "Falta el id" });
        const soldOut = Boolean(body.soldOut);
        state.soldOut = state.soldOut.filter(x => x !== id);
        state.available = state.available.filter(x => x !== id);
        if (soldOut) state.soldOut.push(id);
        else state.available.push(id);
      } else if (action === "delete") {
        if (!id) return res.status(400).json({ error: "Falta el id" });
        state.custom = state.custom.filter(p => p.id !== id);
        state.soldOut = state.soldOut.filter(x => x !== id);
        state.available = state.available.filter(x => x !== id);
        delete state.overrides[id];
        if (!state.deleted.includes(id)) state.deleted.push(id);
      } else {
        return res.status(400).json({ error: "Acción no válida" });
      }

      await writeState(KV_URL, KV_TOKEN, state);
      return res.status(200).json({ success: true, state });
    } catch (e) {
      console.error("Error en POST /api/products:", e);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Método no permitido" });
}
