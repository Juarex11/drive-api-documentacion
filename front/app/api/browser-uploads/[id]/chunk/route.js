import { NextResponse } from 'next/server';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function PUT(request, { params }) {
  try {
    const contentRange = request.headers.get('content-range');
    const arrayBuffer = await request.arrayBuffer();

    const res = await fetch(`${BACKEND_URL}/api/browser-uploads/${params.id}/chunk`, {
      method: 'PUT',
      headers: { 'Content-Range': contentRange },
      body: Buffer.from(arrayBuffer),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }
}

export const runtime = 'nodejs';
export const maxDuration = 60;
