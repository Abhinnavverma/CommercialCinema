#!/usr/bin/env bun

import { spawn, type Subprocess } from "bun";

export type StackScript = {
  label: string;
  script: string;
  port?: string;
};

export type SupervisorOptions = {
  root: string;
  scripts: StackScript[];
  introLines?: string[];
};

export function startStack(options: SupervisorOptions): {
  children: Subprocess[];
  shutdown: () => void;
  waitForever: () => Promise<void>;
} {
  const children = options.scripts.map(({ script }) =>
    spawn(["bun", "run", script], {
      cwd: options.root,
      stdout: "inherit",
      stderr: "inherit",
      env: process.env,
    }),
  );

  for (const line of options.introLines ?? []) {
    console.log(line);
  }

  console.log(`Started ${options.scripts.length} processes. Press Ctrl+C to stop all.`);
  for (const { label, script, port } of options.scripts) {
    console.log(`  - ${label} (${script})${port ? `: ${port}` : ""}`);
  }

  function shutdown() {
    for (const child of children) {
      child.kill();
    }
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return {
    children,
    shutdown,
    waitForever: () => new Promise(() => {}),
  };
}
