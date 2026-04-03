/**
 * supabase-config.js — Configuration Supabase
 *
 * Remplacer VOTRE_URL et VOTRE_ANON_KEY par les valeurs de votre projet :
 * Supabase Dashboard > Project Settings > API
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = 'https://lwgrjdpuagnvvzmdbyzb.supabase.co';
const SUPABASE_KEY  = 'sb_publishable_xxnL12zd9o5N30y1-Oi-0Q_YGYKMjh2';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
