import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
      className="mt-8 flex items-center gap-3 overflow-x-auto whitespace-nowrap rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3"
    >
      <h2 className="mr-auto shrink-0 text-sm font-semibold">Connect your agent to Dash MCP</h2>
      <code className="shrink-0 rounded-lg bg-ink px-3 py-2 text-sm text-accent">
        {url || "Loading MCP URL…"}
      </code>
      <GhostButton className="shrink-0" type="button" disabled={!url} onClick={() => void copyUrl()}>
        Copy MCP URL
      </GhostButton>
      {showTokenLink ? (
        <Link to="/tokens" className="shrink-0 text-sm font-medium text-accent underline underline-offset-4">
          API tokens
        </Link>
      ) : null}
      <p role="status" className={copyStatus ? "shrink-0 text-sm text-mist" : "sr-only"}>{copyStatus}</p>
    </section>
  );
}
