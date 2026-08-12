import { NextResponse } from 'next/server';

import pool from '@/lib/db';

export async function GET() {
  try {
    const result = await pool.query('SELECT engine, config, updated_at FROM tool_configurations ORDER BY engine ASC');
    const configurations = result.rows.reduce((acc, row) => {
      acc[row.engine] = {
        config: row.config,
        updated_at: row.updated_at
      };
      return acc;
    }, {} as Record<string, unknown>);
    
    return NextResponse.json(configurations);
  } catch (error) {
    console.error('Error fetching tool configurations:', error);
    return NextResponse.json({ error: 'Failed to fetch tool configurations' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { engine, config } = body;

    if (!engine || !config) {
      return NextResponse.json({ error: 'Missing engine or config' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO tool_configurations (engine, config, updated_at) 
       VALUES ($1, $2, NOW()) 
       ON CONFLICT (engine) 
       DO UPDATE SET config = EXCLUDED.config, updated_at = NOW() 
       RETURNING engine, config, updated_at`,
      [engine, config]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating tool configuration:', error);
    return NextResponse.json({ error: 'Failed to update tool configuration' }, { status: 500 });
  }
}
