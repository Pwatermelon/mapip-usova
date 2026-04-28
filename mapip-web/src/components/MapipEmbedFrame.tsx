type MapipEmbedFrameProps = {
  src: string;
  height?: number | string;
  title?: string;
};

export function MapipEmbedFrame({
  src,
  height = 600,
  title = "MAPIP router widget",
}: MapipEmbedFrameProps) {
  return (
    <iframe
      title={title}
      src={src}
      style={{ width: "100%", border: 0, borderRadius: 12, height }}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
    />
  );
}
