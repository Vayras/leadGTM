import { getCurrentUser } from '@/lib/auth/local';

export async function getUser() {
  return getCurrentUser();
}
