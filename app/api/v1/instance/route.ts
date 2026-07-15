import { NextRequest } from "next/server";
import { getCloudflareContext, json } from "@/lib/cf";
import { getActorById } from "@/lib/db";
import { actorIRI } from "@/lib/activitypub/utils";

export async function GET(request: NextRequest) {
  const { env } = getCloudflareContext();
  const { results: actorCount } = await env.DB.prepare("SELECT COUNT(*) as count FROM actors WHERE is_local = 1").first() as any;
  const { results: torrentCount } = await env.DB.prepare("SELECT COUNT(*) as count FROM torrents").first() as any;

  return json({
    uri: env.INSTANCE_URL,
    title: env.INSTANCE_TITLE,
    version: env.INSTANCE_VERSION,
    short_description: env.INSTANCE_DESCRIPTION,
    description: env.INSTANCE_DESCRIPTION,
    email: env.EMAIL_FROM || "",
    urls: { streaming_api: "" },
    stats: { user_count: actorCount?.count || 0, status_count: torrentCount?.count || 0, domain_count: 1 },
    thumbnail: "",
    languages: ["en", "es"],
    registrations: true,
    approval_required: false,
    invites_enabled: false,
    configuration: {
      accounts: { max_featured_tags: 10, max_pinned_statuses: 1 },
      statuses: { max_characters: 500, max_media_attachments: 0, characters_reserved_per_url: 23 },
      media_attachments: { supported_mime_types: [], image_size_limit: 0, image_matrix_limit: 0, video_size_limit: 0, video_frame_rate_limit: 0, video_matrix_limit: 0 },
      polls: { max_options: 0, max_characters_per_option: 0, min_expiration: 0, max_expiration: 0 },
    },
    contact_account: null,
    rules: [
      { id: "1", text: "Respect others. No harassment, hate speech, or bullying." },
      { id: "2", text: "Only share legal content. No copyrighted material without permission." },
      { id: "3", text: "No spam or malicious torrents. Files must be what they claim to be." },
    ],
  });
}
