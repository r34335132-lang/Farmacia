"use client"

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react"
import { cn } from "@/lib/utils"

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function hasFinePointer() {
  return typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches
}

export function SplitText({
  text,
  className,
  delay = 0,
  stagger = 24,
}: {
  text: string
  className?: string
  delay?: number
  stagger?: number
}) {
  let charIndex = 0
  return (
    <span aria-label={text} className={className}>
      {text.split(" ").map((word, wi, words) => (
        <span key={wi} aria-hidden="true" className="split-word">
          {Array.from(word).map((ch, ci) => {
            const d = delay + charIndex++ * stagger
            return (
              <span key={ci} className="anim-char" style={{ "--d": `${d}ms` } as CSSProperties}>
                {ch}
              </span>
            )
          })}
          {wi < words.length - 1 ? "\u00A0" : null}
        </span>
      ))}
    </span>
  )
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export function CountUp({
  value,
  format = (n) => Math.round(n).toLocaleString("es-MX"),
  duration = 1100,
  delay = 0,
}: {
  value: number
  format?: (n: number) => string
  duration?: number
  delay?: number
}) {
  const [display, setDisplay] = useState(0)
  const fromRef = useRef(0)

  useEffect(() => {
    const target = Number.isFinite(value) ? value : 0
    if (prefersReducedMotion() || duration <= 0) {
      fromRef.current = target
      setDisplay(target)
      return
    }
    const from = fromRef.current
    let raf = 0
    let start = 0
    const timeout = window.setTimeout(() => {
      const step = (now: number) => {
        if (!start) start = now
        const t = Math.min(1, (now - start) / duration)
        const current = from + (target - from) * easeOutCubic(t)
        fromRef.current = current
        setDisplay(current)
        if (t < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, delay)
    return () => {
      window.clearTimeout(timeout)
      cancelAnimationFrame(raf)
    }
  }, [value, duration, delay])

  return <span className="tabular-nums">{format(display)}</span>
}

export function Magnetic({
  children,
  className,
  strength = 0.25,
}: {
  children: ReactNode
  className?: string
  strength?: number
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !hasFinePointer() || prefersReducedMotion()) return
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left - r.width / 2) * strength
      const y = (e.clientY - r.top - r.height / 2) * (strength + 0.05)
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
    const onLeave = () => {
      el.style.transform = ""
    }
    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerleave", onLeave)
    return () => {
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerleave", onLeave)
    }
  }, [strength])

  return (
    <span ref={ref} className={cn("magnetic inline-block", className)}>
      {children}
    </span>
  )
}

export function Reveal({
  as: Tag = "div",
  index = 0,
  className,
  style,
  children,
  ...rest
}: {
  as?: ElementType
  index?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
} & HTMLAttributes<HTMLElement>) {
  const ref = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      setShown(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          io.disconnect()
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref}
      className={cn("reveal", shown && "is-in", className)}
      style={{ "--i": index, ...style } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export const stagger = (i: number) => ({ "--i": i }) as CSSProperties
