import { NextResponse, type NextRequest } from "next/server";

// Filtre rapide : sans cookie de session → /login. La validité réelle est vérifiée côté serveur (requireUser).
export function proxy(req: NextRequest) {
  if (!req.cookies.has("vamos_session") && !req.nextUrl.pathname.startsWith("/api/health")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // Chemin courant transmis aux composants serveur (redirection vers le changement de mot de passe obligatoire)
  const h = new Headers(req.headers);
  h.set("x-pathname", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: h } });
}

export const config = {
  matcher: ["/((?!login$|login/|_next/|brand/|favicon.ico).*)"],
};
