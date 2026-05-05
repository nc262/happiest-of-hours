import { z } from "zod";

export const VenuePricesSchema = z.object({
  beer: z.number().optional(),
  cocktail: z.number().optional(),
  wine: z.number().optional(),
});

export const HappyHourVenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  distance: z.string().optional(),
  rating: z.number().optional(),
  priceLevel: z.string().optional(),
  happyHourTimes: z.string().optional(),
  deals: z.array(z.string()),
  matchScore: z.number().min(0).max(100),
  matchReason: z.string(),
  phone: z.string().optional(),
  website: z.string().optional(),
  openNow: z.boolean().optional(),
  categories: z.array(z.string()),
  regularPrices: VenuePricesSchema.optional(),
  happyHourPrices: VenuePricesSchema.optional(),
  todayHappyHourStart: z.string().nullable().optional(),
  todayHappyHourEnd: z.string().nullable().optional(),
});

export const SearchResponseSchema = z.object({
  venues: z.array(HappyHourVenueSchema),
  summary: z.string(),
  searchLocation: z.string(),
  currentTime: z.string(),
  qualityScore: z.number().min(0).max(100).optional(),
  retriedWithCritique: z.boolean().optional(),
});

export type ValidatedVenue = z.infer<typeof HappyHourVenueSchema>;
export type ValidatedSearchResponse = z.infer<typeof SearchResponseSchema>;
