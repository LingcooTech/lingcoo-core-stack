import { z } from 'zod';
export const openRouterModelsSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
      context_length: z.number().nullable().optional(),
      architecture: z
        .object({
          modality: z.string().nullable().optional(),
          input_modalities: z.array(z.string()).optional(),
          output_modalities: z.array(z.string()).optional(),
        })
        .optional(),
      top_provider: z
        .object({ max_completion_tokens: z.number().nullable().optional() })
        .optional(),
      pricing: z
        .object({
          prompt: z.string().nullable().optional(),
          completion: z.string().nullable().optional(),
        })
        .optional(),
    }),
  ),
});
export const openRouterCompletionSchema = z.object({
  id: z.string().optional(),
  created: z.number().optional(),
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({ content: z.string().nullable().optional() }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
