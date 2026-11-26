/**
 * Navigate back within the current React Router session when history exists;
 * otherwise fall back to a safe in-app route (e.g. when opened in a new tab or direct link).
 */
export const safeGoBack = (navigate, fallback = '/') => {
  const idx = window.history.state?.idx;
  if (typeof idx === 'number' && idx > 0) {
    navigate(-1);
    return;
  }
  if (window.history.length > 1 && document.referrer) {
    try {
      if (new URL(document.referrer).origin === window.location.origin) {
        navigate(-1);
        return;
      }
    } catch {
      // Ignore invalid referrer URLs
    }
  }
  navigate(fallback, { replace: true });
};
