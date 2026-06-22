import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { getDb } from "./db";
import { products } from "../drizzle/schema";
import { desc, like, eq, and, sql } from "drizzle-orm";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  products: router({
    list: publicProcedure
      .input(z.object({
        type: z.string().optional(),
        search: z.string().optional(),
        culturalVariant: z.string().optional(),
        ageRange: z.string().optional(),
      }).optional())
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];

        const conditions = [];
        if (input?.type) {
          conditions.push(eq(products.type, input.type));
        }
        if (input?.search) {
          conditions.push(like(products.title, `%${input.search}%`));
        }
        if (input?.culturalVariant) {
          conditions.push(eq(products.culturalVariant, input.culturalVariant));
        }
        if (input?.ageRange) {
          conditions.push(eq(products.ageRange, input.ageRange));
        }

        const where = conditions.length > 0 ? and(...conditions) : undefined;
        const result = await db
          .select()
          .from(products)
          .where(where)
          .orderBy(desc(products.createdAt))
          .limit(100);

        return result;
      }),

    create: publicProcedure
      .input(z.object({
        title: z.string(),
        type: z.string(),
        thumbnailUrl: z.string().nullable().optional(),
        pdfUrl: z.string(),
        pdfKey: z.string().nullable().optional(),
        culturalVariant: z.string().nullable().optional(),
        ageRange: z.string().nullable().optional(),
        theme: z.string().nullable().optional(),
        pageCount: z.number().nullable().optional(),
        options: z.any().optional(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        await db.insert(products).values({
          title: input.title,
          type: input.type,
          thumbnailUrl: input.thumbnailUrl || null,
          pdfUrl: input.pdfUrl,
          pdfKey: input.pdfKey || null,
          culturalVariant: input.culturalVariant || null,
          ageRange: input.ageRange || null,
          theme: input.theme || null,
          pageCount: input.pageCount || null,
          options: input.options || null,
          listingStatus: {},
        });

        return { success: true };
      }),

    updateListingStatus: publicProcedure
      .input(z.object({
        id: z.number(),
        platform: z.string(),
        status: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Get current product
        const [product] = await db.select().from(products).where(eq(products.id, input.id)).limit(1);
        if (!product) throw new Error("Product not found");

        const currentStatus = (product.listingStatus as Record<string, string>) || {};
        currentStatus[input.platform] = input.status;

        await db.update(products)
          .set({ listingStatus: currentStatus })
          .where(eq(products.id, input.id));

        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
