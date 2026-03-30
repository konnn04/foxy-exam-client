import * as React from "react"
import { BREAKPOINTS } from "@/config"

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${BREAKPOINTS.TABLET - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < BREAKPOINTS.TABLET)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < BREAKPOINTS.TABLET)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
