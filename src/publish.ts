import { AtpAgent, BlobRef } from "@atproto/api";

const FEEDGEN_HOSTNAME = process.env.FEEDGEN_HOSTNAME;
const HANDLE = process.env.BLUESKY_HANDLE;
const PASSWORD = process.env.BLUESKY_PASSWORD;
const RECORD_NAME = process.env.FEED_RECORD_NAME || "discover-japan";

if (!FEEDGEN_HOSTNAME || !HANDLE || !PASSWORD) {
  console.error(
    "Required env vars: FEEDGEN_HOSTNAME, BLUESKY_HANDLE, BLUESKY_PASSWORD",
  );
  process.exit(1);
}

async function main() {
  const agent = new AtpAgent({ service: "https://bsky.social" });

  console.log(`Logging in as ${HANDLE}...`);
  await agent.login({ identifier: HANDLE!, password: PASSWORD! });

  const feedGenDid = `did:web:${FEEDGEN_HOSTNAME}`;

  const record = {
    repo: agent.session!.did,
    collection: "app.bsky.feed.generator",
    rkey: RECORD_NAME,
    record: {
      did: feedGenDid,
      displayName: "Pop Feed",
      description: "Popular posts on Bluesky",
      createdAt: new Date().toISOString(),
    },
  };

  console.log("Publishing feed generator...");
  console.log(`  Feed DID: ${feedGenDid}`);
  console.log(`  Record name: ${RECORD_NAME}`);

  try {
    const response = await agent.com.atproto.repo.putRecord(record);
    console.log("Published successfully!");
    console.log(`  URI: ${response.data.uri}`);
  } catch (err: any) {
    if (err.status === 400 && err.message?.includes("already exists")) {
      console.log("Feed already exists, updating...");
      const response = await agent.com.atproto.repo.putRecord(record);
      console.log("Updated successfully!");
      console.log(`  URI: ${response.data.uri}`);
    } else {
      throw err;
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
