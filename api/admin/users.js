import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  const eventId = req.query.event || "mammoth";

  if (req.method === "GET") {
    const result = await sql`
      SELECT u.id, u.name, u.color, u.created_at, COUNT(p.date_key) AS pick_count
      FROM fl_users u
      INNER JOIN fl_picks p ON p.user_id = u.id AND p.event_id = ${eventId}
      GROUP BY u.id, u.name, u.color, u.created_at
      ORDER BY u.created_at DESC
    `;
    return res.status(200).json(result.rows);
  }

  if (req.method === "DELETE") {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "userId required" });
    // Delete only this event's picks; user record stays for other events
    await sql`DELETE FROM fl_picks WHERE user_id = ${userId} AND event_id = ${eventId}`;
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
