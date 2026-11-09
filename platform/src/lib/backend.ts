import "server-only";

export function isServerlessBackend(): boolean {
  return process.env.BACKEND === "serverless";
}
