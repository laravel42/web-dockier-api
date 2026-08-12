import { NextResponse } from 'next/server';

import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query('SELECT * FROM quality_gates ORDER BY name ASC');
    return NextResponse.json(result.rows);
  } catch (error) {
    console.error('Error fetching quality gates:', error);
    return NextResponse.json({ error: 'Failed to fetch quality gates' }, { status: 500 });
  }
}
