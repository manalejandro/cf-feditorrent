import { NextRequest } from "next/server";
import { json } from "@/lib/cf";
import { env } from "cloudflare:workers";

export async function GET(_request: NextRequest) {
  return json({
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
        href: `${env.INSTANCE_URL}/nodeinfo/2.0`,
      },
    ],
  });
}
