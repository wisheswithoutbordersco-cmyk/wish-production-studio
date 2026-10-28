export const REFERENCE_IMAGE_CONTROL_CAPACITY = 8;

export type ReferenceMoveDirection = "earlier" | "later";

export function appendReferenceImages<T>(
  items: readonly T[],
  additions: readonly T[],
  maxItems: number
): T[] {
  return [...items, ...additions].slice(0, Math.max(0, maxItems));
}

export function removeReferenceImage<T extends { id: string }>(
  items: readonly T[],
  imageId: string
): T[] {
  return items.filter(item => item.id !== imageId);
}

export function moveReferenceImage<T extends { id: string }>(
  items: readonly T[],
  imageId: string,
  direction: ReferenceMoveDirection
): T[] {
  if (items.length > REFERENCE_IMAGE_CONTROL_CAPACITY) {
    return [...items];
  }

  const fromIndex = items.findIndex(item => item.id === imageId);
  if (fromIndex < 0) return [...items];

  const toIndex = fromIndex + (direction === "earlier" ? -1 : 1);
  if (toIndex < 0 || toIndex >= items.length) return [...items];

  const reordered = [...items];
  [reordered[fromIndex], reordered[toIndex]] = [
    reordered[toIndex],
    reordered[fromIndex],
  ];
  return reordered;
}
