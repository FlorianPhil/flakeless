import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  res.setHeader("Cache-Control", "no-store");

  const [usersResult, picksResult] = await Promise.all([
    sql`SELECT id, name, color FROM fl_users`,
    sql`SELECT user_id, date_key FROM fl_picks`
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
