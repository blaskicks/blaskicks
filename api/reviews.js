export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (req.method === "GET") {
    try {
      if (KV_URL && KV_TOKEN) {
        const kvRes = await fetch(`${KV_URL}/get/blaskicks_reviews`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const data = await kvRes.json();
        const reviews = data.result ? JSON.parse(data.result) : [];
        return res.status(200).json(reviews);
      }
      return res.status(200).json([]);
    } catch (e) {
      return res.status(200).json([]);
    }
  }

  if (req.method === "POST") {
    try {
      const newReview = req.body;
      if (!newReview || !newReview.name || !newReview.comment) {
        return res.status(400).json({ error: "Faltan campos requeridos" });
      }

      if (KV_URL && KV_TOKEN) {
        const kvRes = await fetch(`${KV_URL}/get/blaskicks_reviews`, {
          headers: { Authorization: `Bearer ${KV_TOKEN}` }
        });
        const data = await kvRes.json();
        let existing = data.result ? JSON.parse(data.result) : [];

        existing.unshift(newReview);

        await fetch(`${KV_URL}/set/blaskicks_reviews`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${KV_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(JSON.stringify(existing))
        });

        return res.status(200).json({ success: true, reviews: existing });
      }

      return res.status(200).json({ success: true, warning: "Sin KV configurado" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: "Método no permitido" });
}
