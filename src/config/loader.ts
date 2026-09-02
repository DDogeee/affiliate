import fs from 'fs';
import yaml from 'yaml';

export type TopicConfig = {
  id: string;
  displayName: string;
  keywords: string[];
  category: string;
  enabled: boolean;
};
export type AppConfig = {
  topics: TopicConfig[];
  sources: { enabled: string[] };
  products: { enabled: string[]; matching: { threshold: number; limit: number } };
  publishers: { enabled: string[]; requireReview: boolean };
};

let cached: AppConfig | null = null;
export function loadConfig(path = 'src/config/topics.yaml'): AppConfig {
  if (cached) return cached;
  const raw = fs.readFileSync(path, 'utf-8');
  cached = yaml.parse(raw) as AppConfig;
  return cached!;
}
