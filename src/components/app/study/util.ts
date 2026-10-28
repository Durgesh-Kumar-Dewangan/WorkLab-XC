import { toast } from '@/lib/ui/toast';
import type { ApiFail } from '@/lib/api/client';

export const apiErr = (e: unknown) => toast((e as ApiFail).message || 'That did not work. Try again.', 'err');
