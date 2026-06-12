import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Copy, ThumbsDown, ThumbsUp, User } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";

type MessageFrom = "user" | "assistant";

const markdownComponents = {
  h1: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 className={cn("mt-6 text-lg font-semibold first:mt-0", className)} {...props} />
  ),
  h2: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 className={cn("mt-5 text-base font-semibold first:mt-0", className)} {...props} />
  ),
  h3: ({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 className={cn("mt-4 text-sm font-semibold first:mt-0", className)} {...props} />
  ),
  p: ({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className={cn("leading-7 [&:not(:first-child)]:mt-3", className)} {...props} />
  ),
  ul: ({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className={cn("mt-3 list-disc space-y-1 pl-5", className)} {...props} />
  ),
  ol: ({ className, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol className={cn("mt-3 list-decimal space-y-1 pl-5", className)} {...props} />
  ),
  li: ({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) => (
    <li className={cn("leading-7", className)} {...props} />
  ),
  pre: ({ className, ...props }: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className={cn("mt-3 overflow-x-auto rounded-lg border border-border/70 bg-background/90 p-3 text-xs", className)} {...props} />
  ),
  code: ({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) => {
    const isInline = !String(className ?? "").includes("language-");
    return isInline ? (
      <code className="rounded bg-background/80 px-1.5 py-0.5 text-[0.9em]" {...props}>
        {children}
      </code>
    ) : (
      <code className={cn("font-mono", className)} {...props}>
        {children}
      </code>
    );
  },
  table: ({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
    <div className="mt-3 overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  ),
  th: ({ className, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <th className={cn("border border-border/70 bg-background/70 px-3 py-2 text-left font-medium", className)} {...props} />
  ),
  td: ({ className, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
    <td className={cn("border border-border/70 px-3 py-2 align-top", className)} {...props} />
  ),
  blockquote: ({ className, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote className={cn("mt-3 border-l-2 border-primary/50 pl-4 text-foreground/80", className)} {...props} />
  )
};

const MessageContext = React.createContext<{ from: MessageFrom } | null>(null);

export function Message({
  from,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { from: MessageFrom }) {
  return (
    <MessageContext.Provider value={{ from }}>
      <div
        className={cn("group flex gap-3", from === "user" ? "justify-end" : "justify-start", className)}
        {...props}
      />
    </MessageContext.Provider>
  );
}

export function MessageContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(MessageContext);
  const from = context?.from ?? "assistant";

  return (
    <div
      className={cn(
        "flex max-w-[90%] gap-3",
        from === "user" ? "flex-row-reverse items-end" : "w-full items-start",
        className
      )}
      {...props}
    />
  );
}

export function MessageAvatar() {
  const context = React.useContext(MessageContext);
  const from = context?.from ?? "assistant";
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border/70 text-foreground/75",
        from === "user" ? "bg-primary text-primary-foreground border-primary/30" : "bg-card"
      )}
    >
      {from === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
    </div>
  );
}

export function MessageBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const context = React.useContext(MessageContext);
  const from = context?.from ?? "assistant";
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border px-4 py-3 text-sm shadow-sm",
        from === "user"
          ? "border-primary/25 bg-primary text-primary-foreground"
          : "w-full border-border/70 bg-card/80 text-foreground backdrop-blur",
        className
      )}
      {...props}
    />
  );
}

export function MessageResponse({ children, className }: { children: string; className?: string }) {
  const context = React.useContext(MessageContext);
  const from = context?.from ?? "assistant";

  if (from === "user") {
    return <div className={cn("whitespace-pre-wrap leading-7", className)}>{children}</div>;
  }

  return (
    <div className={cn("min-w-0", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function MessageActions({
  className,
  content
}: {
  className?: string;
  content: string;
}) {
  const context = React.useContext(MessageContext);
  if (context?.from !== "assistant") return null;

  const copy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(content);
  };

  return (
    <div className={cn("mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100", className)}>
      <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => void copy()}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-8 px-2">
        <ThumbsUp className="h-3.5 w-3.5" />
      </Button>
      <Button type="button" size="sm" variant="outline" className="h-8 px-2">
        <ThumbsDown className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
