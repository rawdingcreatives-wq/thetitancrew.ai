'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const ProfileSchema = z.object({
  business_name: z.string().min(1, 'Business name is required').max(100),
  owner_name: z.string().min(1, 'Owner name is required').max(100),
  trade_type: z.string().min(1, 'Trade type is required'),
  phone: z.string().max(20).optional().or(z.literal('')),
});

export type ProfileUpdateResult =
  | { success: true }
  | { success: false; error: string };

export async function updateProfile(
  formData: FormData
): Promise<ProfileUpdateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Not authenticated' };

  const raw = {
    business_name: formData.get('business_name') as string,
    owner_name: formData.get('owner_name') as string,
    trade_type: formData.get('trade_type') as string,
    phone: (formData.get('phone') as string) ?? '',
  };

  const parsed = ProfileSchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? 'Invalid input';
    return { success: false, error: msg };
  }

  const { error } = await supabase
    .from('accounts')
    .update({
      business_name: parsed.data.business_name,
      owner_name: parsed.data.owner_name,
      trade_type: parsed.data.trade_type,
      phone: parsed.data.phone ?? null,
    })
    .eq('owner_user_id', user.id);

  if (error) return { success: false, error: error.message };

  revalidatePath('/settings');
  return { success: true };
}
