import { NextRequest } from "next/server";
import { getCloudflareContext, json } from "@/lib/cf";

export async function GET(request: NextRequest) {
  const { env } = getCloudflareContext();
  return json({
    links: [
      {
        rel: "http://nodeinfo.diaspora.software/ns/schema/2.0",
        href: `${env.INSTANCE_URL}/nodeinfo/2.0`,
      },
    ],
  });
}
