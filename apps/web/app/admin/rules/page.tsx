"use client";
import { useMemo, useState, useEffect } from "react";

type Rule = {
  id: string;
  jurisdiction: string;
  kind: string;
  delta_days: number;
  description?: string | null;
  source_url?: string | null;
  active: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "/api/joslyn";
const ADMIN_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY || "";

export default function AdminRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState("all");

  const headerKey = useMemo(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("adminKey");
      if (stored) return stored;
    }
    return ADMIN_KEY;
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/rules`, {
        headers: headerKey ? { "x-admin-api-key": headerKey } : {}
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(rule: Rule) {
    setSaving(rule.id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/rules/${rule.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(headerKey ? { "x-admin-api-key": headerKey } : {})
        },
        body: JSON.stringify({
          delta_days: Number(rule.delta_days) || 0,
          description: rule.description || null,
          source_url: rule.source_url || null,
          active: !!rule.active
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setSaving(null);
    }
  }

  function updateRule(id: string, patch: Partial<Rule>) {
    setRules((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      const matchesScope = scope === "all" || r.jurisdiction.toLowerCase().includes(scope.toLowerCase());
      const searchText = `${r.kind} ${r.description ?? ""}`.toLowerCase();
      const matchesSearch = searchText.includes(search.toLowerCase());
      return matchesScope && matchesSearch;
    });
  }, [rules, scope, search]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 py-8">
      <header className="space-y-3">
        <span className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-brand-600">
          Admin settings
        </span>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-3xl font-heading text-slate-900">Timeline rules</h1>
            <p className="text-sm text-slate-600">Tune how Joslyn calculates deadlines by jurisdiction and rule type.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
            {headerKey ? "Authenticated with admin key" : "Provide NEXT_PUBLIC_ADMIN_API_KEY to edit."}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <input
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm sm:w-64"
            placeholder="Search rules by kind or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="all">All jurisdictions</option>
            <option value="US-*">US (default)</option>
            <option value="CA">CA</option>
            <option value="NY">NY</option>
          </select>
        </div>
      </header>

      {loading && <div className="rounded-3xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">Loading rules…</div>}
      {error && <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filteredRules.map((rule) => (
          <article key={rule.id} className="flex h-full flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-brand-600">
                <span className="inline-flex items-center rounded-full border border-brand-200 px-3 py-1">{rule.jurisdiction}</span>
                <span className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 capitalize">{rule.kind.replace(/_/g, " ")}</span>
              </div>
              <label className="block space-y-1 text-xs uppercase tracking-wide text-slate-400">
                Delta days
                <input
                  type="number"
                  className="w-24 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  value={rule.delta_days}
                  onChange={(e) => updateRule(rule.id, { delta_days: Number(e.target.value) })}
                />
              </label>
              <label className="block space-y-1 text-xs uppercase tracking-wide text-slate-400">
                Description
                <textarea
                  className="h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  value={rule.description || ""}
                  onChange={(e) => updateRule(rule.id, { description: e.target.value })}
                />
              </label>
              <label className="block space-y-1 text-xs uppercase tracking-wide text-slate-400">
                Source
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  placeholder="https://..."
                  value={rule.source_url || ""}
                  onChange={(e) => updateRule(rule.id, { source_url: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <input type="checkbox" checked={!!rule.active} onChange={(e) => updateRule(rule.id, { active: e.target.checked })} />
                Active
              </label>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="inline-flex items-center rounded-full bg-brand-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-600 disabled:opacity-40"
                onClick={() => save(rule)}
                disabled={saving === rule.id}
              >
                {saving === rule.id ? "Saving…" : "Save changes"}
              </button>
            </div>
          </article>
        ))}
        {filteredRules.length === 0 && !loading && (
          <div className="col-span-full rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No rules match your filters.
          </div>
        )}
      </section>
    </div>
  );
}

