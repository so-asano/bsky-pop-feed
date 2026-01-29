import { db } from "./index.js";
import { posts, popularPosts } from "./schema.js";

async function reset() {
  console.log("Deleting all data...");

  await db.delete(posts);
  await db.delete(popularPosts);

  console.log("Done");
  process.exit(0);
}

reset().catch(console.error);
