#!/usr/bin/env node
import { runCli } from "./cli/program";

runCli().catch((error) => {
  console.error(error);
  process.exit(1);
});
