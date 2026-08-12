import { NextResponse } from 'next/server';

import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT id, name, data, output, createdon, startedon, completedon
      FROM pgboss.job
      WHERE state = 'failed'
      ORDER BY completedon DESC
      LIMIT 50
    `);

    return NextResponse.json({ logs: result.rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
