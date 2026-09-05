/**
 * Tiny pub/sub so sibling client components can tell each other "the project
 * list changed" without a shared state library. The Sidebar fetches
 * `/api/projects` on its own, keyed off the route - it has no way to know
 * when ProjectManager creates/archives/deletes a project while staying on
 * the same page. Firing this event is how it finds out.
 */
const PROJECTS_CHANGED = "scvnote:projects-changed";

export function notifyProjectsChanged(): void {
  window.dispatchEvent(new Event(PROJECTS_CHANGED));
}

/** Returns an unsubscribe function - call it from a useEffect cleanup. */
export function onProjectsChanged(handler: () => void): () => void {
  window.addEventListener(PROJECTS_CHANGED, handler);
  return () => window.removeEventListener(PROJECTS_CHANGED, handler);
}
