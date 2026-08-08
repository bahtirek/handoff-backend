import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce
    .number()
    .default(3000),

  DATABASE_URL: z.string().min(1),

  REDIS_URL: z.string().min(1),

  LOG_LEVEL: z
    .string()
    .default("info"),

  PAIRING_SECRET_PEPPER: z.string().min(32),

  CLAIM_BASE_URL: z.string().url(),

  R2_ACCOUNT_ID: z.string().min(1),

  R2_ACCESS_KEY_ID: z.string().min(1),

  R2_SECRET_ACCESS_KEY: z.string().min(1),

  R2_BUCKET_NAME: z.string().min(1),

  R2_ENDPOINT: z.string().url()
});

export const env = schema.parse(process.env);