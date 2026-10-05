import type { Me } from "@/lib/auth/me";
import { doFetchJson } from "../fetch";

export const usersApi = {
  // `doFetch` lanza `AuthExpiredError` en 401; `doFetchJson`, `ApiError` en
  // cualquier otro fallo.
  getMe: (): Promise<Me> => doFetchJson<Me>("/user/me"),
};
