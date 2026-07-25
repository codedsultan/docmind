import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const BACKEND_URL =
  process.env.API_BASE_URL_SERVER ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:4500/api';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  // Invalidate the JWT on the backend
  if (token) {
    try {
      const res = await fetch(`${BACKEND_URL}/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        console.error(
          `Backend logout failed: ${res.status} — ${await res.text()}`,
        );
      }
    } catch (err) {
      console.error('Backend logout error:', err);
    }
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}