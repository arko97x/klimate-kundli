type VideoProps = {
  src: string
  caption: string
  poster?: string
}

export function Video({ src, caption, poster }: VideoProps) {
  return (
    <figure className="doc-figure">
      <video controls playsInline preload="metadata" poster={poster}>
        <source src={src} type="video/mp4" />
      </video>
      <figcaption>{caption}</figcaption>
    </figure>
  )
}
