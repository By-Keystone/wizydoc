import type { Me } from "@/lib/auth/me";
import { doFetchJson } from "../fetch";
import type { MyProfile } from "./types";

export const tags = {
  myProfile: () => "user/me/profile",
};

export const usersApi = {
  // `doFetch` lanza `AuthExpiredError` en 401; `doFetchJson`, `ApiError` en
  // cualquier otro fallo.
  getMe: (): Promise<Me> => doFetchJson<Me>("/user/me"),

  // Sin `force-cache`: es un dato de cada usuario y no puede compartirse.
  getMyProfile: (): Promise<MyProfile> =>
    doFetchJson<MyProfile>("/user/me/profile", {
      next: { tags: [tags.myProfile()] },
    }),
};
