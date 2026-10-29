import { NextResponse, type NextRequest } from "next/server";

// Filtre rapide : sans cookie de session → /login. La validité réelle est vérifiée côté serveur (requireUser).
export function middleware(req: NextRequest) {
  if (!req.cookies.has("vamos_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next|brand|favicon.ico).*)"],
};
