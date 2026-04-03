/**
 * supabase-config.js — Configuration Supabase
 *
 * Remplacer VOTRE_URL et VOTRE_ANON_KEY par les valeurs de votre projet :
 * Supabase Dashboard > Project Settings > API
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = 'VOTRE_URL';       // ex: https://abcdefg.supabase.co
const SUPABASE_KEY  = 'VOTRE_ANON_KEY';  // ex: eyJhbGciOiJIUzI1NiIs...

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
