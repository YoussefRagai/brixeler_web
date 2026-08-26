export const MOBILE_ACTIONS = [
  { value: "/", label: "Home" },
  { value: "/properties", label: "Properties" },
  { value: "/deals", label: "Deals" },
  { value: "/gifts", label: "Gifts" },
  { value: "/profile", label: "Profile" },
  { value: "/support", label: "Support" },
] as const;

export type MobileActionUrl = (typeof MOBILE_ACTIONS)[number]["value"];

export function parseMobileActionUrl(value: FormDataEntryValue | null): MobileActionUrl {
  const candidate = value?.toString().trim() || "/";
  return MOBILE_ACTIONS.some((action) => action.value === candidate)
    ? (candidate as MobileActionUrl)
    : "/";
}
