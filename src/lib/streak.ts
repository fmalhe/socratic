export function computeNextStreak(
  currentStreak: number,
  lastActivityDate: string | null,
  todayIso: string,
): number {
  if (!lastActivityDate) {
    return 1;
  }
  if (lastActivityDate === todayIso) {
    return Math.max(1, currentStreak);
  }
  const today = new Date(`${todayIso}T00:00:00Z`);
  const yesterday = new Date(today.getTime() - 86_400_000).toISOString().slice(0, 10);
  if (lastActivityDate === yesterday) {
    return currentStreak + 1;
  }
  return 1;
}
