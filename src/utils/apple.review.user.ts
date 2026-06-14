import {
  VIEW_ONLY_AGENT_EMAIL,
  VIEW_ONLY_AGENT_USERNAME,
} from '../constants/apple.review.user';

type ReviewUserLike = {
  email?: string | null;
  username?: string | null;
};

export function isAppleReviewUser(user: ReviewUserLike | null | undefined): boolean {
  if (!user) return false;
  const email = (user.email ?? '').trim().toLowerCase();
  const username = (user.username ?? '').trim().toLowerCase();
  return email === VIEW_ONLY_AGENT_EMAIL || username === VIEW_ONLY_AGENT_USERNAME;
}

export function isReadOnlyHttpMethod(method: string): boolean {
  const m = (method || '').toUpperCase();
  return m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
}
