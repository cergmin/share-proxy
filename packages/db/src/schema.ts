import { pgTable, text, timestamp, jsonb, boolean, integer, uuid } from 'drizzle-orm/pg-core';

export const user = pgTable("user", {
    id: text("id").primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('emailVerified').notNull(),
    image: text('image'),
    createdAt: timestamp('createdAt').notNull(),
    updatedAt: timestamp('updatedAt').notNull()
});

export const session = pgTable("session", {
    id: text("id").primaryKey(),
    expiresAt: timestamp('expiresAt').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('createdAt').notNull(),
    updatedAt: timestamp('updatedAt').notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' })
});

export const account = pgTable("account", {
    id: text("id").primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
    refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('createdAt').notNull(),
    updatedAt: timestamp('updatedAt').notNull()
});

export const verification = pgTable("verification", {
    id: text("id").primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expiresAt').notNull(),
    createdAt: timestamp('createdAt').notNull(),
    updatedAt: timestamp('updatedAt').notNull()
});

export const sources = pgTable('sources', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'jellyfin', 'gdrive', 's3'
    config: text('config').notNull(), // encrypted JSON string containing api keys, etc
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const resources = pgTable('resources', {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'cascade' }).notNull(),
    externalId: text('external_id').notNull(), // ID of the file/folder in the source system
    type: text('type').notNull(), // 'file', 'folder', 'playlist', 'redirect'
    name: text('name').notNull(),
    metadata: jsonb('metadata'), // Extra info (duration, mimetype, size)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const links = pgTable('links', {
    id: uuid('id').defaultRandom().primaryKey(),
    resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'cascade' }).notNull(),
    active: boolean('active').default(true).notNull(),
    expiresAt: timestamp('expires_at'), // Optional, null means it never expires (unless active is false)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const aliases = pgTable('aliases', {
    id: uuid('id').defaultRandom().primaryKey(),
    linkId: uuid('link_id').references(() => links.id, { onDelete: 'cascade' }).notNull(),
    domain: text('domain'), // Optional domain override, e.g. 'cv.minakov.dev'
    slug: text('slug').notNull(), // e.g., 'resume' or 'v/123'
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const accessRules = pgTable('access_rules', {
    id: uuid('id').defaultRandom().primaryKey(),
    linkId: uuid('link_id').references(() => links.id, { onDelete: 'cascade' }).notNull(),
    type: text('type').notNull(), // e.g. 'password', 'domain-whitelist', 'email-whitelist'
    params: jsonb('params'), // e.g. { "hash": "..." } or { "emails": ["test@test.com"] }
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const analytics = pgTable('analytics', {
    id: uuid('id').defaultRandom().primaryKey(),
    linkId: uuid('link_id').references(() => links.id, { onDelete: 'cascade' }).notNull(),
    ip: text('ip'),
    country: text('country'),
    userAgent: text('user_agent'),
    referer: text('referer'),
    viewedAt: timestamp('viewed_at').defaultNow().notNull()
});
