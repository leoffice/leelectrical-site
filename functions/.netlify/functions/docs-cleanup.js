import handler from "../../../netlify/functions/docs-cleanup.mjs";
import { toPagesFunction } from "../../../netlify/functions/lib/pagesAdapter.mjs";

export const onRequest = toPagesFunction(handler);
