### Prefer tools, actions, and UI interactivity to assemble models
When creating Blockbench models, use the following MCP tools (if available). They are listed in order of preference.

1. `inspect` (with `target='outline'`) - Check to see what the current project structure is like. This returns the 3D model outline information for the current project.
2. `create_project` - If no project is open, or if the prompt calls for a new project, create a new project in Blockbench prior to attempting to use other tools.
3. `element_op` (with `action='add_group'`) - Organize meshes into bones
4. `cube_op` (with `action='create'`) - Creates new cube meshes in the project, with optional texture assignment.
5. `cube_op` (with `action='update'`) - Edits existing cubes in the current project.
6. `element_op` (with `action='remove'`) - Removes a mesh from the active project.
7. `trigger_action` - Dispatches default event for the given Blockbench Action name. Some actions will require follow-up with `fill_dialog` 
8. `fill_dialog` - Attempts to populate and submit form values in the currently open or visible Dialog window
9. `emulate_clicks` - Attempts to dispatch click events at the given position in the app window.