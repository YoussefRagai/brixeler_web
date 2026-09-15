export type AppUsageSummary = {
  days: number; platform: string; generated_at: string; last_event_at: string | null;
  active_users: number; sessions: number; screen_views: number; events: number;
  daily: { day: string; users: number; events: number }[];
  screens: { screen: string; views: number; users: number }[];
  features: { event_name: string; events: number; users: number }[];
  funnel: { browse_sessions: number; detail_sessions: number; contact_sessions: number };
};
export function appUsageFilters(days?: string, platform?: string) {
  return { days: [7,30,90].includes(Number(days)) ? Number(days) : 30, platform: ['ios','android','web'].includes(platform ?? '') ? platform! : 'all' };
}
export function usagePercentage(numerator: number, denominator: number): string {
  return denominator > 0 ? `${(numerator/denominator*100).toFixed(1)}%` : '—';
}
