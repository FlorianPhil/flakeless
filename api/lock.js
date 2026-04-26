import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { userId, name, color, dates } = req.body;

  if (!userId || !name || !color || !Array.isArray(dates)) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  await sql`
    INSERT INTO fl_users (id, name, color)
    VALUES (${userId}, ${name}, ${color})
    ON CONFLICT (id) DO UPDATE SET name = ${name}, color = ${color}
  `;

  await sql`DELETE FROM fl_picks WHERE user_id = ${userId}`;

  for (const dateKey of dates) {
    await sql`
      INSERT INTO fl_picks (user_id, date_key)
      VALUES (${userId}, ${dateKey})
      ON CONFLICT DO NOTHING
    `;
  }

  res.status(200).json({ ok: true });
}
