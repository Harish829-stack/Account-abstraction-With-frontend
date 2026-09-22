export type HealthStatus = "ok" | "degraded" | "error";

export interface HealthCheckItem {
  status: HealthStatus | "disabled";
  message?: string;
  latencyMs?: number;
}

export interface HealthResponse {
  status: HealthStatus;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  checks?: Record<string, HealthCheckItem>;
}
