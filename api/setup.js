import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  // Create tables for fresh installs
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
      event_id TEXT NOT NULL DEFAULT 'mammoth',
      PRIMARY KEY (user_id, event_id, date_key)
    )
  `;

  // Migration: add event_id to fl_picks if it doesn't exist yet
  await sql`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'fl_picks' AND column_name = 'event_id'
      ) THEN
        ALTER TABLE fl_picks DROP CONSTRAINT IF EXISTS fl_picks_pkey;
        ALTER TABLE fl_picks ADD COLUMN event_id TEXT NOT NULL DEFAULT 'mammoth';
        ALTER TABLE fl_picks ADD PRIMARY KEY (user_id, event_id, date_key);
      END IF;
    END $$
  `;

  res.status(200).json({ ok: true });
}
