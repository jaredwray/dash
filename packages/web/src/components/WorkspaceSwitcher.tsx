import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronsUpDown, UserRound, Users } from "lucide-react";
import type { Workspace } from "@dash/core";
import { cn } from "~/lib/cn";
import { useWorkspace } from "./WorkspaceProvider";

function WorkspaceIcon({ workspace }: { workspace: Workspace }) {
  const Icon = workspace.kind === "personal" ? UserRound : Users;
  return (
    <span
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
        workspace.kind === "personal" ? "bg-accent/10 text-accent" : "bg-accent-2/15 text-accent-2",
      )}
    >
      <Icon size={16} aria-hidden="true" />
    </span>
  );
}

export function WorkspaceSwitcher({ userId }: { userId: string }) {
  const { workspace, workspaces, selectWorkspace } = useWorkspace();
  const [supportsPopover, setSupportsPopover] = useState(false);

  useEffect(() => {
    setSupportsPopover(
      "popover" in HTMLElement.prototype &&
        typeof HTMLElement.prototype.showPopover === "function" &&
        typeof HTMLElement.prototype.hidePopover === "function",
    );
  }, []);

  if (supportsPopover) return <WorkspaceMenu userId={userId} />;

  return (
    <label className="relative mt-6 block">
      <span className="sr-only">Switch workspace</span>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <WorkspaceIcon workspace={workspace} />
      </span>
      <select
        value={workspace.id}
        onChange={(event) => selectWorkspace(event.target.value)}
        className="w-full appearance-none truncate rounded-xl border border-line bg-panel py-4 pl-14 pr-9 text-sm text-paper hover:border-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {workspaces.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
            {item.ownerId === userId ? " · Your workspace" : ""}
          </option>
        ))}
      </select>
      <ChevronsUpDown
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mist"
      />
    </label>
  );
}

function WorkspaceMenu({ userId }: { userId: string }) {
  const { workspace, workspaces, selectWorkspace } = useWorkspace();
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function close(event: Event) {
      if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      menu.current?.hidePopover();
    }
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function positionMenu() {
    if (!trigger.current || !menu.current) return;
    search.current = { text: "", time: 0 };
    const rect = trigger.current.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 288), window.innerWidth - 24);
    Object.assign(menu.current.style, {
      left: `${Math.min(rect.left, window.innerWidth - width - 12)}px`,
      top: `${rect.bottom + 8}px`,
      width: `${width}px`,
      maxHeight: `${Math.min(360, window.innerHeight - rect.bottom - 20)}px`,
    });
  }

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitemradio]") ?? [],
    );
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = (current + 1) % items.length;
    if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (
      event.key.length === 1 &&
      event.key !== " " &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      search.current.text =
        (now - search.current.time < 500 ? search.current.text : "") + event.key.toLowerCase();
      search.current.time = now;
      const match = workspaces.findIndex((item) =>
        item.name.toLowerCase().startsWith(search.current.text),
      );
      if (match !== -1) next = match;
    }
    if (next !== undefined) {
      event.preventDefault();
      items[next]?.focus();
    }
    if (event.key === "Tab") {
      menu.current?.hidePopover();
      trigger.current?.focus();
    }
  }

  return (
    <div className="mt-6">
      <button
        ref={trigger}
        type="button"
        popoverTarget={menuId}
        aria-label={`Switch workspace, current workspace: ${workspace.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={positionMenu}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            positionMenu();
            menu.current?.showPopover();
          }
        }}
        className="group flex w-full items-center gap-3 rounded-xl border border-line bg-panel/70 p-3 text-left transition-colors hover:border-white/20 hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
      >
        <WorkspaceIcon workspace={workspace} />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-mist">
            Workspace
          </span>
          <span className="block truncate text-sm font-medium text-paper" title={workspace.name}>
            {workspace.name}
          </span>
        </span>
        <ChevronsUpDown
          size={15}
          aria-hidden="true"
          className="shrink-0 text-mist group-hover:text-paper"
        />
      </button>
      <div
        ref={menu}
        id={menuId}
        popover="auto"
        role="menu"
        aria-label="Switch workspace"
        onToggle={(event) => {
          setOpen(event.newState === "open");
        }}
        onKeyDown={moveFocus}
        className="fixed inset-auto m-0 overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-panel p-1.5 text-paper shadow-[0_16px_48px_rgb(0_0_0_/0.45)]"
      >
        <p className="px-3 pb-2 pt-2 text-xs font-medium text-mist" role="presentation">
          Switch workspace
        </p>
        {workspaces.map((item) => (
          <button
            key={item.id}
            ref={(button) => {
              // The native attribute gives the popover immediate focus on its selected item.
              if (button) button.autofocus = item.id === workspace.id;
            }}
            type="button"
            role="menuitemradio"
            aria-checked={item.id === workspace.id}
            tabIndex={-1}
            onClick={() => {
              menu.current?.hidePopover();
              trigger.current?.focus();
              if (item.id !== workspace.id) selectWorkspace(item.id);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60",
              item.id === workspace.id && "bg-accent/5",
            )}
          >
            <WorkspaceIcon workspace={item} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium" title={item.name}>
                {item.name}
              </span>
              <span className="block text-xs text-mist">
                {item.kind === "personal"
                  ? item.ownerId === userId
                    ? "Your personal workspace"
                    : "Shared personal workspace"
                  : "Shared workspace"}
              </span>
            </span>
            {item.id === workspace.id ? (
              <Check size={16} aria-hidden="true" className="shrink-0 text-accent" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
