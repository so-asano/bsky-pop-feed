import express from "express";
import { verifyJwt, parseReqNsid } from "@atproto/xrpc-server";
import { DidResolver } from "@atproto/identity";
import { AtpAgent } from "@atproto/api";
import { db } from "./db/index.js";
import { popularPosts } from "./db/schema.js";
import { desc, sql } from "drizzle-orm";
import { startJetstream } from "./jetstream.js";

const app = express();
const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.FEEDGEN_HOSTNAME || "localhost";
const FEED_URI = process.env.FEED_URI || `at://did:example/app.bsky.feed.generator/discover-japan`;
const SERVICE_DID = `did:web:${HOSTNAME}`;

const didResolver = new DidResolver({});
const agent = new AtpAgent({ service: "https://public.api.bsky.app" });

async function validateAuth(req: express.Request): Promise<string | null> {
  const { authorization = "" } = req.headers;
  if (!authorization.startsWith("Bearer ")) {
    return null;
  }
  try {
    const jwt = authorization.replace("Bearer ", "").trim();
    const nsid = parseReqNsid(req);
    const parsed = await verifyJwt(jwt, SERVICE_DID, nsid, async (did: string) => {
      return didResolver.resolveAtprotoKey(did);
    });
    return parsed.iss;
  } catch {
    return null;
  }
}

async function getUserLanguage(did: string): Promise<string> {
  try {
    const { data } = await agent.getAuthorFeed({ actor: did, limit: 1 });
    if (data.feed.length > 0) {
      const record = data.feed[0].post.record as { langs?: string[] };
      const langs = record.langs ?? [];
      if (langs[0] === "ja") {
        return "ja";
      }
    }
  } catch {
    // Ignore errors
  }
  return "en";
}

app.use(express.json());

// describeFeedGenerator
app.get("/xrpc/app.bsky.feed.describeFeedGenerator", (_req, res) => {
  res.json({
    did: SERVICE_DID,
    feeds: [
      {
        uri: FEED_URI,
      },
    ],
  });
});

// getFeedSkeleton
app.get("/xrpc/app.bsky.feed.getFeedSkeleton", async (req, res) => {
  try {
    const requesterDid = await validateAuth(req);
    const userLang = requesterDid ? await getUserLanguage(requesterDid) : "ja";
    console.log(`getFeedSkeleton requested by: ${requesterDid ?? "anonymous"}, lang: ${userLang}`);

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const cursor = req.query.cursor as string | undefined;
    const offset = cursor ? parseInt(cursor, 10) : 0;

    const langFilter = userLang === "ja"
      ? sql`${popularPosts.langs}::text LIKE '%"ja"%'`
      : sql`${popularPosts.langs}::text LIKE '%"en"%'`;

    const results = await db
      .select({ uri: popularPosts.uri })
      .from(popularPosts)
      .where(langFilter)
      .orderBy(
        desc(sql`${popularPosts.likeCount} + ${popularPosts.repostCount}`)
      )
      .limit(limit)
      .offset(offset);

    const feedItems = results.map((row) => ({ post: row.uri }));

    const newCursor =
      feedItems.length === limit ? String(offset + limit) : undefined;

    res.json({
      feed: feedItems,
      cursor: newCursor,
    });
  } catch (err) {
    console.error("getFeedSkeleton error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Well-known DID document for did:web
app.get("/.well-known/did.json", (_req, res) => {
  res.json({
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: SERVICE_DID,
    service: [
      {
        id: "#bsky_fg",
        type: "BskyFeedGenerator",
        serviceEndpoint: `https://${HOSTNAME}`,
      },
    ],
  });
});

app.listen(PORT, () => {
  console.log(`Feed generator server running on port ${PORT}`);
  console.log(`DID: ${SERVICE_DID}`);

  startJetstream().catch(console.error);
});
