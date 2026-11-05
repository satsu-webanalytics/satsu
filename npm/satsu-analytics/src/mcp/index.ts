import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server";

/** Serves the MCP over stdio until the client disconnects. Stdout is the protocol channel; never log to it. */
export async function serveMcp(): Promise<void> {
  await createServer().connect(new StdioServerTransport());
}
