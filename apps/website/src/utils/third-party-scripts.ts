export function loadThirdPartyScripts(pathname: string): void {
  // Supabase verification links put bearer tokens in the URL fragment. Keep
  // third-party code off that document while the callback clears the fragment.
  const normalizedPathname = pathname.replace(/\/+$/, "").toLowerCase();
  if (normalizedPathname === "/auth/auth-success") return;

  const analytics = document.createElement("script");
  analytics.src = "https://cloud.umami.is/script.js";
  analytics.defer = true;
  analytics.dataset.websiteId = "909d6f0d-eb16-42bc-a490-167097dc56a1";
  document.head.append(analytics);

  const tally = document.createElement("script");
  tally.src = "https://tally.so/widgets/embed.js";
  tally.async = true;
  document.body.append(tally);
}
