import { NextResponse } from 'next/server';

import pool from '@/lib/db';

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { severity, default_active } = body;

    const result = await pool.query(
      `UPDATE rules 
       SET severity = COALESCE($1, severity), 
           default_active = COALESCE($2, default_active) 
       WHERE id = $3 
       RETURNING *`,
      [severity, default_active, id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating rule:', error);
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
  }
}
