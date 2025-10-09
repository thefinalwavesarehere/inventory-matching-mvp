'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 md:p-24 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="z-10 max-w-5xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-block px-4 py-2 mb-6 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium">
            MVP Demo
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Arnold Motor Supply
          </h1>
          <h2 className="text-2xl md:text-3xl font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Inventory Matching System
          </h2>
          <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            AI-powered intelligent matching between your inventory and supplier catalogs. 
            Streamline procurement and reduce manual data entry.
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <Link
            href="/demo"
            className="group relative overflow-hidden rounded-xl border-2 border-transparent bg-white dark:bg-gray-800 p-8 shadow-lg transition-all hover:shadow-xl hover:border-blue-500 hover:-translate-y-1"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500 rounded-full -mr-16 -mt-16 opacity-10 group-hover:opacity-20 transition-opacity"></div>
            <div className="relative">
              <div className="text-4xl mb-4">🎯</div>
              <h3 className="text-2xl font-semibold mb-3 flex items-center">
                View Demo
                <span className="ml-2 inline-block transition-transform group-hover:translate-x-2">
                  →
                </span>
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                See the matching system in action with pre-loaded sample data. 
                Explore match confidence scores and detailed comparisons.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-xs font-medium">
                  Live Demo
                </span>
                <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-xs font-medium">
                  Test Data
                </span>
              </div>
            </div>
          </Link>

          <div className="group relative overflow-hidden rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-8 shadow-lg opacity-75">
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500 rounded-full -mr-16 -mt-16 opacity-10"></div>
            <div className="relative">
              <div className="text-4xl mb-4">📤</div>
              <h3 className="text-2xl font-semibold mb-3 flex items-center text-gray-500 dark:text-gray-400">
                Upload Files
                <span className="ml-2 text-xs px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded-full">
                  Coming Soon
                </span>
              </h3>
              <p className="text-gray-500 dark:text-gray-500 mb-4">
                Upload your own inventory files to begin the matching process. 
                Supports Excel and CSV formats for both Arnold and supplier data.
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-xs font-medium">
                  Excel Support
                </span>
                <span className="px-3 py-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-xs font-medium">
                  CSV Support
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Features List */}
        <div className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg">
          <h3 className="text-xl font-semibold mb-6 text-center">Key Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl mb-3">🔍</div>
              <h4 className="font-semibold mb-2">Smart Matching</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Advanced algorithms compare part numbers, descriptions, and line codes
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-3">📊</div>
              <h4 className="font-semibold mb-2">Confidence Scores</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Each match includes a confidence score and detailed reasoning
              </p>
            </div>
            <div className="text-center">
              <div className="text-3xl mb-3">⚡</div>
              <h4 className="font-semibold mb-2">Fast Processing</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Process thousands of items in seconds with efficient algorithms
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Arnold Motor Supply - Inventory Matching System MVP</p>
          <p className="mt-2">Built with Next.js, React, and TypeScript</p>
        </div>
      </div>
    </main>
  );
}

