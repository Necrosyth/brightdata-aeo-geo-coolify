"use client";

import { useState, useEffect } from "react";
import { Loader2, Trash2, Save, RefreshCw } from "lucide-react";

interface WebsiteData {
  id: string;
  sourceUrl: string;
  sectionName: string;
  title: string | null;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastScrapedAt: string | null;
}

const HYPOTENUSE_URLS = [
  "https://www.hypotenuseanalytics.com/home",
  "https://www.hypotenuseanalytics.com/faq",
];

export default function WebsiteDataTab() {
  const [data, setData] = useState<WebsiteData[]>([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/website-data");
      if (!response.ok) throw new Error("Failed to load data");
      const { data: websiteData } = await response.json();
      setData(websiteData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleScrape = async () => {
    try {
      setScraping(true);
      setError(null);
      const response = await fetch("/api/scrape-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: HYPOTENUSE_URLS }),
      });

      if (!response.ok) throw new Error("Failed to scrape website");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setScraping(false);
    }
  };

  const handleEdit = (id: string, content: string) => {
    setEditingId(id);
    setEditContent({ [id]: content });
  };

  const handleSaveEdit = async (id: string) => {
    try {
      setError(null);
      const response = await fetch("/api/website-data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          content: editContent[id],
        }),
      });

      if (!response.ok) throw new Error("Failed to save changes");
      const { data: updated } = await response.json();
      setData(data.map((d) => (d.id === id ? updated : d)));
      setEditingId(null);
      setEditContent({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this entry?")) {
      return;
    }

    try {
      setError(null);
      const response = await fetch("/api/website-data", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) throw new Error("Failed to delete");
      setData(data.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Website Data Manager</h2>
        <div className="flex gap-2">
          <button
            onClick={handleScrape}
            disabled={scraping || loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {scraping ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {scraping ? "Scraping..." : "Scrape Website"}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      )}

      {/* Data List */}
      {!loading && data.length > 0 && (
        <div className="space-y-3">
          {data.map((item) => (
            <div key={item.id} className="border rounded-lg p-4 bg-white">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    {item.title || item.sectionName}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {new URL(item.sourceUrl).pathname}
                  </p>
                </div>
                <div className="flex gap-2">
                  {editingId === item.id ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(item.id)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEdit(item.id, item.content)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Content */}
              {editingId === item.id ? (
                <textarea
                  value={editContent[item.id] || ""}
                  onChange={(e) =>
                    setEditContent({
                      ...editContent,
                      [item.id]: e.target.value,
                    })
                  }
                  className="w-full h-32 p-3 border rounded font-mono text-sm resize-none focus:outline-none focus:border-blue-500"
                />
              ) : (
                <p className="text-gray-700 text-sm line-clamp-3">
                  {item.content}
                </p>
              )}

              {/* Metadata */}
              <div className="mt-3 pt-3 border-t text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>
                    Updated: {new Date(item.updatedAt).toLocaleString()}
                  </span>
                  {item.lastScrapedAt && (
                    <span>
                      Scraped: {new Date(item.lastScrapedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && data.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No website data loaded yet.</p>
          <p className="text-sm mt-2">
            Click "Scrape Website" to import data from Hypotenuse Analytics.
          </p>
        </div>
      )}
    </div>
  );
}
