import handler from "../../../netlify/functions/chat.mjs";
import { toPagesFunction } from "../../../netlify/functions/lib/pagesAdapter.mjs";

export const onRequest = toPagesFunction(handler);
