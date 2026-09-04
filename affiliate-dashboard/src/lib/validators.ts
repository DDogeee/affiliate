import { z } from "zod";

export const weiboUrlSchema = z
  .string()
  .url("Must be a valid URL")
  .refine((u) => {
    try {
      const h = new URL(u).hostname.toLowerCase();
      return h === "weibo.com" || h === "weibo.cn" || h.endsWith(".weibo.com") || h.endsWith(".weibo.cn");
    } catch {
      return false;
    }
  }, {
    message: "Must be weibo.com or weibo.cn",
  });

export type WeiboUrl = z.infer<typeof weiboUrlSchema>;
