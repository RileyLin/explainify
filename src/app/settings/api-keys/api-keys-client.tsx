"use client";

import { useState, useEffect, useCallback } from "react";
import { Key, Plus, Trash2, Copy, Check, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";

interface ApiKey {
  id: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  masked_key: string;
}

export function ApiKeysClient() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create key modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [copiedNewKey, setCopiedNewKey] = useState(false);

  // Revoke state
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/keys");
      if (!res.ok) throw new Error("Failed to load API keys");
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName || "My API Key" }),
      });
      if (!res.ok) throw new Error("Failed to create API key");
      const data = await res.json();
      setNewKeyValue(data.key);
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    setRevokingId(id);
    try {
      const res = await fetch(`/api/v1/keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke key");
      await fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setRevokingId(null);
    }
  };

  const copyKey = () => {
    if (!newKeyValue) return;
    navigator.clipboard.writeText(newKeyValue);
    setCopiedNewKey(true);
    setTimeout(() => setCopiedNewKey(false), 2000);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setNewKeyName("");
    setNewKeyValue(null);
    setCopiedNewKey(false);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Key size={16} className="text-blue-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">API Keys</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Use API keys to call the Explainify REST API from your own applications.
          </p>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-50 dark:bg-red-950/20 flex items-start gap-3">
            <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {/* Create button */}
        <div className="flex justify-end mb-6">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-all shadow-sm"
          >
            <Plus size={16} />
            Create new key
          </button>
        </div>

        {/* Keys table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-xl">
            <Key size={32} className="text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">No API keys yet</p>
            <p className="text-xs text-muted-foreground mb-4">
              Create a key to start using the Explainify API
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-all"
            >
              <Plus size={14} />
              Create your first key
            </button>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden bg-card">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">Key</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Created</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wide hidden md:table-cell">Last used</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key, i) => (
                  <tr key={key.id} className={i < keys.length - 1 ? "border-b border-border" : ""}>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{key.name}</td>
                    <td className="px-4 py-3">
                      <code className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                        {key.masked_key}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                      {formatDate(key.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                      {formatDate(key.last_used_at)}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRevoke(key.id)}
                        disabled={revokingId === key.id}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50 transition-all"
                        title="Revoke key"
                      >
                        {revokingId === key.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                        <span className="hidden sm:inline">Revoke</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* API Usage docs */}
        <div className="mt-8 p-5 rounded-xl border border-border bg-card">
          <h3 className="text-sm font-semibold text-foreground mb-3">Quick start</h3>
          <pre className="text-xs text-muted-foreground bg-muted rounded-lg p-3 overflow-x-auto">
{`curl -X POST https://explainify.driftworks.dev/api/v1/explain \\
  -H "Authorization: Bearer expl_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"content": "Your content here", "template": "flow-animator"}'`}
          </pre>
          <p className="text-xs text-muted-foreground mt-3">
            Returns <code className="text-xs bg-muted px-1 py-0.5 rounded">{"{ url, slug, data, png_url }"}</code> with a shareable link to your explainer.
          </p>
        </div>
      </div>

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
            {!newKeyValue ? (
              <>
                <h2 className="text-lg font-semibold text-foreground mb-1">Create API Key</h2>
                <p className="text-sm text-muted-foreground mb-5">
                  Give your key a descriptive name (e.g. &quot;My App&quot;, &quot;Production&quot;).
                </p>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="My API Key"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 mb-4"
                  onKeyDown={(e) => e.key === "Enter" && !creating && handleCreate()}
                />
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={creating}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-50 transition-all"
                  >
                    {creating ? <Loader2 size={14} className="animate-spin" /> : <Key size={14} />}
                    {creating ? "Creating..." : "Create key"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  <Check size={18} className="text-green-500" />
                  <h2 className="text-lg font-semibold text-foreground">Key Created!</h2>
                </div>
                <p className="text-sm text-amber-600 dark:text-amber-400 mb-4 flex items-start gap-2">
                  <Eye size={14} className="mt-0.5 shrink-0" />
                  Copy your key now — it won&apos;t be shown again for security reasons.
                </p>
                <div className="flex items-center gap-2 mb-4">
                  <code className="flex-1 px-3 py-2 rounded-xl border border-border bg-muted text-xs font-mono text-foreground break-all">
                    {newKeyValue}
                  </code>
                  <button
                    onClick={copyKey}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-all shrink-0"
                  >
                    {copiedNewKey ? <Check size={14} /> : <Copy size={14} />}
                    {copiedNewKey ? "Copied!" : "Copy"}
                  </button>
                </div>
                <button
                  onClick={closeModal}
                  className="w-full px-4 py-2 rounded-xl bg-muted text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
