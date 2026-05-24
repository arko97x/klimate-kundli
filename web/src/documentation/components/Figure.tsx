type FigureProps = {
  src: string
  alt?: string
  caption: string
  wide?: boolean
}

export function Figure({ src, alt, caption, wide = false }: FigureProps) {
  return (
    <figure className={wide ? 'doc-figure-wide' : 'doc-figure'}>
      <img src={src} alt={alt ?? caption} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  )
}
