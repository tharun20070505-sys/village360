import { rateLimit } from 'express-rate-limit';

const isTest = process.env.NODE_ENV === 'test';

// Standard rate limiter response format
const createMessage = (msg) => ({
  error: msg,
  retryAfter: 'Please wait before making additional requests.'
});

// 1. General API rate limiter: 300 reqs/min (generous in tests)
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 5000 : 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: createMessage('API rate limit reached. Please retry shortly.')
});

// 2. Strict Auth rate limiter: 15 attempts / 15 minutes to block brute-force attacks
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 5000 : 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: createMessage('Too many login attempts. Please try again after 15 minutes.')
});

// 3. Survey submission rate limiter: 60 submissions / 5 min per IP to prevent duplicate floods
export const surveySubmissionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: isTest ? 5000 : 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: createMessage('Survey submission rate limit reached. Please wait before submitting more.')
});
