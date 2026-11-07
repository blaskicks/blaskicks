export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Detecta variables de Upstash Redis o Vercel KV
  const KV_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (req.method === "GET") {
    try {
      if (KV_URL && KV_TOKEN) {
        const kvRes = await fetch(`${KV_URL}/get/blaskicks_reviews`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const data = await kvRes.json();
        
        let reviews = [];
        if (data.result) {
          reviews = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
        }
        return res.status(200).json(reviews);
      }
      return res.status(200).json([]);
    } catch (e) {
      console.error("Error en GET /api/reviews:", e);
      return res.status(200).json([]);
    }
  }

  if (req.method === "POST") {
    try {
      // Soporte por si req.body llega como string o JSON
      let newReview = req.body;
      if (typeof newReview === "string") {
        try {
          newReview = JSON.parse(newReview);
        } catch (_) {}
      }

      const reviewerName = newReview?.name || newReview?.author;
      const comment = newReview?.comment;

      if (!newReview || !reviewerName || !comment) {
        return res.status(400).json({ error: "Faltan campos requeridos (nombre o comentario)" });
      }

      // Estandarizar objeto guardado
      const reviewToSave = {
        id: newReview.id || "rev-" + Date.now(),
        name: reviewerName,
        author: reviewerName,
        instagram: newReview.instagram || "",
        location: newReview.location || "Cliente Verificado",
        rating: Number(newReview.rating) || 5,
        comment: comment.trim(),
        createdAt: newReview.createdAt || Date.now()
      };

      if (KV_URL && KV_TOKEN) {
        // 1. Obtener lista actual
        const kvRes = await fetch(`${KV_URL}/get/blaskicks_reviews`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const data = await kvRes.json();

        let existing = [];
        if (data.result) {
          existing = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
        }

        // 2. Agregar la nueva opinión al principio evitando duplicados idénticos
        existing = existing.filter(r => !(r.comment === reviewToSave.comment && (r.author === reviewToSave.author || r.name === reviewToSave.name)));
        existing.unshift(reviewToSave);

        // 3. Guardar lista actualizada en KV
        await fetch(`${KV_URL}/set/blaskicks_reviews`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${KV_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(existing)
        });

        return res.status(200).json({ success: true, reviews: existing });
      }

      return res.status(200).json({ success: true, warning: "Sin base de datos configurada" });
    } catch (e) {
      console.error("Error en POST /api/reviews:", e);
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Método no permitido" });
}
