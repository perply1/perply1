"use client";

type CodeBlockProps = {
  language: string;
  filename?: string;
  code: string;
  highlightLines?: number[];
};

/** Simple code block without react-syntax-highlighter to avoid Next.js bundling issues */
export function CodeBlock({ filename, code }: CodeBlockProps) {
  return (
    <div
      className="relative w-full rounded-lg font-mono text-[13px] overflow-hidden"
      style={{ backgroundColor: "#111113" }}
    >
      {filename && (
        <div className="flex justify-between items-center py-2 px-3 border-b border-white/[0.06]">
          <div className="text-xs text-zinc-400">{filename}</div>
        </div>
      )}
      <div className="max-h-[360px] overflow-y-auto p-4">
        <pre className="text-zinc-300 whitespace-pre">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
