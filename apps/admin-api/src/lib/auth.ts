import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDb } from "@share-proxy/db";
import * as schema from "@share-proxy/db";

// Using dynamic initialization to await DB
export const initAuth = async () => {
    const db = await getDb();

    return betterAuth({
        database: drizzleAdapter(db, {
            provider: "pg",
            schema,
        }),
        emailAndPassword: {
            enabled: true,
        },
        secret: process.env.SECRET || "changeme",
        baseURL: process.env.ADMIN_API_ORIGIN || "http://localhost:3000",
        trustedOrigins: process.env.ADMIN_FRONTEND_ORIGIN ? [process.env.ADMIN_FRONTEND_ORIGIN] : ["http://localhost:5173"],
    });
};
