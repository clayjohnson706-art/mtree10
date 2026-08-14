import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/src/utils/api";
import { useAuth } from "@/src/context/AuthContext";

export type AppConfig = {
  ads_enabled: boolean;
  subscriptions_enabled: boolean;
  donations_enabled: boolean;
  community_premium_required: boolean;
  subscription_prices: Record<string, number>;
  donation_prices: number[];
};

const DEFAULT_CONFIG: AppConfig = {
  ads_enabled: false,
  subscriptions_enabled: false,
  donations_enabled: false,
  community_premium_required: false,
  subscription_prices: { first_month: 29, monthly: 49, "6_month": 249, yearly: 399 },
  donation_prices: [101, 201, 501, 1001, 10001, 50001],
};

const Context = createContext<AppConfig>(DEFAULT_CONFIG);
export const useAppConfig = () => useContext(Context);

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  useEffect(() => {
    if (!user) return;
    api<AppConfig>("/app-config").then(setConfig).catch(() => {});
  }, [user?.user_id]);
  return <Context.Provider value={config}>{children}</Context.Provider>;
}