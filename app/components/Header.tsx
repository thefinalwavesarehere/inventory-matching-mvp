'use client';

import { useRouter } from 'next/navigation';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function Header() {
  const router = useRouter();
  const { profile, isLoading } = useCurrentUser();
  const supabase = createClientComponentClient();

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (error) {
      console.error('Error signing out:', error);
      alert('Failed to sign out');
    }
  };

  if (isLoading) {
    return (
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="h-8 w-48 bg-gray-200 animate-pulse rounded"></div>
            <div className="h-8 w-24 bg-gray-200 animate-pulse rounded"></div>
          </div>
        </div>
      </header>
    );
  }

  if (!profile) {
    return null; // Don't show header on login page
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN':
        return 'bg-purple-100 text-purple-800';
      case 'EDITOR':
        return 'bg-blue-100 text-blue-800';
      case 'VIEWER':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return email[0].toUpperCase();
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex justify-between items-center">
          {/* Left: Logo/Title */}
          <button
            onClick={() => router.push('/')}
            className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
          >
            <div className="text-2xl">📦</div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">
                Inventory Matching
              </h1>
              <p className="text-xs text-gray-500">Arnold Motor Supply</p>
            </div>
          </button>

          {/* Right: User Menu */}
          <div className="flex items-center space-x-4">
            {/* User Info */}
            <div className="flex items-center space-x-3">
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
                {getInitials(profile.full_name, profile.email)}
              </div>

              {/* Name & Role */}
              <div className="hidden md:block text-right">
                <div className="text-sm font-medium text-gray-900">
                  {profile.full_name || 'No name'}
                </div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRoleBadgeColor(
                      profile.role
                    )}`}
                  >
                    {profile.role}
                  </span>
                </div>
              </div>
            </div>

            {/* Profile Button */}
            <button
              onClick={() => router.push('/profile')}
              className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Profile
            </button>

            {/* Admin Button (if admin) */}
            {profile.role === 'ADMIN' && (
              <button
                onClick={() => router.push('/admin/users')}
                className="px-3 py-2 text-sm font-medium text-purple-700 hover:bg-purple-50 rounded-md transition-colors"
              >
                Admin
              </button>
            )}

            {/* Sign Out Button */}
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
