import type { ComponentProps, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";

type MarkdownExamContentProps = {
  children: string;
  /**
   * `true` — always parse as HTML (trusted CMS).
   * `false` — markdown only (GFM fences).
   * `undefined` — auto: HTML with embedded ``` → extract text then markdown; plain HTML → rehype-raw.
   */
  allowHtml?: boolean;
  className?: string;
};

/**
 * Detect rich-text HTML stored by admin/LMS (not markdown). Without rehype-raw these render as literal tags.
 */
export function examContentLooksLikeHtml(raw: string): boolean {
  const t = String(raw ?? "").trim();
  if (t.length < 3) return false;
  if (!t.startsWith("<")) return false;
  if (/^<(p|div|span|br|h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|strong|em|b|i|pre|code)\b/i.test(t)) {
    return true;
  }
  if (/^<[a-z][\w:-]*[\s>]/i.test(t) && />\s*</.test(t)) {
    return true;
  }
  return false;
}

/**
 * Normalize DB/CMS markdown so remark-gfm recognizes fences (CRLF, NBSP, fullwidth backtick,
 * ```lang stuck on same line as paragraph — common when pasting from Word/LMS).
 */
export function normalizeExamMarkdown(raw: string): string {
  let s = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  s = s.replace(/\u00a0/g, " ");
  s = s.replace(/\uFF40/g, "`");
  s = s.replace(/([^\n])\s*(```[\w#+\-]*\s*\n)/g, "$1\n\n$2");
  // Fence language stuck to first line of code (e.g. ```cppint a) — force newline after language tag
  s = s.replace(/```([a-z0-9#+-]+)([^\n`\s])/gi, "```$1\n$2");
  return s.trim();
}

/**
 * LMS often stores each line in `<p><span>…</span></p>` with markdown fences as plain text inside HTML.
 * Parse to text; if we see fences, render as markdown instead of rehype-raw on the HTML string.
 */
function extractTextFromHtmlInBrowser(html: string): string {
  try {
    const doc = document.implementation.createHTMLDocument("");
    doc.body.innerHTML = html;
    return (doc.body.textContent ?? "").trim();
  } catch {
    return html.replace(/<[^>]+>/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
}

function prepareExamContentSource(
  raw: string,
  allowHtml: boolean | undefined,
): { source: string; useRehypeRaw: boolean } {
  const str = String(raw ?? "");

  if (allowHtml === true) {
    return {
      source: str.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim(),
      useRehypeRaw: true,
    };
  }

  if (allowHtml === false) {
    return { source: normalizeExamMarkdown(str), useRehypeRaw: false };
  }

  const looksHtml = examContentLooksLikeHtml(str);
  if (looksHtml && typeof document !== "undefined") {
    const plain = extractTextFromHtmlInBrowser(str);
    if (plain.includes("```")) {
      return { source: normalizeExamMarkdown(plain), useRehypeRaw: false };
    }
    return {
      source: str.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim(),
      useRehypeRaw: true,
    };
  }

  if (looksHtml) {
    const stripped = str.replace(/<[^>]+>/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    if (stripped.includes("```")) {
      return { source: normalizeExamMarkdown(stripped), useRehypeRaw: false };
    }
    return {
      source: str.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim(),
      useRehypeRaw: true,
    };
  }

  return { source: normalizeExamMarkdown(str), useRehypeRaw: false };
}

/**
 * Renders exam question / option markdown with correct fenced code blocks (```).
 * Inline `code` stays compact; block code uses <pre> + scroll.
 */
export function MarkdownExamContent({
  children,
  allowHtml,
  className,
}: MarkdownExamContentProps) {
  const { source, useRehypeRaw } = prepareExamContentSource(String(children ?? ""), allowHtml);

  return (
    <div
      className={cn(
        "prose dark:prose-invert max-w-none prose-sm md:prose-base",
        "prose-headings:scroll-mt-20 prose-p:leading-relaxed",
        "[&_p>span]:whitespace-pre-wrap [&_p>span]:font-mono [&_p>span]:text-sm",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={useRehypeRaw ? [rehypeRaw] : []}
        components={{
          pre({ children: preChildren }: { children?: ReactNode }) {
            return (
              <pre className="not-prose my-3 overflow-x-auto rounded-lg border border-border bg-zinc-950 p-4 text-left text-sm text-zinc-100 shadow-inner dark:bg-zinc-900">
                {preChildren}
              </pre>
            );
          },
          code({ className, children, ...rest }: ComponentProps<"code">) {
            const text = String(children ?? "").replace(/\n$/, "");
            const match = /language-([\w#+]+)/.exec(className || "");
            const lang = match?.[1]?.toLowerCase() ?? "";
            const isBlock = Boolean(match) || text.includes("\n");

            if (!isBlock) {
              return (
                <code
                  className="not-prose rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-foreground"
                  {...rest}
                >
                  {children}
                </code>
              );
            }

            if (lang) {
              return (
                <SyntaxHighlighter
                  language={lang}
                  style={vscDarkPlus}
                  PreTag="div"
                  className="not-prose my-3 rounded-lg border border-border text-sm shadow-inner! [&_pre]:m-0! [&_pre]:bg-transparent! [&_pre]:p-0!"
                  customStyle={{
                    margin: 0,
                    padding: "1rem",
                    background: "rgb(24 24 27)",
                  }}
                  codeTagProps={{
                    className: "font-mono text-[13px] leading-relaxed",
                  }}
                >
                  {text}
                </SyntaxHighlighter>
              );
            }

            return (
              <code
                className={cn(
                  "not-prose block w-fit min-w-full whitespace-pre font-mono text-sm leading-relaxed text-zinc-100",
                  className,
                )}
                {...rest}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
