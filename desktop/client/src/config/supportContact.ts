/**
 * Public support / add-contact link shown on the activation page and the
 * in-app support dialog.
 *
 * Set VITE_SUPPORT_CONTACT_URL at build time (see desktop/.env.example).
 * Leave it empty to hide the link. Do not commit a personal invite token.
 */
export const SUPPORT_CONTACT_URL = (import.meta.env.VITE_SUPPORT_CONTACT_URL || '').trim();

export function hasSupportContactUrl(url: string = SUPPORT_CONTACT_URL): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (/TODO_REPLACE|example\.com|placeholder|change-me/i.test(url)) return false;
  return true;
}
