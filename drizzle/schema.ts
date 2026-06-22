import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Product Library table - stores all generated products
 */
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 512 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  pdfUrl: text("pdfUrl").notNull(),
  pdfKey: varchar("pdfKey", { length: 512 }),
  culturalVariant: varchar("culturalVariant", { length: 128 }),
  ageRange: varchar("ageRange", { length: 32 }),
  theme: varchar("theme", { length: 128 }),
  pageCount: int("pageCount"),
  options: json("options"),
  listingStatus: json("listingStatus").$type<Record<string, string>>().default({}),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
