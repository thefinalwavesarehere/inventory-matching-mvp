'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Home() {
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/upload');
      const data = await response.json();
      if (data.success) {
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-8 md:p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm flex">
        <p className="fixed left-0 top-0 flex w-full justify-center border-b border-gray-300 bg-gradient-to-b from-zinc-200 pb-6 pt-8 backdrop-blur-2xl dark:border-neutral-800 dark:bg-zinc-800/30 dark:from-inherit lg:static lg:w-auto lg:rounded-xl lg:border lg:bg-gray-200 lg:p-4 lg:dark:bg-zinc-800/30">
          Inventory Matching System - Production Ready
        </p>
      </div>

      <div className="relative flex place-items-center flex-col">
        <h1 className="text-4xl font-bold text-center mb-4">
          Arnold Motor Supply<br />
          <span className="text-2xl">AI-Powered Inventory Matching</span>
        </h1>
        <p className="text-center text-gray-600 dark:text-gray-400 max-w-2xl">
          Automatically match and normalize inventory data between Arnold's internal system and supplier catalogs.
          Multi-stage matching with AI-powered web search fallback for unmatched parts.
        </p>
      </div>

      <div className="mb-32 w-full max-w-5xl">
        {/* Quick Actions */}
        <div className="grid text-center lg:max-w-5xl lg:w-full lg:mb-8 lg:grid-cols-2 lg:text-left gap-8">
          <Link
            href="/upload"
            className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          >
            <h2 className={`mb-3 text-2xl font-semibold`}>
              Upload Files{' '}
              <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                →
              </span>
            </h2>
            <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
              Upload Arnold inventory, supplier catalogs, interchange files, or inventory reports.
            </p>
          </Link>

          <Link
            href="/demo"
            className="group rounded-lg border border-transparent px-5 py-4 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
          >
            <h2 className={`mb-3 text-2xl font-semibold`}>
              View Demo{' '}
              <span className="inline-block transition-transform group-hover:translate-x-1 motion-reduce:transform-none">
                →
              </span>
            </h2>
            <p className={`m-0 max-w-[30ch] text-sm opacity-50`}>
              See a demonstration of the matching system with sample data.
            </p>
          </Link>
        </div>

        {/* Recent Projects */}
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4">Recent Projects</h2>
          
          {isLoading ? (
            <div className="flex justify-center items-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-black"></div>
            </div>
          ) : projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.slice(0, 6).map((project) => (
                <div
                  key={project.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                >
                  <h3 className="font-semibold text-lg mb-2">{project.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {project.uploadSessions.length} file(s) uploaded
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-4">
                    Created: {new Date(project.createdAt).toLocaleDateString()}
                  </p>
                  <div className="flex space-x-2">
                    <Link
                      href={`/match?projectId=${project.id}`}
                      className="text-sm px-3 py-1 bg-black text-white rounded hover:bg-gray-800"
                    >
                      View Matches
                    </Link>
                    <Link
                      href={`/upload?projectId=${project.id}`}
                      className="text-sm px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200"
                    >
                      Add Files
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-100 dark:bg-gray-800 p-8 rounded-lg text-center">
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                No projects yet. Upload your first file to get started!
              </p>
              <Link
                href="/upload"
                className="inline-block px-6 py-3 bg-black text-white rounded-md hover:bg-gray-800"
              >
                Upload Files
              </Link>
            </div>
          )}
        </div>

        {/* Features */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-4">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="font-semibold mb-2">🎯 Multi-Stage Matching</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Part number → Part name → Description → Web search fallback
              </p>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="font-semibold mb-2">🤖 AI-Powered Search</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Automatic web search for unmatched parts using OpenAI
              </p>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="font-semibold mb-2">✅ Human-in-the-Loop</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Review, confirm, or reject matches with enrichment data
              </p>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="font-semibold mb-2">📊 Comprehensive Reports</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Export unmatched parts and confirmed matches to Excel
              </p>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="font-semibold mb-2">📁 Project Management</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Group files into projects for organized workflow
              </p>
            </div>
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="font-semibold mb-2">💾 Persistent Storage</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                All data saved to Supabase PostgreSQL database
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
