export const AS_CONTEXT = "https://www.w3.org/ns/activitystreams";
export const SECURITY_CONTEXT = "https://w3id.org/security/v1";
export const PUBLIC_ADDRESS = "https://www.w3.org/ns/activitystreams#Public";

export const DEFAULT_CONTEXT = [
  AS_CONTEXT,
  SECURITY_CONTEXT,
  {
    manuallyApprovesFollowers: "as:manuallyApprovesFollowers",
    toot: "http://joinmastodon.org/ns#",
    featured: { "@id": "toot:featured", "@type": "@id" },
    featuredTags: { "@id": "toot:featuredTags", "@type": "@id" },
    schema: "http://schema.org#",
    PropertyValue: "schema:PropertyValue",
    value: "schema:value",
    discoverable: "toot:discoverable",
    indexable: "toot:indexable",
    Hashtag: "as:Hashtag",
    Torrent: "https://feditorrent.com/ns#Torrent",
    torrentInfoHash: { "@id": "https://feditorrent.com/ns#torrentInfoHash", "@type": "xsd:string" },
    torrentMagnetUri: { "@id": "https://feditorrent.com/ns#torrentMagnetUri", "@type": "xsd:string" },
    torrentSize: { "@id": "https://feditorrent.com/ns#torrentSize", "@type": "xsd:integer" },
    torrentFileCount: { "@id": "https://feditorrent.com/ns#torrentFileCount", "@type": "xsd:integer" },
  },
] as never[];
