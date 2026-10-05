type Environment = typeof process.env.NODE_ENV;

type FeatureFlags = {
  NOTIFICATIONS_ENABLED: boolean;
};

export const config: Record<Environment, FeatureFlags> = {
  production: {
    NOTIFICATIONS_ENABLED: false,
  },
  test: {
    NOTIFICATIONS_ENABLED: false,
  },
  development: {
    NOTIFICATIONS_ENABLED: false,
  },
};
