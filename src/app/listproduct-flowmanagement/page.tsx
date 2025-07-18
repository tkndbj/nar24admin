"use client";

import React, { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  CollectionReference,
  Timestamp,
} from "firebase/firestore";
import {
  Play,
  Pause,
  Edit3,
  Copy,
  Trash2,
  Plus,
  Download,
  Upload,
  Eye,
  CheckCircle,
  Users,
  BarChart3,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";

import {
  categories,
  subcategoriesMap,
  subSubcategoriesMap,
} from "@/constants/productData";
import { flutterScreens } from "@/constants/list_product_screens";

interface FlowStep {
  id: string;
  stepType: string;
  title: string;
  required: boolean;
  nextSteps: { stepId: string; conditions?: Record<string, string[]> }[];
}

interface ProductListingFlow {
  id: string;
  name: string;
  description: string;
  version: string;
  isActive: boolean;
  isDefault: boolean;
  startStepId: string;
  steps: Record<string, FlowStep>;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  usageCount?: number;
  completionRate?: number;
}

const flowsCol = collection(
  db,
  "product_flows"
) as CollectionReference<ProductListingFlow>;

export default function FlowManagementPage() {
  const [flows, setFlows] = useState<ProductListingFlow[]>([]);

  // subscribe in real time
  useEffect(() => {
    const unsub = onSnapshot(flowsCol, (snap) => {
      const arr = snap.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          createdAt:
            (data.createdAt as unknown as Timestamp)?.toDate() ?? new Date(),
          updatedAt:
            (data.updatedAt as unknown as Timestamp)?.toDate() ?? new Date(),
        } as ProductListingFlow;
      });
      setFlows(arr);
    });
    return unsub;
  }, []);

  const [selectedFlow, setSelectedFlow] = useState<ProductListingFlow | null>(
    null
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);

  // Create‐modal state:
  const [newCategory, setNewCategory] = useState("");
  const [newSubcategory, setNewSubcategory] = useState("");
  const [newSubSubcategory, setNewSubSubcategory] = useState("");
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDesc, setNewFlowDesc] = useState("");
  const [newScreens, setNewScreens] = useState<string[]>([]);

  // Updated to toggle individual flows instead of deactivating all others
  const handleToggleFlow = async (flowId: string, currentState: boolean) => {
    setLoading(true);
    try {
      await updateDoc(doc(db, "product_flows", flowId), {
        isActive: !currentState,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error toggling flow:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCloneFlow = async (flow: ProductListingFlow) => {
    const id = `${flow.id}_copy_${Date.now()}`;
    await setDoc(doc(db, "product_flows", id), {
      ...flow,
      id,
      name: flow.name + " (Copy)",
      isActive: false,
      isDefault: false,
      usageCount: 0,
      completionRate: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const handleDeleteFlow = async (flowId: string) => {
    if (!confirm("Delete this flow?")) return;
    await deleteDoc(doc(db, "product_flows", flowId));
  };

  const getStepCount = (flow: ProductListingFlow) =>
    Object.keys(flow.steps).length;

  const getFlowComplexity = (flow: ProductListingFlow) => {
    const n = getStepCount(flow);
    if (n <= 3) return { label: "Simple", color: "text-green-400" };
    if (n <= 6) return { label: "Medium", color: "text-yellow-400" };
    return { label: "Complex", color: "text-red-400" };
  };

  // Screen order management
  const moveScreen = (index: number, direction: "up" | "down") => {
    const newOrder = [...newScreens];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex >= 0 && targetIndex < newOrder.length) {
      [newOrder[index], newOrder[targetIndex]] = [
        newOrder[targetIndex],
        newOrder[index],
      ];
      setNewScreens(newOrder);
    }
  };

  const removeScreen = (index: number) => {
    setNewScreens(newScreens.filter((_, i) => i !== index));
  };

  const addScreen = (screenId: string) => {
    if (!newScreens.includes(screenId)) {
      setNewScreens([...newScreens, screenId]);
    }
  };

  const resetCreateModal = () => {
    setNewCategory("");
    setNewSubcategory("");
    setNewSubSubcategory("");
    setNewFlowName("");
    setNewFlowDesc("");
    setNewScreens([]);
    setShowCreateModal(false);
  };

  const activeFlowsCount = flows.filter((f) => f.isActive).length;
  const totalUsage = flows.reduce((s, f) => s + (f.usageCount || 0), 0);
  const avgCompletion =
    flows.length > 0
      ? Math.round(
          flows.reduce((s, f) => s + (f.completionRate || 0), 0) / flows.length
        )
      : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Product Flow Management
            </h1>
            <p className="text-gray-300">
              Configure dynamic product listing flows
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Flow
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
              <Upload className="w-4 h-4" /> Import
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Flows", value: flows.length, icon: <BarChart3 /> },
            {
              label: "Active Flows",
              value: activeFlowsCount,
              icon: <CheckCircle />,
            },
            {
              label: "Total Usage",
              value: totalUsage,
              icon: <Users />,
            },
            {
              label: "Avg Completion",
              value: avgCompletion + "%",
              icon: <BarChart3 />,
            },
          ].map(({ label, value, icon }, i) => (
            <div
              key={i}
              className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 bg-blue-500/20 rounded-lg">
                  <span className="text-blue-400">{icon}</span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{label}</h3>
                  <p className="text-xl font-bold text-blue-400">{value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Flows Table */}
        <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-white/20">
            <h2 className="text-xl font-semibold text-white">Product Flows</h2>
          </div>
          <table className="w-full">
            <thead className="bg-white/5">
              <tr>
                {[
                  "Flow",
                  "Status",
                  "Steps",
                  "Usage",
                  "Completion",
                  "Last Updated",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {flows.map((flow) => {
                const cx = getFlowComplexity(flow);
                return (
                  <tr
                    key={flow.id}
                    className="hover:bg-white/5 transition-colors"
                  >
                    {/* Name & desc */}
                    <td className="px-6 py-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">
                            {flow.name}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">
                          {flow.description || "No description"}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500">
                            v{flow.version}
                          </span>
                          <span className={cx.color}>{cx.label}</span>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            flow.isActive ? "bg-green-400" : "bg-gray-400"
                          }`}
                        />
                        <span
                          className={
                            flow.isActive ? "text-green-400" : "text-gray-400"
                          }
                        >
                          {flow.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </td>

                    {/* Steps */}
                    <td className="px-6 py-4">
                      <span className="text-white">
                        {getStepCount(flow)} steps
                      </span>
                    </td>

                    {/* Usage */}
                    <td className="px-6 py-4 text-white">
                      {flow.usageCount?.toLocaleString() || 0}
                    </td>

                    {/* Completion */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-gray-700 rounded-full">
                          <div
                            className="h-full bg-green-400 rounded-full"
                            style={{
                              width: `${flow.completionRate || 0}%`,
                            }}
                          />
                        </div>
                        <span className="text-white">
                          {Math.round(flow.completionRate || 0)}%
                        </span>
                      </div>
                    </td>

                    {/* Last Updated */}
                    <td className="px-6 py-4 text-gray-400">
                      {flow.updatedAt.toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      <button
                        onClick={() => setSelectedFlow(flow)}
                        className="text-gray-400 hover:text-blue-400 transition-colors"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="text-gray-400 hover:text-yellow-400 transition-colors">
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleCloneFlow(flow)}
                        className="text-gray-400 hover:text-green-400 transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleFlow(flow.id, flow.isActive)}
                        disabled={loading}
                        className={`transition-colors disabled:opacity-50 ${
                          flow.isActive
                            ? "text-gray-400 hover:text-yellow-400"
                            : "text-gray-400 hover:text-green-400"
                        }`}
                        title={flow.isActive ? "Deactivate" : "Activate"}
                      >
                        {flow.isActive ? (
                          <Pause className="w-4 h-4" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDeleteFlow(flow.id)}
                        className="text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Flow Details Modal */}
        {selectedFlow && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-white/20 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              {/* Header */}
              <div className="p-6 border-b border-white/20 flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-semibold text-white">
                    {selectedFlow.name}
                  </h3>
                  <p className="text-gray-400">
                    {selectedFlow.description || "No description"}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedFlow(null)}
                  className="text-gray-400 hover:text-white text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Body */}
              <div className="p-6">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {[
                    ["Version", selectedFlow.version],
                    ["Steps", getStepCount(selectedFlow).toString()],
                    [
                      "Usage Count",
                      (selectedFlow.usageCount ?? 0).toLocaleString(),
                    ],
                    [
                      "Completion Rate",
                      Math.round(selectedFlow.completionRate ?? 0) + "%",
                    ],
                  ].map(([title, val], i) => (
                    <div
                      key={i}
                      className="bg-white/5 rounded-lg p-4 flex flex-col"
                    >
                      <span className="text-sm text-gray-300">{title}</span>
                      <span className="text-lg text-white">{val}</span>
                    </div>
                  ))}
                </div>

                {/* Steps List */}
                <div className="mb-6">
                  <h4 className="text-sm text-gray-300 mb-3">Flow Steps</h4>
                  <div className="space-y-3">
                    {Object.values(selectedFlow.steps).map((step, i) => (
                      <div
                        key={step.id}
                        className="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
                      >
                        <div className="w-8 h-8 flex items-center justify-center bg-blue-500/20 rounded-full text-blue-400 font-medium">
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <h5 className="text-white">{step.title}</h5>
                          <p className="text-gray-400 text-sm">
                            Type: {step.stepType}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {step.required && (
                            <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">
                              Required
                            </span>
                          )}
                          <span className="px-2 py-1 bg-gray-500/20 text-gray-400 text-xs rounded">
                            {step.nextSteps.length} next
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                    Edit Flow
                  </button>
                  <button className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleCloneFlow(selectedFlow)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Flow Modal - Improved and Wider */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-white/20 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="p-6 border-b border-white/20 flex justify-between items-center">
                <h3 className="text-xl font-semibold text-white">
                  Create New Flow
                </h3>
                <button
                  onClick={resetCreateModal}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column - Flow Configuration */}
                  <div className="space-y-6">
                    <h4 className="text-lg font-semibold text-white mb-4">
                      Flow Configuration
                    </h4>

                    {/* Flow Name */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Flow Name *
                      </label>
                      <input
                        type="text"
                        value={newFlowName}
                        onChange={(e) => setNewFlowName(e.target.value)}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter flow name"
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Description
                      </label>
                      <textarea
                        rows={3}
                        value={newFlowDesc}
                        onChange={(e) => setNewFlowDesc(e.target.value)}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Describe this flow"
                      />
                    </div>

                    {/* Category Conditions */}
                    <div className="space-y-4">
                      <h5 className="text-md font-medium text-white">
                        Trigger Conditions
                      </h5>

                      {/* Category */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Category *
                        </label>
                        <select
                          value={newCategory}
                          onChange={(e) => {
                            setNewCategory(e.target.value);
                            setNewSubcategory("");
                            setNewSubSubcategory("");
                          }}
                          className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">— select category —</option>
                          {categories.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.key}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Subcategory */}
                      {newCategory && (
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Subcategory (Optional)
                          </label>
                          <select
                            value={newSubcategory}
                            onChange={(e) => {
                              setNewSubcategory(e.target.value);
                              setNewSubSubcategory("");
                            }}
                            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">— any subcategory —</option>
                            {subcategoriesMap[newCategory].map((sc) => (
                              <option key={sc} value={sc}>
                                {sc}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Sub‑subcategory */}
                      {newCategory &&
                        newSubcategory &&
                        Array.isArray(
                          subSubcategoriesMap[newCategory]?.[newSubcategory]
                        ) && (
                          <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                              Sub‑subcategory (Optional)
                            </label>
                            <select
                              value={newSubSubcategory}
                              onChange={(e) =>
                                setNewSubSubcategory(e.target.value)
                              }
                              className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">— any sub‑subcategory —</option>
                              {subSubcategoriesMap[newCategory][
                                newSubcategory
                              ].map((ssc) => (
                                <option key={ssc} value={ssc}>
                                  {ssc}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                    </div>
                  </div>

                  {/* Right Column - Flow Steps */}
                  <div className="space-y-6">
                    <h4 className="text-lg font-semibold text-white mb-4">
                      Flow Steps
                    </h4>

                    {/* Current Flow Order */}
                    <div className="bg-white/5 rounded-lg p-4">
                      <h5 className="text-sm font-medium text-gray-300 mb-3">
                        Current Flow Order
                      </h5>
                      {newScreens.length === 0 ? (
                        <p className="text-gray-400 text-sm">
                          No steps added yet. Select screens below to build your
                          flow.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {newScreens.map((screenId, index) => {
                            const screen = flutterScreens.find(
                              (s) => s.id === screenId
                            );
                            return (
                              <div
                                key={screenId}
                                className="flex items-center gap-3 p-2 bg-white/10 rounded"
                              >
                                <div className="w-6 h-6 flex items-center justify-center bg-blue-500/20 rounded-full text-blue-400 text-xs font-medium">
                                  {index + 1}
                                </div>
                                <span className="flex-1 text-white text-sm">
                                  {screen?.label}
                                </span>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => moveScreen(index, "up")}
                                    disabled={index === 0}
                                    className="text-gray-400 hover:text-white disabled:opacity-30"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => moveScreen(index, "down")}
                                    disabled={index === newScreens.length - 1}
                                    className="text-gray-400 hover:text-white disabled:opacity-30"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => removeScreen(index)}
                                    className="text-gray-400 hover:text-red-400"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Available Screens */}
                    <div>
                      <h5 className="text-sm font-medium text-gray-300 mb-3">
                        Available Screens
                      </h5>
                      <div className="max-h-60 overflow-auto bg-white/5 border border-white/20 rounded-lg p-3">
                        <div className="grid grid-cols-1 gap-2">
                          {flutterScreens.map((screen) => (
                            <button
                              key={screen.id}
                              onClick={() => addScreen(screen.id)}
                              disabled={newScreens.includes(screen.id)}
                              className={`text-left p-2 rounded transition-colors ${
                                newScreens.includes(screen.id)
                                  ? "bg-green-500/20 text-green-400 cursor-not-allowed"
                                  : "bg-white/10 text-white hover:bg-white/20"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-sm">{screen.label}</span>
                                {newScreens.includes(screen.id) && (
                                  <CheckCircle className="w-4 h-4" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex gap-3 p-6 border-t border-white/20">
                <button
                  onClick={resetCreateModal}
                  className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (
                      !newFlowName ||
                      !newCategory ||
                      newScreens.length === 0
                    ) {
                      alert(
                        "Please fill in flow name, category, and add at least one screen"
                      );
                      return;
                    }

                    // Build condition object
                    const condition: Record<string, string[]> = {
                      category: [newCategory],
                    };
                    if (newSubcategory)
                      condition.subcategory = [newSubcategory];
                    if (newSubSubcategory)
                      condition.subsubcategory = [newSubSubcategory];

                    // Unique flow ID
                    const id = `${newFlowName
                      .toLowerCase()
                      .replace(/\s+/g, "_")}_${Date.now()}`;

                    // Assemble steps
                    const steps: Record<string, FlowStep> = {};

                    newScreens.forEach((screenId, index) => {
                      const screen = flutterScreens.find(
                        (s) => s.id === screenId
                      )!;
                      const nextSteps = [];

                      // Add condition to first step
                      if (index === 0) {
                        nextSteps.push({
                          stepId: newScreens[1] || "preview",
                          conditions: condition,
                        });
                      }

                      // Add regular next step (except for last step)
                      if (index < newScreens.length - 1) {
                        nextSteps.push({
                          stepId: newScreens[index + 1],
                        });
                      }

                      steps[screenId] = {
                        id: screenId,
                        stepType: screenId,
                        title: screen.label,
                        required: true,
                        nextSteps,
                      };
                    });

                    // Build the Firestore-ready object
                    const newFlowData = {
                      name: newFlowName,
                      description: newFlowDesc,
                      version: "1.0.0",
                      isActive: false,
                      isDefault: false,
                      startStepId: newScreens[0] || "preview",
                      steps,
                      createdBy: "admin",
                      usageCount: 0,
                      completionRate: 0,
                      createdAt: serverTimestamp(),
                      updatedAt: serverTimestamp(),
                    };

                    // Write to Firestore
                    await setDoc(doc(db, "product_flows", id), newFlowData);

                    // Close modal and reset
                    resetCreateModal();
                  }}
                  disabled={
                    !newFlowName || !newCategory || newScreens.length === 0
                  }
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  Create Flow
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
