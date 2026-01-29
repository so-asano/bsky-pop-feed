import express from "express";
import { db } from "./db/index.js";
import { popularPosts } from "./db/schema.js";
import { desc, sql } from "drizzle-orm";
import { startJetstream } from "./jetstream.js";

const app = express();
const PORT = process.env.PORT || 3000;
const HOSTNAME = process.env.FEEDGEN_HOSTNAME || "localhost";
const FEED_URI = process.env.FEED_URI || `at://did:example/app.bsky.feed.generator/discover-japan`;

app.use(express.json());

// describeFeedGenerator
app.get("/xrpc/app.bsky.feed.describeFeedGenerator", (_req, res) => {
  res.json({
    did: `did:web:${HOSTNAME}`,
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
    const feed = req.query.feed as string;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const cursor = req.query.cursor as string | undefined;

    // Parse cursor (offset-based)
    const offset = cursor ? parseInt(cursor, 10) : 0;

    // Get popular posts with Japanese language, ordered by engagement
    const results = await db
      .select({ uri: popularPosts.uri })
      .from(popularPosts)
      .where(sql`${popularPosts.langs}::text LIKE '%"ja"%'`)
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
  const serviceDid = `did:web:${HOSTNAME}`;
  res.json({
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: serviceDid,
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
  console.log(`DID: did:web:${HOSTNAME}`);

  // Start Jetstream worker
  startJetstream().catch(console.error);
});
