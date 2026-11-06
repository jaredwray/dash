import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { GhostButton } from "~/components/ui";

export function McpConnectionBanner({ showTokenLink = true }: { showTokenLink?: boolean }) {
  const [url, setUrl] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    setUrl(new URL("/mcp", window.location.origin).href);
  }, []);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("MCP URL copied.");
    } catch {
      setCopyStatus("Could not copy. Select the URL and copy it.");
    }
  }

  return (
    <section
      aria-label="Connect your agent"
      className="mt-8 space-y-3 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3"
    >
      <h2 className="text-sm font-semibold">Connect your agent to Dash MCP</h2>
      <div className="flex items-center gap-3">
        <code className="block min-w-0 flex-1 break-all rounded-lg bg-ink px-3 py-2 text-sm select-all text-accent">
          {url || "Please wait for the MCP URL…"}
        </code>
        <GhostButton
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center p-0"
          type="button"
          aria-label="Copy MCP URL"
          title="Copy MCP URL"
          disabled={!url}
          onClick={() => void copyUrl()}
        >
          <Copy size={16} aria-hidden="true" />
        </GhostButton>
      </div>
      {showTokenLink ? (
        <Link to="/agent-tokens" className="inline-block text-sm font-medium text-accent underline underline-offset-4">
          Agent tokens
        </Link>
      ) : null}
      <p role="status" className={copyStatus ? "text-sm text-mist" : "sr-only"}>{copyStatus}</p>
    </section>
  );
}
