export function sidebarBaseCollapsed({
  immersive,
  mobile,
  pref,
}: {
  immersive: boolean;
  mobile: boolean;
  pref: boolean;
}): boolean {
  return immersive || mobile || pref;
}
