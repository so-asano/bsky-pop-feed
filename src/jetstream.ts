import { AtpAgent } from "@atproto/api";
import { db } from "./db/index.js";
import { posts, popularPosts, jetstreamState } from "./db/schema.js";
import { sql, desc, lt, notExists, eq } from "drizzle-orm";

const agent = new AtpAgent({ service: "https://public.api.bsky.app" });

const FETCH_INTERVAL = 60 * 1000; // 1 minute
const FETCH_BATCH_SIZE = 25;
const POST_TTL = 60 * 60 * 1000; // 1 hour
const RECONNECT_DELAY = 3000; // 3 seconds
const CURSOR_SAVE_INTERVAL = 10000; // 10 seconds

let lastCursor: string | undefined;
let cursorDirty = false;

async function loadCursor(): Promise<string | undefined> {
  const [state] = await db.select().from(jetstreamState).where(eq(jetstreamState.id, 1));
  return state?.cursor ?? undefined;
}

async function saveCursor(cursor: string) {
  await db
    .insert(jetstreamState)
    .values({ id: 1, cursor, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: jetstreamState.id,
      set: { cursor, updatedAt: new Date() },
    });
}

async function saveDisconnectedAt() {
  await db
    .insert(jetstreamState)
    .values({ id: 1, disconnectedAt: new Date(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: jetstreamState.id,
      set: { disconnectedAt: new Date(), updatedAt: new Date() },
    });
}

async function fetchPostDetails(uris: string[]): Promise<{ saved: number; ja: number }> {
  if (uris.length === 0) return { saved: 0, ja: 0 };

  let savedCount = 0;
  let jaCount = 0;

  try {
    const { data } = await agent.getPosts({ uris });

    for (const post of data.posts) {
      const record = post.record as { text?: string; langs?: string[]; createdAt?: string };
      const langs = record.langs ?? [];

      await db
        .insert(popularPosts)
        .values({
          uri: post.uri,
          authorDid: post.author.did,
          text: record.text ?? null,
          langs: JSON.stringify(langs),
          likeCount: post.likeCount ?? 0,
          repostCount: post.repostCount ?? 0,
          replyCount: post.replyCount ?? 0,
          postCreatedAt: record.createdAt ? new Date(record.createdAt) : null,
          indexedAt: post.indexedAt ? new Date(post.indexedAt) : null,
        })
        .onConflictDoUpdate({
          target: popularPosts.uri,
          set: {
            likeCount: post.likeCount ?? 0,
            repostCount: post.repostCount ?? 0,
            replyCount: post.replyCount ?? 0,
            updatedAt: new Date(),
          },
        });

      savedCount++;
      if (langs.includes("ja")) jaCount++;
    }
  } catch (err) {
    console.error(`FETCH ERROR |`, err);
  }

  return { saved: savedCount, ja: jaCount };
}

async function cleanupOldPosts() {
  const cutoff = new Date(Date.now() - POST_TTL);
  await db.delete(posts).where(lt(posts.createdAt, cutoff));
}

const MAX_FETCH_ITERATIONS = 10;

async function fetchTopPosts() {
  console.log(`[${new Date().toISOString()}] Fetching top posts...`);

  let totalSaved = 0;
  let totalJa = 0;
  let offset = 0;

  for (let i = 0; i < MAX_FETCH_ITERATIONS; i++) {
    const unfetched = await db
      .select()
      .from(posts)
      .where(
        notExists(
          db.select().from(popularPosts).where(sql`${popularPosts.uri} = ${posts.uri}`)
        )
      )
      .orderBy(desc(posts.repostCount))
      .limit(FETCH_BATCH_SIZE)
      .offset(offset);

    if (unfetched.length === 0) break;

    const uris = unfetched.map((p) => p.uri);
    const { saved, ja } = await fetchPostDetails(uris);
    totalSaved += saved;
    totalJa += ja;

    console.log(`  Batch ${i + 1}: saved ${saved}, ja ${ja}`);

    if (ja > 0) break;

    offset += FETCH_BATCH_SIZE;
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`  Done. Saved ${totalSaved} posts (${totalJa} ja).`);
}

function connect() {
  const url = new URL("wss://jetstream1.us-east.bsky.network/subscribe");
  url.searchParams.append("wantedCollections", "app.bsky.feed.repost");

  if (lastCursor) {
    url.searchParams.append("cursor", lastCursor);
    console.log(`Reconnecting with cursor: ${lastCursor}`);
  } else {
    console.log("Connecting to Jetstream...");
  }

  const ws = new WebSocket(url.toString());

  ws.onopen = () => {
    console.log("Connected.\n");
  };

  ws.onmessage = async (event) => {
    try {
      const data = JSON.parse(event.data as string);

      if (data.time_us) {
        lastCursor = data.time_us.toString();
        cursorDirty = true;
      }

      if (data.kind !== "commit") return;

      const commit = data.commit;
      const collection = commit.collection;
      const operation = commit.operation;

      if (collection !== "app.bsky.feed.repost") return;
      if (operation === "delete") return;

      const subjectUri = commit.record?.subject?.uri;
      if (!subjectUri) return;
      if (!subjectUri.includes("/app.bsky.feed.post/")) return;

      const match = subjectUri.match(/^at:\/\/(did:[^/]+)\//);
      if (!match) return;
      const authorDid = match[1];

      await db
        .insert(posts)
        .values({
          uri: subjectUri,
          authorDid,
          repostCount: 1,
        })
        .onConflictDoUpdate({
          target: posts.uri,
          set: {
            repostCount: sql`${posts.repostCount} + 1`,
            updatedAt: new Date(),
          },
        });
    } catch {
      // Ignore errors
    }
  };

  ws.onerror = (error) => {
    console.error("WebSocket error:", error);
  };

  ws.onclose = async () => {
    console.log(`Connection closed. Reconnecting in ${RECONNECT_DELAY / 1000}s...`);
    await saveDisconnectedAt();
    setTimeout(connect, RECONNECT_DELAY);
  };

  return ws;
}

export async function startJetstream() {
  lastCursor = await loadCursor();
  if (lastCursor) {
    console.log(`Loaded cursor from DB: ${lastCursor}`);
  }

  const ws = connect();

  setInterval(async () => {
    if (cursorDirty && lastCursor) {
      await saveCursor(lastCursor);
      cursorDirty = false;
    }
  }, CURSOR_SAVE_INTERVAL);

  setInterval(async () => {
    await cleanupOldPosts();
    await fetchTopPosts();
  }, FETCH_INTERVAL);

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    if (lastCursor) {
      await saveCursor(lastCursor);
      console.log(`Saved cursor: ${lastCursor}`);
    }
    ws.close();
    process.exit(0);
  });
}

// Run standalone if executed directly
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startJetstream().catch(console.error);
}
