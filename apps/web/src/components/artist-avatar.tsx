import { GradientAvatar } from "./ui";
import { displayImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * An artist's real photo (Deezer) with a graceful gradient-avatar fallback.
 * Uses a plain <img> so any image host works without next/image config.
 */
export function ArtistAvatar({
  name,
  imageUrl,
  size = 44,
  rounded = "xl",
  className,
}: {
  name: string;
  imageUrl?: string | null;
  size?: number;
  rounded?: "xl" | "full";
  className?: string;
}) {
  const src = displayImageUrl(imageUrl);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        loading="lazy"
        width={size}
        height={size}
        className={cn(
          "shrink-0 object-cover ring-1 ring-inset ring-white/10",
          rounded === "full" ? "rounded-full" : "rounded-xl",
          className,
        )}
        style={{ width: size, height: size }}
      />
    );
  }
  return <GradientAvatar name={name} size={size} className={className} />;
}
