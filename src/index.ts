import { AtpAgent } from "@atproto/api";
import { db } from "./db/index.js";
import { users, type NewUser } from "./db/schema.js";

const agent = new AtpAgent({ service: "https://public.api.bsky.app" });

// ProfileViewDetailedからユーザーを保存
async function saveUser(profile: {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
  avatar?: string;
  followersCount?: number;
  followsCount?: number;
  postsCount?: number;
}) {
  const user: NewUser = {
    did: profile.did,
    handle: profile.handle,
    displayName: profile.displayName ?? null,
    description: profile.description ?? null,
    avatar: profile.avatar ?? null,
    followersCount: profile.followersCount ?? 0,
    followsCount: profile.followsCount ?? 0,
    postsCount: profile.postsCount ?? 0,
  };

  const [inserted] = await db
    .insert(users)
    .values(user)
    .onConflictDoUpdate({
      target: users.did,
      set: {
        handle: user.handle,
        displayName: user.displayName,
        description: user.description,
        avatar: user.avatar,
        followersCount: user.followersCount,
        followsCount: user.followsCount,
        postsCount: user.postsCount,
      },
    })
    .returning();

  console.log("保存しました:", inserted.handle);
  return inserted;
}

// AT Protocolからプロフィールを取得して保存
async function fetchAndSaveProfile(handleOrDid: string) {
  const { data } = await agent.getProfile({ actor: handleOrDid });
  return saveUser(data);
}

// すべてのユーザーを取得
async function getAllUsers() {
  const allUsers = await db.select().from(users);
  console.log("全ユーザー:", allUsers);
  return allUsers;
}

// 実行
async function main() {
  // 例: Blueskyからプロフィールを取得して保存
  await fetchAndSaveProfile("bsky.app");

  // 全ユーザーを取得
  await getAllUsers();

  process.exit(0);
}

main().catch(console.error);
