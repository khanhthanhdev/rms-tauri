// biome-ignore lint/performance/noNamespaceImport: Schema namespace needed for database config
import * as authModule from "./auth";
// biome-ignore lint/performance/noNamespaceImport: Schema namespace needed for database config
import * as configModule from "./config";
// biome-ignore lint/performance/noNamespaceImport: Schema namespace needed for database config
import * as eventModule from "./event";
// biome-ignore lint/performance/noNamespaceImport: Schema namespace needed for database config
import * as roleModule from "./role";

export const authSchema = authModule;

export const schema = {
  ...authModule,
  ...eventModule,
  ...roleModule,
  ...configModule,
};
