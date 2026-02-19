import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const event = sqliteTable("event", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: integer("type").notNull().default(0),
  status: integer("status").notNull().default(0),
  finals: integer("finals").notNull().default(0),
  divisions: integer("divisions").notNull().default(0),
  start: integer("start", { mode: "timestamp_ms" }).notNull(),
  end: integer("end", { mode: "timestamp_ms" }).notNull(),
  region: text("region").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const eventLog = sqliteTable(
  "event_log",
  {
    id: text("id").primaryKey(),
    timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull(),
    type: text("type").notNull(),
    eventCode: text("event_code"),
    info: text("info"),
    extra: text("extra").default("[]"),
  },
  (table) => [
    index("event_log_event_code_idx").on(table.eventCode),
    index("event_log_type_idx").on(table.type),
  ]
);

export const eventRelations = relations(event, ({ many }) => ({
  logs: many(eventLog),
}));

export const eventLogRelations = relations(eventLog, ({ one }) => ({
  event: one(event, {
    fields: [eventLog.eventCode],
    references: [event.code],
  }),
}));
