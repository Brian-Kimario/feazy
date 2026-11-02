/**
 * Feazy Lockup
 * Complete logo mark + wordmark combination
 */

import { Symbol } from "./Symbol";
import { Wordmark } from "./Wordmark";

interface LockupProps {
  size?: "sm" | "md" | "lg";
  layout?: "horizontal" | "vertical";
  className?: string;
  href?: string;
}

const symbolSizes = {
  sm: "sm" as const,
  md: "md" as const,
  lg: "lg" as const,
};

const wordmarkSizes = {
  sm: "sm" as const,
  md: "md" as const,
  lg: "lg" as const,
};

export function Lockup({
  size = "md",
  layout = "horizontal",
  className = "",
  href = "/",
}: LockupProps) {
  const layoutClass =
    layout === "horizontal" ? "flex items-center gap-3" : "flex flex-col items-center gap-2";

  const content = (
    <div className={layoutClass}>
      <div className="flex-shrink-0 text-teal">
        <Symbol size={symbolSizes[size]} />
      </div>
      <Wordmark size={wordmarkSizes[size]} />
    </div>
  );

  if (href) {
    return (
      <a href={href} className={`inline-block hover:opacity-80 transition ${className}`}>
        {content}
      </a>
    );
  }

  return <div className={className}>{content}</div>;
}
