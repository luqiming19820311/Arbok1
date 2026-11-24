"use client";

import { createAgent, registerTools } from "@ui-sdk/react/agent";

let registered = false;

export function initArbokAgentBridge() {
  if (typeof window === "undefined" || registered) return;
  registered = true;

  const agent = createAgent({
    allow: (step) => {
      if (!step.confirm) return true;
      return window.confirm(step.confirm);
    },
  });

  registerTools(agent, { allow: () => true });
}
