import { proxyToSupabaseFunction } from './_coachProxy.js';

export default async function handler(req, res) {
  await proxyToSupabaseFunction(req, res, 'gemini-coach-summary');
}
