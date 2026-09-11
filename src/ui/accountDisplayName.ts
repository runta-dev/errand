export function accountDisplayName(profile?: { display_name?: string | null; email?: string }) {
  const explicit = profile?.display_name?.trim();
  if (explicit) return explicit;
  const localPart = profile?.email?.split("@", 1)[0]?.trim();
  if (!localPart) return "Your account";
  return localPart.split(/[._-]+/).filter(Boolean).map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`).join(" ") || "Your account";
}
