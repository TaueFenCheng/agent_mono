import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button, cn } from "../../index";

export function Conversation({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("relative flex min-h-0 flex-1 flex-col", className)} {...props} />;
}

export function ConversationContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-1", className)} {...props} />;
}

export function ConversationScrollButton({
  className,
  containerRef
}: {
  className?: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const update = () => {
      const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
      setVisible(remaining > 80);
    };

    update();
    node.addEventListener("scroll", update, { passive: true });
    return () => node.removeEventListener("scroll", update);
  }, [containerRef]);

  if (!visible) return null;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={cn("absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-card/90 px-3 shadow-lg backdrop-blur", className)}
      onClick={() => containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" })}
    >
      <ChevronDown className="mr-1 h-4 w-4" />
      最新消息
    </Button>
  );
}
