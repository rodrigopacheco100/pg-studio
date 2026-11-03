import type { Conn, Folder } from "@/types";

/**
 * Moves connection `id` into `folderId` (`null` = top level), right before `beforeId`, or to the end of
 * that folder when `beforeId` is `null`. The list order is the display order, so a folder's order is
 * the relative order of its members.
 */
export function moveConnection(conns: Conn[], id: number, folderId: number | null, beforeId: number | null): Conn[] {
  const moving = conns.find((c) => c.id === id);
  if (!moving || id === beforeId) return conns;
  const rest = conns.filter((c) => c.id !== id);
  const moved = { ...moving, folder_id: folderId };
  if (beforeId !== null) {
    const at = rest.findIndex((c) => c.id === beforeId);
    if (at >= 0) return [...rest.slice(0, at), moved, ...rest.slice(at)];
  }
  const last = rest.map((c) => c.folder_id).lastIndexOf(folderId);
  return last >= 0 ? [...rest.slice(0, last + 1), moved, ...rest.slice(last + 1)] : [...rest, moved];
}

/** Moves folder `id` right before `beforeId`, or to the end when `beforeId` is `null`. */
export function moveFolder(folders: Folder[], id: number, beforeId: number | null): Folder[] {
  const moving = folders.find((f) => f.id === id);
  if (!moving || id === beforeId) return folders;
  const rest = folders.filter((f) => f.id !== id);
  const at = beforeId === null ? -1 : rest.findIndex((f) => f.id === beforeId);
  return at < 0 ? [...rest, moving] : [...rest.slice(0, at), moving, ...rest.slice(at)];
}
