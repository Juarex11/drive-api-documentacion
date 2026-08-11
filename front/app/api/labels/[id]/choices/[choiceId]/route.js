import { NextResponse } from 'next/server';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

export async function DELETE(request, { params }) {
  const { searchParams } = new URL(request.url);
  const fieldId = searchParams.get('fieldId') || '';
  const res = await fetch(`${BACKEND_URL}/api/labels/${params.id}/choices/${params.choiceId}?fieldId=${encodeURIComponent(fieldId)}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}