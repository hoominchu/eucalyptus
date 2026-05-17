import { Worker } from "@notionhq/workers";

import { registerHealthImportTool } from "./worker/registerHealthImportTool.ts";
import { registerLumaMailTool } from "./worker/registerLumaMailTool.ts";

const worker = new Worker();

// ntn v0.14.0 local execution calls mod.default.default.run(...).
// Keep the exported value itself as the Worker for hosted deploy discovery.
(worker as Worker & { default?: Worker }).default = worker;
export default worker;

registerLumaMailTool(worker);
registerHealthImportTool(worker);
