import handler from "../../../netlify/functions/sas-inbound.mjs";
import { toPagesFunction } from "../../../netlify/functions/lib/pagesAdapter.mjs";

export const onRequest = toPagesFunction(handler);
