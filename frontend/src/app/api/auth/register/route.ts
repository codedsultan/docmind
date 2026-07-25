import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.API_BASE_URL_SERVER ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4500/api';

export async function POST(request: NextRequest) {
  const body = await request.json();

  const res = await fetch(`${BACKEND_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`Register proxy error: ${res.status} — ${errorBody}`);
    return NextResponse.json(
      { error: 'Registration failed. Please try again later.' },
      { status: res.status },
    );
  }

  const { token } = (await res.json()) as { token: string };

  const response = NextResponse.json({ success: true }, { status: 201 });
  response.cookies.set('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 1 day (matches JWT expiry)
  });

  return response;
}
