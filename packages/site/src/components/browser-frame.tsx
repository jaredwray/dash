import Image from "next/image";

type BrowserFrameProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Text in the address bar. */
  url?: string;
  /** CSS aspect ratio of the visible area, for example "16 / 10". */
  aspect?: string;
  /** Load the image before the rest of the page. Use it for the hero only. */
  priority?: boolean;
  className?: string;
};

/**
 * Shows a product screenshot inside browser chrome.
 * Tall screenshots are cropped from the top.
 */
export function BrowserFrame({
  src,
  alt,
  width,
  height,
  url = "dash.io",
  aspect = "16 / 10",
  priority = false,
  className = "",
}: BrowserFrameProps) {
  return (
    <figure
      className={`overflow-hidden rounded-2xl border border-white/10 bg-ink-2 shadow-frame ${className}`}
    >
      <div className="flex h-10 items-center gap-3 border-b border-line bg-panel px-4">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </div>
        <div className="mx-auto flex h-6 w-full max-w-xs items-center justify-center rounded-md bg-ink/70 px-3 font-mono text-[0.7rem] text-mist ring-1 ring-inset ring-white/5">
          <span className="truncate">{url}</span>
        </div>
        <span className="w-[2.6rem]" aria-hidden="true" />
      </div>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: aspect }}>
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes="(min-width: 1280px) 1152px, 100vw"
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      </div>
    </figure>
  );
}
