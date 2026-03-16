import { appConfig } from "./config";
import { buildApi } from "./app";

const app = await buildApi();

await app.listen({
  port: appConfig.PORT,
  host: appConfig.HOST,
});
