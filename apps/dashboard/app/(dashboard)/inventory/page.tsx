// @ts-nocheck
/**
 * TitanCrew · Inventory Page
 * Parts and materials tracking with AI reorder alerts.
 */

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Package, AlertTriangle, CheckCircle2, TrendingDown, Plus, Zap } from "lucide-react";

export default async function InventoryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("accounts")
    .select("id, business_name")
    .eq("owner_user_id", user.id)
    .single();
  if (!account) redirect("/login");

  // Fetch inventory items if table exists
  const { data: items, error } = await supabase
    .from("inventory_items")
    .select("*")
    .eq("account_id", account.id)
    .order("quantity_on_hand", { ascending: true });

  const hasTable = !error || !error.message?.includes("does not exist");
  const inventory = hasTable ? (items ?? []) : [];

  const lowStock = inventory.filter(i => i.quantity_on_hand <= (i.reorder_point ?? 2));
  const totalItems = inventory.length;
  const totalValue = inventory.reduce((s, i) => s + (i.quantity_on_hand * (i.unit_cost ?? 0)), 0);

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1A2744]">Inventory</h1>
          <p className="text-sm text-slate-500 mt-1">Parts, materials, and AI reorder alerts</p>
        </div>
        <button className="flex items-center gap-2 bg-[#FF6B00] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-600 transition-colors shadow-sm">
          <Plus className="w-4 h-4" />
          Add Part
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Parts", value: totalItems, icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Low Stock", value: lowStock.length, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
          { label: "Stocked OK", value: totalItems - lowStock.length, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Inventory Value", value: `$${totalValue.toLocaleString()}`, icon: TrendingDown, color: "text-[#FF6B00]", bg: "bg-orange-50" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <div className={`w-9 h-9 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className="text-2xl font-extrabold text-[#1A2744]">{stat.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Low stock alerts */}
      {lowStock.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-800">{lowStock.length} items need reorder</span>
            <span className="ml-auto text-xs bg-orange-100 text-[#FF6B00] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
              <Zap className="w-3 h-3" /> Parts AI monitoring
            </span>
          </div>
          <div className="space-y-2">
            {lowStock.map((item) => (
              <div key={item.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-red-100">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                <span className="text-sm font-medium text-[#1A2744] flex-1">{item.name}</span>
                <span className="text-xs text-red-700 font-semibold">{item.quantity_on_hand} left</span>
                <span className="text-xs text-slate-400">(min: {item.reorder_point ?? 2})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full inventory table */}
      {inventory.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Package className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-[#1A2744] mb-2">No inventory tracked yet</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
            Add your common parts and materials. Parts AI will monitor stock levels and alert you before you run out on the job.
          </p>
          <div className="bg-orange-50 rounded-lg p-4 text-left max-w-sm mx-auto border border-orange-100">
            <p className="text-xs font-semibold text-[#FF6B00] flex items-center gap-1.5 mb-1.5">
              <Zap className="w-3.5 h-3.5" /> Parts AI Features
            </p>
            <ul className="text-xs text-slate-600 space-y-1">
              <li>• Auto-detects usage from job records</li>
              <li>• Sends reorder alerts before you run low</li>
              <li>• Tracks supplier pricing over time</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Part / Material</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">SKU</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">On Hand</th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Reorder At</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3 hidden md:table-cell">Unit Cost</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {inventory.map((item) => {
                  const isLow = item.quantity_on_hand <= (item.reorder_point ?? 2);
                  return (
                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${isLow ? "bg-red-50/30" : ""}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isLow ? "bg-red-100" : "bg-slate-100"}`}>
                            <Package className={`w-4 h-4 ${isLow ? "text-red-500" : "text-slate-400"}`} />
                          </div>
                          <span className="text-sm font-semibold text-[#1A2744]">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-slate-500 font-mono">{item.sku || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-bold ${isLow ? "text-red-600" : "text-[#1A2744]"}`}>
                          {item.quantity_on_hand}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm text-slate-500">{item.reorder_point ?? 2}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-sm text-slate-600">
                          {item.unit_cost ? `$${item.unit_cost}` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isLow ? (
                          <span className="text-xs bg-red-100 text-red-700 font-semibold px-2.5 py-1 rounded-full">Low Stock</span>
                        ) : (
                          <span className="text-xs bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-1 rounded-full">OK</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
