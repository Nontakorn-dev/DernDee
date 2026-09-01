import { proxyCoachRequest } from './_coachProxy.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  return proxyCoachRequest(request, 'gemini-coach-summary');
}
