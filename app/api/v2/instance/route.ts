import { NextRequest } from "next/server";
import { getCloudflareContext, json } from "@/lib/cf";

export async function GET(request: NextRequest) {
  const { env } = getCloudflareContext();
  const actorCount = await env.DB.prepare("SELECT COUNT(*) as count FROM actors WHERE is_local = 1").first() as any;
  const torrentCount = await env.DB.prepare("SELECT COUNT(*) as count FROM torrents").first() as any;

  return json({
    domain: new URL(env.INSTANCE_URL).hostname,
    title: env.INSTANCE_TITLE,
    version: env.INSTANCE_VERSION,
    source_url: "https://github.com/manalejandro/cf-feditorrent",
    description: env.INSTANCE_DESCRIPTION,
    usage: { users: { active_monthly: actorCount?.count || 0 } },
    thumbnail: { url: "" },
    languages: ["en", "es"],
    configuration: {
      accounts: { max_featured_tags: 10 },
      statuses: { max_characters: 500, max_media_attachments: 0 },
      media_attachments: { supported_mime_types: ["application/x-bittorrent"], image_size_limit: 10485760, image_matrix_limit: 0, video_size_limit: 0, video_frame_rate_limit: 0, video_matrix_limit: 0 },
      polls: { max_options: 0, max_characters_per_option: 0, min_expiration: 0, max_expiration: 0 },
      translation: { enabled: false },
    },
    registrations: { enabled: true, approval_required: false, message: "" },
    contact: { email: env.EMAIL_FROM || "", account: null },
    rules: [
      { id: "1", text: "Respect others. No harassment, hate speech, or bullying." },
      { id: "2", text: "Only share legal content. No copyrighted material without permission." },
      { id: "3", text: "No spam or malicious torrents. Files must be what they claim to be." },
    ],
  });
}
