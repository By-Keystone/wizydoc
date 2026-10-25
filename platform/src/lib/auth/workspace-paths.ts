// Con `switch`, /select no entra directo cuando el usuario sólo tiene una sede.
export const SWITCH_WORKSPACE_PARAM = "switch";

export const switchWorkspacePath = (accountId: string) =>
  `/account/${accountId}/select?${SWITCH_WORKSPACE_PARAM}=1`;
