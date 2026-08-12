import { NextResponse } from 'next/server';

import pool from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');

    const result = await pool.query(`
      SELECT id, repo_url, commit_sha, status, findings, created_at, completed_at
      FROM security_scans
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    return NextResponse.json({ scans: result.rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
