// Cloudflare Pages Function: forwards /api/* to the rooms Durable Object (hosted by the "game-night" Worker).
import { handleApi, type ApiEnv } from "../../src/worker/api";

export const onRequest: PagesFunction<ApiEnv> = ({ request, env }) => handleApi(request, env);
