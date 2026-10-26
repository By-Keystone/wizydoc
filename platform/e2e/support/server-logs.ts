import { readFileSync } from "node:fs";
import { API_LOG_PATH, PLATFORM_LOG_PATH } from "./env";

function readLog(path: string): string {
  try {
    return readFileSync(path, "utf-8");
  } catch {
    return "";
  }
}

export const readApiLog = () => readLog(API_LOG_PATH);
export const readPlatformLog = () => readLog(PLATFORM_LOG_PATH);
