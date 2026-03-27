import { z } from "zod";

export const LocationEnum = z.enum(["A", "B", "C", "D", "E"]);
export const StatusEnum = z.enum(["成品", "半成品", "不良品", "原料", "埋入件"]);

export const ProductBaseSchema = z.object({
  code: z.string().trim().min(1).max(64),
  customerName: z.string().trim().min(1).max(128),
  productName: z.string().trim().min(1).max(128),
  quantity: z.number().int().min(0).max(1_000_000),
  location: LocationEnum,
  status: StatusEnum,
  note: z.string().max(2000).default(""),
});

export const ProductCreateSchema = ProductBaseSchema;
export const ProductUpdateSchema = ProductBaseSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  { message: "至少需要提供一個欄位以更新" }
);

export const ProductQuerySchema = z.object({
  q: z.string().trim().optional(),
  customerName: z.string().trim().optional(),
  status: StatusEnum.optional(),
  location: LocationEnum.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z
    .enum(["updatedAt_desc", "updatedAt_asc", "code_asc", "code_desc"])
    .default("updatedAt_desc"),
});

export type ProductCreateInput = z.infer<typeof ProductCreateSchema>;
export type ProductUpdateInput = z.infer<typeof ProductUpdateSchema>;
export type ProductQueryInput = z.infer<typeof ProductQuerySchema>;

