import { CSSProperties, MouseEventHandler, ReactEventHandler } from "react";
import { isVideoUrl } from "../../utils/media";

interface MediaThumbnailProps {
  src?: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  loading?: "lazy" | "eager";
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>["referrerPolicy"];
  draggable?: boolean;
  onClick?: MouseEventHandler;
  onError?: ReactEventHandler<HTMLImageElement>;
  /** Autoplay + loop when this is a video (e.g. product listing cards). Off by
   * default so it renders as a static first-frame thumbnail elsewhere (cart,
   * invoices, admin lists) instead of a broken <img> icon. */
  autoPlayVideo?: boolean;
}

/**
 * Drop-in replacement for <img> wherever the src may point to a product's
 * "main image" field — which can now hold either an image or a video file.
 */
export default function MediaThumbnail({
  src,
  alt,
  className,
  style,
  loading,
  referrerPolicy,
  draggable,
  onClick,
  onError,
  autoPlayVideo = false,
}: MediaThumbnailProps) {
  if (src && isVideoUrl(src)) {
    return (
      <video
        src={src}
        className={className}
        style={style}
        onClick={onClick}
        autoPlay={autoPlayVideo}
        loop={autoPlayVideo}
        muted
        playsInline
        preload="metadata"
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      referrerPolicy={referrerPolicy}
      draggable={draggable}
      onClick={onClick}
      onError={onError}
    />
  );
}
