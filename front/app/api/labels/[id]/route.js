import { NextResponse } from 'next/server';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function PATCH(request, { params }) {
  const body = await request.json();
  const res = await fetch(`${BACKEND_URL}/api/labels/${params.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

export async function DELETE(request, { params }) {
  const res = await fetch(`${BACKEND_URL}/api/labels/${params.id}`, { method: 'DELETE' });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}