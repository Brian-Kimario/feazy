/**
 * Feazy Wordmark
 * "Feazy" text logo with brand typography
 */

interface WordmarkProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizes = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
};

export function Wordmark({ size = "md", className = "" }: WordmarkProps) {
  return (
    <div
      className={`font-display font-bold tracking-tight ${sizes[size]} ${className}`}
    >
      Feazy
    </div>
  );
}
