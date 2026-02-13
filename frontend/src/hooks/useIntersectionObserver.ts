import { useEffect, useRef, useState } from 'react'

interface UseIntersectionObserverOptions {
  threshold?: number
  root?: Element | null
  rootMargin?: string
}

export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
) {
  const [isIntersecting, setIsIntersecting] = useState(false)
  const [hasIntersected, setHasIntersected] = useState(false)
  const targetRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const element = targetRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting)
        if (entry.isIntersecting && !hasIntersected) {
          setHasIntersected(true)
        }
      },
      {
        threshold: options.threshold || 0.1,
        root: options.root || null,
        rootMargin: options.rootMargin || '0px',
      }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
    }
  }, [options.threshold, options.root, options.rootMargin, hasIntersected])

  return { targetRef, isIntersecting, hasIntersected }
}
