import { NextResponse } from 'next/server';

import pool from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const engine = searchParams.get('engine');
  const type = searchParams.get('type');
  const severity = searchParams.get('severity');

  let query = 'SELECT * FROM rules WHERE 1=1';
  const values: unknown[] = [];
  
  if (engine) {
    values.push(engine);
    query += ` AND engine = $${values.length}`;
  }
  if (type) {
    values.push(type);
    query += ` AND type = $${values.length}`;
  }
  if (severity) {
    values.push(severity);
    query += ` AND severity = $${values.length}`;
  }
  
  query += ' ORDER BY created_at DESC';

  try {
    const result = await pool.query(query, values);
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching rules:', error);
    return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
  }
}
