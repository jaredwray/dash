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
      setCopyStatus("Could not copy. Select and copy the URL above.");
    }
  }

  return (
    <section aria-label="Connect your agent" className="mt-8 rounded-2xl border border-accent/30 bg-accent/10 p-6">
      <h2 className="text-lg font-semibold">Connect your agent to Dash MCP</h2>
      <p className="mt-2 text-sm text-mist">
        MCP is the primary way to use Dash. Connect your agent to explore data, run queries,
        and build dashboards through conversation.
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-mist">
        <li>Create an API token with the <code>read</code> and <code>mcp</code> scopes.
          Add <code>write</code> if your agent should create or update dashboards.</li>
        <li>Add a remote MCP server in your agent’s settings using this URL:</li>
      </ol>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <code className="min-w-0 break-all rounded-lg bg-ink px-3 py-2 text-sm text-accent">
          {url || "Loading MCP URL…"}
        </code>
        <GhostButton type="button" disabled={!url} onClick={() => void copyUrl()}>
          Copy MCP URL
        </GhostButton>
      </div>
      <p className="mt-3 text-sm text-mist">
        Authenticate with your token using <code className="break-all">Authorization: Bearer &lt;your-api-token&gt;</code>.
        Then ask your agent to connect to Dash and explore your data.
      </p>
      {showTokenLink ? (
        <Link to="/tokens" className="mt-4 inline-block text-sm font-medium text-accent underline underline-offset-4">
          Create or manage API tokens
        </Link>
      ) : null}
      <p role="status" className="mt-2 text-sm text-mist">{copyStatus}</p>
    </section>
  );
}
