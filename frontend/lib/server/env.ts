import { DEFAULT_MONGODB_DB } from "@/lib/config";

export function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getMongoDbName(): string {
  return process.env.MONGODB_DB || DEFAULT_MONGODB_DB;
}
