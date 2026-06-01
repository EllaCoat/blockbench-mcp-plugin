// Stage-II profile machinery v2 (= 14- § 4): each tool is tagged with a
// category at registration time (= setCurrentCategory in tools.ts), and each
// active group whitelists a set of categories. applyGroups() flips
// tools[name].enabled to match the active groups — the per-session
// registerToolsOnServer() (net.ts:324) reads the enabled flag, so the new set
// takes effect on the next /mcp reconnect.
//
// v2 design: groups are combined as a *checkbox set* (= multiple ON at once),
// not a single dropdown value. `core` is always ON (no user toggle); the
// other three are user-toggleable in ui/settings.ts. See 14- § 4.2 / § 4.6.

export type ToolGroup = "core" | "aj" | "modeling" | "camera";

// User-toggleable groups (= core is always ON, not exposed as a toggle).
export type ToggleableGroup = Exclude<ToolGroup, "core">;

export const TOGGLEABLE_GROUPS: ToggleableGroup[] = ["aj", "modeling", "camera"];

// Default toggle state (= イーラ君明言 2026-06-01).
// aj ON / modeling OFF / camera OFF. core is implicit-always-ON.
export const DEFAULT_GROUP_STATE: Record<ToggleableGroup, boolean> = {
  aj: true,
  modeling: false,
  camera: false,
};

// Category → owning group. setCurrentCategory(category) in server/tools.ts
// passes one of these category names. Categories not listed here default to
// `core` (= they always pass), so unknown categories are safe.
export const GROUP_CATEGORIES: Record<ToolGroup, ReadonlySet<string>> = {
  core: new Set([
    "inspect",
    "history",
    "ui",
    "project",
    "import",
    "export",
  ]),
  aj: new Set([
    "animated-java",
    "animation",
  ]),
  modeling: new Set([
    "armature",
    "cubes",
    "elements",
    "material-instances",
    "mesh-editing",
    "paint",
    "textures",
    "uv-mapping",
  ]),
  camera: new Set([
    "camera",
  ]),
};

// Reverse lookup: category → owning group. Built once at module load.
const CATEGORY_OWNER: Map<string, ToolGroup> = (() => {
  const m = new Map<string, ToolGroup>();
  (Object.entries(GROUP_CATEGORIES) as [ToolGroup, ReadonlySet<string>][]).forEach(
    ([group, cats]) => {
      for (const cat of cats) m.set(cat, group);
    }
  );
  return m;
})();

export function categoryOwner(category: string): ToolGroup {
  // Unknown category → core (= always enabled, fail-open for new register fns
  // that forgot to tag).
  return CATEGORY_OWNER.get(category) ?? "core";
}

export function isCategoryEnabled(
  activeGroups: ReadonlySet<ToolGroup>,
  category: string
): boolean {
  const owner = categoryOwner(category);
  // core is always ON regardless of activeGroups.
  if (owner === "core") return true;
  return activeGroups.has(owner);
}

// Build the active set from the user-toggleable state. core is always added.
export function buildActiveGroups(
  state: Record<ToggleableGroup, boolean>
): Set<ToolGroup> {
  const active = new Set<ToolGroup>(["core"]);
  for (const g of TOGGLEABLE_GROUPS) {
    if (state[g]) active.add(g);
  }
  return active;
}
