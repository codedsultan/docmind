import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // dynamic import — route handlers run in Node.js, `next/headers` is available
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { cookies } = require('next/headers');
    const token = cookies().get('auth_token')?.value ?? null;
    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ token: null });
  }
}