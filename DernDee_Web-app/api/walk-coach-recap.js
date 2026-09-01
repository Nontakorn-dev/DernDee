import { proxyCoachRequest } from './_coachProxy.js';

export default async function handler(req, res) {
  return proxyCoachRequest(req, res, 'gemini-coach-summary');
}
