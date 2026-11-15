/**
 * Game-facing pet roster loader.
 * Serves assets directly from /pets/<id>/ (public/pets at build/runtime).
 */
const DEFAULT_MANIFEST_URL = "/pets/manifest.json";

/**
 * @returns {Promise<{
 *   generatedAt: string,
 *   count: number,
 *   basePath: string,
 *   pets: Array<{ id: string, name: string, icon: string|null, sheets: string[] }>
 * }>}
 */
export async function loadPetsManifest(url = DEFAULT_MANIFEST_URL) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load pet manifest (${res.status}): ${url}`);
  }
  return res.json();
}

/** Resolve a pet asset URL (already rooted under /pets in the manifest). */
export function petAssetUrl(petPath) {
  if (!petPath) return null;
  return petPath.startsWith("/") ? petPath : `/pets/${petPath}`;
}
