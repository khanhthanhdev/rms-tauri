import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { user } from "./auth";
import { event } from "./event";

export const userRole = sqliteTable(
  "user_role",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: [
        "ADMIN",
        "TSO",
        "HEAD_REFEREE",
        "REFEREE",
        "INSPECTOR",
        "LEAD_INSPECTOR",
        "JUDGE",
      ],
    }).notNull(),
    eventCode: text("event_code").references(() => event.code, {
      onDelete: "cascade",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("user_role_userId_idx").on(table.userId),
    index("user_role_eventCode_idx").on(table.eventCode),
    index("user_role_role_idx").on(table.role),
  ]
);

export const userRoleRelations = relations(userRole, ({ one }) => ({
  user: one(user, {
    fields: [userRole.userId],
    references: [user.id],
  }),
  event: one(event, {
    fields: [userRole.eventCode],
    references: [event.code],
  }),
}));
