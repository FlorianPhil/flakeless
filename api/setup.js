import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  await sql`
    CREATE TABLE IF NOT EXISTS fl_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS fl_picks (
      user_id TEXT NOT NULL REFERENCES fl_users(id) ON DELETE CASCADE,
      date_key TEXT NOT NULL,
      PRIMARY KEY (user_id, date_key)
    )
  `;

  res.status(200).json({ ok: true });
}
