import handler from "../../../netlify/functions/items.mjs";
import { toPagesFunction } from "../../../netlify/functions/lib/pagesAdapter.mjs";

export const onRequest = toPagesFunction(handler);
