#!/usr/bin/env node
import { login, logout } from "./cli/commands";
import { types } from "./cli/types";
import { init } from "./cli/init";

const USAGE = `Usage: satsu-analytics <command>

Commands:
  init     Create a site and add Satsu to this project
  login    Sign in through your browser
  logout   Remove stored credentials
  types    Write satsu-events.d.ts from your goals (--site <id>)
  mcp      Run the MCP server for your coding agent (stdio)

Environment:
  SATSU_API_URL   Override the API base URL`;

const cmd = process.argv[2];
if (cmd === "init") {
  process.exitCode = (await init()) ? 0 : 1;
} else if (cmd === "login") {
  process.exitCode = (await login()) ? 0 : 1;
} else if (cmd === "logout") {
  await logout();
} else if (cmd === "types") {
  process.exitCode = (await types(process.argv.slice(3))) ? 0 : 1;
} else if (cmd === "mcp") {
  const { serveMcp } = await import("./mcp");
  await serveMcp();
} else {
  console.log(USAGE);
  process.exitCode = cmd && cmd !== "--help" && cmd !== "-h" ? 1 : 0;
}
