import { MongoClient } from "mongodb";

import { getMongoDbName, getRequiredEnv } from "@/lib/server/env";

let clientPromise: Promise<MongoClient> | undefined;

export function getMongoClient(): Promise<MongoClient> {
  if (!clientPromise) {
    clientPromise = new MongoClient(getRequiredEnv("MONGODB_URI")).connect();
  }

  return clientPromise;
}

export async function getMongoDb() {
  const client = await getMongoClient();
  return client.db(getMongoDbName());
}
