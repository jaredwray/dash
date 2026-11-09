import { ArrowRight, Sparkles } from "lucide-react";
import { agentTranscript } from "~/content/mcp";

/** A stylized chat between a person, an agent, and Dash over MCP. */
export function AgentCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-white/10 bg-[#060910] shadow-frame ${className}`}
    >
      <div className="flex h-11 items-center justify-between border-b border-line bg-panel/70 px-4">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-accent motion-safe:animate-pulse-dot" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          <span className="font-mono text-xs text-mist">agent · connected to Dash MCP</span>
        </div>
        <span className="hidden font-mono text-xs text-mist/70 sm:inline">~/dash · main</span>
      </div>

      <ol className="space-y-4 p-5 sm:p-6">
        {agentTranscript.map((step) => {
          if (step.kind === "user") {
            return (
              <li key={step.id} className="flex gap-3">
                <span className="mt-1 font-mono text-sm text-accent-2" aria-hidden="true">
                  ›
                </span>
                <p className="font-mono text-[0.9rem] leading-7 text-paper">{step.text}</p>
              </li>
            );
          }
          if (step.kind === "tool") {
            return (
              <li key={step.id} className="ml-6 border-l border-white/10 pl-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[0.8rem] leading-6">
                  <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-accent ring-1 ring-inset ring-accent/25">
                    {step.tool}
                  </span>
                  {step.input ? <span className="text-mist-2">{step.input}</span> : null}
                  <ArrowRight className="size-3.5 text-mist/60" aria-hidden="true" />
                  <span className="text-mist">{step.result}</span>
                </div>
              </li>
            );
          }
          return (
            <li key={step.id} className="flex gap-3 pt-1">
              <Sparkles className="mt-1.5 size-4 shrink-0 text-accent" aria-hidden="true" />
              <p className="text-[0.95rem] leading-7 text-paper">{step.text}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
