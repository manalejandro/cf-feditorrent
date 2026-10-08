import { NextRequest, NextResponse } from "next/server";

import { verifyEmailByToken } from "@/lib/db";
import { env } from "cloudflare:workers";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");

    if (!token) {
      return NextResponse.redirect(new URL("/?verified=false&reason=missing_token", request.url));
    }

    const actorId = await verifyEmailByToken(env.DB, token);
    if (actorId) {
      return NextResponse.redirect(new URL("/?verified=true", request.url));
    }

    return NextResponse.redirect(new URL("/?verified=false&reason=invalid_or_expired", request.url));
  } catch {
    return NextResponse.redirect(new URL("/?verified=false&reason=error", request.url));
  }
}
