import { useEffect, useState } from "react"

// Minimal hash router: navigable context lives in the URL fragment (#/roster, #/runs/run_x). No history
// state, no effects reading ambient browser state during render beyond the subscribed hash.
const currentPath = () => window.location.hash.slice(1) || "/"

export function useRoute(): { path: string; navigate: (to: string) => void } {
  const [path, setPath] = useState(currentPath)
  useEffect(() => {
    const onChange = () => setPath(currentPath())
    window.addEventListener("hashchange", onChange)
    return () => window.removeEventListener("hashchange", onChange)
  }, [])
  return { path, navigate: (to) => window.location.assign(`#${to}`) }
}
