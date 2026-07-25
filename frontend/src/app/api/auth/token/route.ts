import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value ?? null;
    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ token: null });
  }
}