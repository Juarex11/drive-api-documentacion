import { NextResponse } from 'next/server';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function POST(request, { params }) {
  const res = await fetch(`${BACKEND_URL}/api/uploads/${params.id}/pause`, { method: 'POST' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
