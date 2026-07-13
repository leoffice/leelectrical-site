import handler from "../../../netlify/functions/iterate.mjs";
import { toPagesFunction } from "../../../netlify/functions/lib/pagesAdapter.mjs";

export const onRequest = toPagesFunction(handler);
