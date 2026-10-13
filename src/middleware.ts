import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/portal") && !request.cookies.get("gdbs_client")) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (pathname.startsWith("/internal") && pathname !== "/internal/sign-in" && !request.cookies.get("gdbs_staff")) {
    return NextResponse.redirect(new URL("/internal/sign-in", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/internal/:path*"],
};
