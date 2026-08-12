import { NextResponse } from 'next/server';

import pool from '@/lib/db';
import redis from '@/lib/redis';

export async function GET() {
  try {
    const activeScansResult = await pool.query("SELECT COUNT(*) FROM security_scans WHERE status = 'running'");
    const activeScans = parseInt(activeScansResult.rows[0].count);

    const completedScansResult = await pool.query("SELECT COUNT(*) FROM security_scans WHERE status = 'completed'");
    const completedScans = parseInt(completedScansResult.rows[0].count);

    const failedJobsResult = await pool.query("SELECT COUNT(*) FROM pgboss.job WHERE state = 'failed'");
    const failedJobs = parseInt(failedJobsResult.rows[0].count);

    const redisStatus = await redis.ping();

    return NextResponse.json({
      activeScans,
      completedScans,
      failedJobs,
      redisStatus: redisStatus === 'PONG' ? 'healthy' : 'degraded',
      engines: ['semgrep', 'regex', 'sonarqube', 'codeql']
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
