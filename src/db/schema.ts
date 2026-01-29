import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

export const posts = pgTable("posts", {
  uri: text("uri").primaryKey(),
  authorDid: text("author_did").notNull(),
  repostCount: integer("repost_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;

export const popularPosts = pgTable("popular_posts", {
  uri: text("uri").primaryKey(),
  authorDid: text("author_did").notNull(),
  text: text("text"),
  langs: text("langs"), // JSON array as string, e.g. '["ja","en"]'
  likeCount: integer("like_count").default(0).notNull(),
  repostCount: integer("repost_count").default(0).notNull(),
  replyCount: integer("reply_count").default(0).notNull(),
  postCreatedAt: timestamp("post_created_at"), // post's original createdAt
  indexedAt: timestamp("indexed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PopularPost = typeof popularPosts.$inferSelect;
export type NewPopularPost = typeof popularPosts.$inferInsert;

export const jetstreamState = pgTable("jetstream_state", {
  id: integer("id").primaryKey().default(1),
  cursor: text("cursor"),
  disconnectedAt: timestamp("disconnected_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type JetstreamState = typeof jetstreamState.$inferSelect;
