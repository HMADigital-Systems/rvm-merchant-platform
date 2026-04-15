import { ref } from 'vue';
import { supabase } from '../services/supabase';
import { FRAUD_DETECTION } from '../types';

export interface FraudCheckResult {
  isSuspicious: boolean;
  reason?: string;
}

export async function checkSubmissionFraud(
  userId: string,
  weight: number
): Promise<FraudCheckResult> {
  // 1. Check weight limit
  if (weight > FRAUD_DETECTION.MAX_ITEM_WEIGHT) {
    return {
      isSuspicious: true,
      reason: 'Weight Limit Exceeded'
    };
  }

  // 2. Check daily submission count
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { count, error } = await supabase
    .from('submission_reviews')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('submitted_at', today.toISOString())
    .lt('submitted_at', tomorrow.toISOString());

  if (!error && count && count >= FRAUD_DETECTION.MAX_DAILY_SUBMISSIONS) {
    return {
      isSuspicious: true,
      reason: 'High Frequency'
    };
  }

  // 3. Check for rapid submissions (within 10 seconds of last submission)
  const { data: lastSubmission } = await supabase
    .from('submission_reviews')
    .select('submitted_at')
    .eq('user_id', userId)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .single();

  if (lastSubmission) {
    const lastTime = new Date(lastSubmission.submitted_at).getTime();
    const currentTime = Date.now();
    if (currentTime - lastTime < 10000) {
      return {
        isSuspicious: true,
        reason: 'Rapid Submission'
      };
    }
  }

  return { isSuspicious: false };
}

export async function flagSuspiciousSubmissions(): Promise<number> {
  // Get all pending submissions from the last 24 hours
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const { data: submissions, error } = await supabase
    .from('submission_reviews')
    .select('*')
    .eq('status', 'Pending')
    .gte('submitted_at', yesterday.toISOString());

  if (error || !submissions) return 0;

  let flaggedCount = 0;

  for (const sub of submissions) {
    const result = await checkSubmissionFraud(sub.user_id, sub.api_weight);

    if (result.isSuspicious) {
      await supabase
        .from('submission_reviews')
        .update({
          is_suspicious: true,
          fraud_reason: result.reason,
          status: 'Flagged'
        })
        .eq('id', sub.id);

      flaggedCount++;
    }
  }

  return flaggedCount;
}