import { z } from "zod";
export const TransactionDataSchema = z.object({
    transaction_id: z.string().optional(),
    timestamp: z.string(),
    type: z.string(),
    asset: z.string(),
    quantity: z
        .number()
        .or(z.string())
        .transform((val) => {
        const num = typeof val === "string" ? parseFloat(val) : val;
        return isNaN(num) ? -1 : num;
    }),
    price_usd: z
        .number()
        .or(z.string())
        .optional()
        .transform((val) => {
        if (val === undefined || val === "")
            return undefined;
        const num = typeof val === "string" ? parseFloat(val) : val;
        return isNaN(num) ? undefined : num;
    }),
    fee: z
        .number()
        .or(z.string())
        .optional()
        .transform((val) => {
        if (val === undefined || val === "")
            return undefined;
        const num = typeof val === "string" ? parseFloat(val) : val;
        return isNaN(num) ? undefined : num;
    }),
    note: z.string().optional(),
});
export const ReconciliationConfigSchema = z.object({
    timestampToleranceSeconds: z.number().min(0).max(86400).default(300),
    quantityTolerancePct: z.number().min(0).max(100).default(0.01),
});
