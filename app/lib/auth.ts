/**
 * NextAuth Configuration
 * 
 * Provides authentication with credentials provider and RBAC.
 */

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.passwordHash) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  secret: process.env.NEXTAUTH_SECRET,
};

/**
 * Role-based access control helpers
 */

export type Role = 'ADMIN' | 'MANAGER' | 'REVIEWER' | 'UPLOADER';

export const roleHierarchy: Record<Role, number> = {
  ADMIN: 4,
  MANAGER: 3,
  REVIEWER: 2,
  UPLOADER: 1,
};

export function hasRole(userRole: Role, requiredRole: Role): boolean {
  return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
}

export function canUpload(role: Role): boolean {
  return hasRole(role, 'UPLOADER');
}

export function canReview(role: Role): boolean {
  return hasRole(role, 'REVIEWER');
}

export function canManage(role: Role): boolean {
  return hasRole(role, 'MANAGER');
}

export function canAdmin(role: Role): boolean {
  return hasRole(role, 'ADMIN');
}

/**
 * Get current user from session
 */
export async function getCurrentUser(session: any) {
  if (!session?.user?.email) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  return user;
}

/**
 * Require authentication middleware
 */
export function requireAuth(handler: Function) {
  return async (req: Request, context: any) => {
    const session = await getServerSession(authOptions);
    
    if (!session) {
      return Response.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    return handler(req, context, session);
  };
}

/**
 * Require role middleware
 */
export function requireRole(requiredRole: Role) {
  return (handler: Function) => {
    return async (req: Request, context: any) => {
      const session = await getServerSession(authOptions);
      
      if (!session) {
        return Response.json(
          { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
          { status: 401 }
        );
      }

      const user = await getCurrentUser(session);
      
      if (!user || !hasRole(user.role as Role, requiredRole)) {
        return Response.json(
          { error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
          { status: 403 }
        );
      }

      return handler(req, context, session, user);
    };
  };
}

// Re-export getServerSession for convenience
export { getServerSession } from 'next-auth';
