import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const result = await sql`
      SELECT u.id, u.name, u.color, u.created_at, COUNT(p.date_key) AS pick_count
      FROM fl_users u
      LEFT JOIN fl_picks p ON p.user_id = u.id
      GROUP BY u.id, u.name, u.color, u.created_at
      ORDER BY u.created_at DESC
    `;
    return res.status(200).json(result.rows);
  }

  if (req.method === "DELETE") {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    await sql`DELETE FROM fl_users WHERE id = ${userId}`;
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
