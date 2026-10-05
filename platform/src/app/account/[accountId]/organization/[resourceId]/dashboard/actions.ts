export type GetStatisticsState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string[]>;
    }
  | {
      status: "success";
      data: Record<string, unknown>;
    };

export async function getStatistics(_prevState: GetStatisticsState) {}
