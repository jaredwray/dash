import { CopyButton } from "./copy-button";

type CodeBlockProps = {
  /** One shell command per line. */
  lines: readonly string[];
  /** Label in the title bar, for example "Terminal". */
  title?: string;
  className?: string;
};

/** Splits a command into the program name and its arguments. */
function splitCommand(line: string): { program: string; rest: string } {
  const index = line.indexOf(" ");
  if (index === -1) return { program: line, rest: "" };
  return { program: line.slice(0, index), rest: line.slice(index) };
}

/** A terminal-style block of shell commands with a copy button. */
export function CodeBlock({ lines, title = "Terminal", className = "" }: CodeBlockProps) {
  const text = lines.join("\n");

  return (
    <div
      className={`min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#060910] shadow-frame ${className}`}
    >
      <div className="flex h-11 items-center justify-between border-b border-line bg-panel/70 px-4">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
            <span className="size-2.5 rounded-full bg-white/15" />
          </div>
          <span className="font-mono text-xs text-mist">{title}</span>
        </div>
        <CopyButton text={text} label="Copy commands" />
      </div>
      <pre className="overflow-x-auto p-5 text-[0.84rem] leading-7 sm:text-[0.9rem]">
        <code>
          {lines.map((line) => {
            const { program, rest } = splitCommand(line);
            return (
              <span key={line} className="block whitespace-pre">
                <span className="select-none text-mist/60">$ </span>
                <span className="text-accent">{program}</span>
                <span className="text-paper">{rest}</span>
              </span>
            );
          })}
        </code>
      </pre>
    </div>
  );
}
