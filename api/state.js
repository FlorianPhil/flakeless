import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  res.setHeader("Cache-Control", "no-store");

  const eventId = req.query.event || "mammoth";

  const [usersResult, picksResult] = await Promise.all([
    sql`
      SELECT DISTINCT u.id, u.name, u.color
      FROM fl_users u
      INNER JOIN fl_picks p ON p.user_id = u.id AND p.event_id = ${eventId}
    `,
    sql`SELECT user_id, date_key FROM fl_picks WHERE event_id = ${eventId}`
  ]);

  const users = {};
  for (const row of usersResult.rows) {
    users[row.id] = { name: row.name, color: row.color };
  }

  const picks = {};
  for (const row of picksResult.rows) {
    if (!picks[row.date_key]) picks[row.date_key] = [];
    picks[row.date_key].push(row.user_id);
  }

  res.status(200).json({ users, picks });
}
