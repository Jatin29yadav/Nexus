// SEC-10: check configuration once, at boot, and refuse to start when a
// secret is missing or weak. Messages name variables only, never values.
import { z } from "zod";

export const MIN_JWT_SECRET_LENGTH = 32;

// An unset variable and an empty one are the same thing: "not set".
const required = (name: string) =>
  z.string({ error: `${name} is not set` }).min(1, { error: `${name} is not set` });

// One message per problem: "not set" or "too short", never both.
const jwtSecret = z.string({ error: "JWT_SECRET is not set" }).superRefine((value, ctx) => {
  if (!value) {
    ctx.addIssue({ code: "custom", message: "JWT_SECRET is not set" });
  } else if (value.length < MIN_JWT_SECRET_LENGTH) {
    ctx.addIssue({
      code: "custom",
      message: `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters`,
    });
  }
});

const optional = z.string().optional();

export const envSchema = z
  .object({
    MONGO_URI: required("MONGO_URI"),
    JWT_SECRET: jwtSecret,
    NODE_ENV: optional,
    FRONTEND_URL: optional,
    CLIENT_URL: optional, // deprecated name of FRONTEND_URL
    PORT: optional,
    COOKIE_SAMESITE: optional,
    TRUST_PROXY: optional,
  })
  .refine((env) => env.NODE_ENV !== "production" || Boolean(env.FRONTEND_URL || env.CLIENT_URL), {
    error: "FRONTEND_URL is not set (required in production)",
    // Report this alongside missing secrets instead of only after they are fixed.
    when: () => true,
  });

/** The validated configuration `server.ts` starts with. */
export type Config = z.infer<typeof envSchema>;

type Env = Record<string, string | undefined>;

export function envProblems(env: Env = process.env): string[] {
  const result = envSchema.safeParse(env);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

export function validateEnv(env: Env = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => issue.message);
    throw new Error(`Invalid environment configuration: ${problems.join("; ")}.`);
  }
  return result.data;
}
