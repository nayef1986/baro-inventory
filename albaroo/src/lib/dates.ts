// Section 3.3 / 8B.2: all business logic resolves in Asia/Riyadh, regardless of the
// viewer's own device timezone or locale.
export const COMPANY_TIMEZONE = 'Asia/Riyadh';

export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: COMPANY_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
    numberingSystem: 'latn' // Section 8.5: Western Arabic digits in every locale
  }).format(new Date(iso));
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: COMPANY_TIMEZONE,
    dateStyle: 'medium',
    numberingSystem: 'latn'
  }).format(new Date(iso));
}

export function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60);
}

export function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

export function isOverdue(dueAtIso: string, graceHours = 0): boolean {
  return hoursUntil(dueAtIso) < -graceHours;
}
