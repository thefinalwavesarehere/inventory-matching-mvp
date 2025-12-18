import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Session, User } from '@supabase/supabase-js';
import type { UserProfile } from '@prisma/client';

interface CurrentUser {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isAdmin: boolean;
  isEditor: boolean;
  isViewer: boolean;
}

export function useCurrentUser(): CurrentUser {
  const supabase = createClientComponentClient();
  
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) throw sessionError;
        
        setSession(session);
        setUser(session?.user || null);

        // Fetch user profile if session exists
        if (session?.user) {
          const res = await fetch('/api/user/me');
          if (res.ok) {
            const data = await res.json();
            setProfile(data.profile);
          } else {
            console.error('Failed to fetch user profile');
          }
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user || null);

        if (session?.user) {
          // Fetch updated profile
          const res = await fetch('/api/user/me');
          if (res.ok) {
            const data = await res.json();
            setProfile(data.profile);
          }
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  return {
    session,
    user,
    profile,
    loading,
    error,
    isAdmin: profile?.role === 'ADMIN',
    isEditor: profile?.role === 'EDITOR',
    isViewer: profile?.role === 'VIEWER',
  };
}
