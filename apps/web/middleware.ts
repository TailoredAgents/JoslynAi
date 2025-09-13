import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const lang = request.nextUrl.searchParams.get('lang');
  if (lang) {
    const response = NextResponse.next();
    response.cookies.set('NEXT_LOCALE', lang, { path: '/' });
    return response;
  }
  return NextResponse.next();
}

