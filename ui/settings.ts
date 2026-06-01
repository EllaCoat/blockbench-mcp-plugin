import { applyGroups } from "@/lib/factories";
import {
  DEFAULT_GROUP_STATE,
  TOGGLEABLE_GROUPS,
  type ToggleableGroup,
} from "@/lib/profiles";

const settings: Setting[] = [];

// Read the current toggle state from Blockbench Settings, falling back to
// defaults for any toggle that hasn't been persisted yet.
function readGroupState(): Record<ToggleableGroup, boolean> {
  const state: Record<ToggleableGroup, boolean> = { ...DEFAULT_GROUP_STATE };
  for (const g of TOGGLEABLE_GROUPS) {
    const raw = Settings.get(`mcp_group_${g}`);
    if (raw !== undefined && raw !== null) state[g] = Boolean(raw);
  }
  return state;
}

function applyCurrentGroupState() {
  applyGroups(readGroupState());
}

export function settingsSetup() {
  const category = "general";

  settings.push(
    new Setting("mcp_instructions", {
      name: tl("mcp.settings.instructions_name"),
      // https://github.com/punkpeye/fastmcp?tab=readme-ov-file#providing-instructions
      description: tl("mcp.settings.instructions_desc"),
      type: "text",
      value:
        "Generate simple, low-poly models for Minecraft inside Blockbench.",
      category,
      icon: "psychology",
    }),
    new Setting("mcp_port", {
      name: tl("mcp.settings.port_name"),
      description: tl("mcp.settings.port_desc"),
      type: "number",
      value: 3000,
      category,
      icon: "numbers",
    }),
    new Setting("mcp_endpoint", {
      name: tl("mcp.settings.endpoint_name"),
      description: tl("mcp.settings.endpoint_desc"),
      type: "text",
      value: "/bb-mcp",
      category,
      icon: "webhook",
    }),
    new Setting("mcp_prompt_cdn_enabled", {
      name: tl("mcp.settings.prompt_cdn_name"),
      description: tl("mcp.settings.prompt_cdn_desc"),
      type: "toggle",
      value: true,
      category,
      icon: "cloud_download",
    }),
    new Setting("mcp_session_timeout", {
      name: tl("mcp.settings.session_timeout_name"),
      description: tl("mcp.settings.session_timeout_desc"),
      type: "number",
      value: 5,
      min: 1,
      max: 1440,
      category,
      icon: "timer",
    }),
    new Setting("mcp_sse_heartbeat", {
      name: tl("mcp.settings.sse_heartbeat_name"),
      description: tl("mcp.settings.sse_heartbeat_desc"),
      type: "number",
      value: 15,
      min: 0,
      max: 600,
      category,
      icon: "favorite",
    }),
    // Stage-II group toggles (= 14- § 4.5). core is always ON so it has no
    // toggle. Each onChange flips tools[name].enabled in bulk via applyGroups;
    // the new set takes effect on the next /mcp reconnect.
    new Setting("mcp_group_aj", {
      name: tl("mcp.settings.group_aj_name"),
      description: tl("mcp.settings.group_aj_desc"),
      type: "toggle",
      value: DEFAULT_GROUP_STATE.aj,
      category,
      icon: "view_in_ar",
      // @ts-ignore - onChange is available at runtime
      onChange() {
        applyCurrentGroupState();
      },
    }),
    new Setting("mcp_group_modeling", {
      name: tl("mcp.settings.group_modeling_name"),
      description: tl("mcp.settings.group_modeling_desc"),
      type: "toggle",
      value: DEFAULT_GROUP_STATE.modeling,
      category,
      icon: "brush",
      // @ts-ignore - onChange is available at runtime
      onChange() {
        applyCurrentGroupState();
      },
    }),
    new Setting("mcp_group_camera", {
      name: tl("mcp.settings.group_camera_name"),
      description: tl("mcp.settings.group_camera_desc"),
      type: "toggle",
      value: DEFAULT_GROUP_STATE.camera,
      category,
      icon: "photo_camera",
      // @ts-ignore - onChange is available at runtime
      onChange() {
        applyCurrentGroupState();
      },
    })
  );

  // Apply the persisted toggle state to tools[name].enabled now that the
  // settings exist. Tools registered before settingsSetup() ran came in
  // enabled=true; this flips off any group that the user had disabled.
  applyCurrentGroupState();
}

export function settingsTeardown() {
  settings.forEach((setting) => {
    setting.delete();
  });
}
