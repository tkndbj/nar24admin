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
  writeBatch,  
} from "firebase/firestore";
import {
  Play,
  Pause,
  Edit3,
  Copy,
  Trash2,
  Plus,
  Download,  
  Eye,
  CheckCircle,
  Users,
  BarChart3,
  ArrowUp,
  ArrowDown,
  X,
  AlertTriangle,
  Shield,
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
  // NEW: Added reliability fields
  lastValidated?: Date;
  validationStatus?: 'valid' | 'warning' | 'error';
  validationErrors?: string[];
  flowHash?: string; // To detect unintended changes
}

const flowsCol = collection(
  db,
  "product_flows"
) as CollectionReference<ProductListingFlow>;

export default function FlowManagementPage() {
  const [flows, setFlows] = useState<ProductListingFlow[]>([]);
  const [selectedFlow, setSelectedFlow] = useState<ProductListingFlow | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  // Create‐modal state:
  const [newCategory, setNewCategory] = useState("");
  const [newSubcategory, setNewSubcategory] = useState("");
  const [newSubSubcategory, setNewSubSubcategory] = useState("");
  const [newFlowName, setNewFlowName] = useState("");
  const [newFlowDesc, setNewFlowDesc] = useState("");
  const [newScreens, setNewScreens] = useState<string[]>([]);

  // FIXED: Generate deterministic flow hash for integrity checking
  const generateFlowHash = (flow: Partial<ProductListingFlow>): string => {
    const hashData = {
      name: flow.name,
      startStepId: flow.startStepId,
      steps: flow.steps,
      version: flow.version
    };
    
    try {
      // Convert to UTF-8 bytes first, then to base64
      const jsonString = JSON.stringify(hashData);
      const utf8Bytes = new TextEncoder().encode(jsonString);
      const binaryString = String.fromCharCode.apply(null, Array.from(utf8Bytes));
      return btoa(binaryString).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
    } catch (error) {
      // Fallback if btoa still fails
      console.warn('Hash generation failed, using fallback:', error);
      return `fallback_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
    }
  };

  // FIXED: Comprehensive flow validation
  const validateFlow = (flow: ProductListingFlow): { isValid: boolean; errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!flow.name) errors.push("Flow name is required");
    if (!flow.startStepId) errors.push("Start step ID is required");
    if (!flow.steps || Object.keys(flow.steps).length === 0) {
      errors.push("Flow must have at least one step");
    }

    // Validate step structure
    if (flow.steps) {
      Object.entries(flow.steps).forEach(([stepId, step]) => {
        if (!step.id) errors.push(`Step ${stepId} missing id`);
        if (!step.title) warnings.push(`Step ${stepId} missing title`);
        if (!step.stepType) errors.push(`Step ${stepId} missing stepType`);
        
        // Validate step exists in our screen definitions
        const screenExists = flutterScreens.some(s => s.id === step.stepType);
        if (!screenExists && step.stepType !== 'preview') {
          errors.push(`Step ${stepId} references unknown screen type: ${step.stepType}`);
        }

        // Validate nextSteps
        step.nextSteps?.forEach((nextStep, index) => {
          if (!nextStep.stepId) {
            errors.push(`Step ${stepId} nextStep[${index}] missing stepId`);
          } else if (nextStep.stepId !== 'preview' && !flow.steps[nextStep.stepId]) {
            errors.push(`Step ${stepId} references non-existent next step: ${nextStep.stepId}`);
          }
        });
      });

      // Check for circular references
      const visited = new Set<string>();
      const checkCircular = (stepId: string, path: string[]): boolean => {
        if (path.includes(stepId)) {
          errors.push(`Circular reference detected: ${path.join(' -> ')} -> ${stepId}`);
          return true;
        }
        if (visited.has(stepId)) return false;
        
        visited.add(stepId);
        const step = flow.steps[stepId];
        if (step) {
          for (const nextStep of step.nextSteps) {
            if (nextStep.stepId !== 'preview' && checkCircular(nextStep.stepId, [...path, stepId])) {
              return true;
            }
          }
        }
        return false;
      };

      if (flow.startStepId !== 'preview') {
        checkCircular(flow.startStepId, []);
      }
    }

    // Check start step exists
    if (flow.startStepId && flow.startStepId !== 'preview' && !flow.steps[flow.startStepId]) {
      errors.push(`Start step ${flow.startStepId} does not exist in steps`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  };

  // FIXED: Batch validation of all flows
  const validateAllFlows = async () => {
    const warnings: string[] = [];
    const batch = writeBatch(db);
    let hasUpdates = false;

    for (const flow of flows) {
      const validation = validateFlow(flow);
      const currentHash = generateFlowHash(flow);
      
      // Check if flow was unexpectedly modified
      if (flow.flowHash && flow.flowHash !== currentHash) {
        warnings.push(`Flow "${flow.name}" has been unexpectedly modified!`);
      }

      // Update validation status
      if (validation.isValid !== (flow.validationStatus === 'valid') || 
          JSON.stringify(validation.errors) !== JSON.stringify(flow.validationErrors || [])) {
        
        const flowRef = doc(db, "product_flows", flow.id);
        batch.update(flowRef, {
          validationStatus: validation.isValid ? 'valid' : 'error',
          validationErrors: validation.errors,
          lastValidated: serverTimestamp(),
          flowHash: currentHash,
          updatedAt: serverTimestamp(),
        });
        hasUpdates = true;
      }
    }

    if (hasUpdates) {
      await batch.commit();
    }
    
    setValidationWarnings(warnings);
  };

  // Subscribe to flows with enhanced error handling
  useEffect(() => {
    const unsub = onSnapshot(
      flowsCol, 
      (snap) => {
        const arr = snap.docs.map((doc) => {
          const data = doc.data();
          return {
            ...data,
            id: doc.id,
            createdAt: (data.createdAt as unknown as Timestamp)?.toDate() ?? new Date(),
            updatedAt: (data.updatedAt as unknown as Timestamp)?.toDate() ?? new Date(),
            lastValidated: (data.lastValidated as unknown as Timestamp)?.toDate(),
          } as ProductListingFlow;
        });
        setFlows(arr);
      },
      (error) => {
        console.error("Error subscribing to flows:", error);
        // Could show user notification here
      }
    );
    return unsub;
  }, []);

  // Validate flows on load and periodically
  useEffect(() => {
    if (flows.length > 0) {
      validateAllFlows();
    }
  }, [flows]);

  // FIXED: Enhanced toggle with validation
  const handleToggleFlow = async (flowId: string, currentState: boolean) => {
    setLoading(true);
    try {
      const flow = flows.find(f => f.id === flowId);
      if (!flow) throw new Error("Flow not found");

      // Validate before activating
      if (!currentState) {
        const validation = validateFlow(flow);
        if (!validation.isValid) {
          alert(`Cannot activate flow due to validation errors:\n${validation.errors.join('\n')}`);
          return;
        }
      }

      await updateDoc(doc(db, "product_flows", flowId), {
        isActive: !currentState,
        updatedAt: serverTimestamp(),
        lastValidated: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error toggling flow:", error);
      alert("Error updating flow status");
    } finally {
      setLoading(false);
    }
  };

  // FIXED: Enhanced clone with validation and unique naming
  const handleCloneFlow = async (flow: ProductListingFlow) => {
    try {
      const validation = validateFlow(flow);
      if (!validation.isValid) {
        if (!confirm(`Original flow has validation errors. Clone anyway?\nErrors: ${validation.errors.join('\n')}`)) {
          return;
        }
      }

      // Generate unique name
      const baseName = flow.name.replace(/ \(Copy( \d+)?\)$/, '');
      const existingCopies = flows.filter(f => f.name.startsWith(baseName + ' (Copy'));
      const copyNumber = existingCopies.length > 0 ? existingCopies.length + 1 : '';
      const newName = `${baseName} (Copy${copyNumber ? ' ' + copyNumber : ''})`;

      const id = `${baseName.toLowerCase().replace(/\s+/g, "_")}_copy_${Date.now()}`;
      
      const clonedFlow = {
        ...flow,
        id,
        name: newName,
        isActive: false,
        isDefault: false,
        usageCount: 0,
        completionRate: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastValidated: serverTimestamp(),
        validationStatus: validation.isValid ? 'valid' : 'error' as const,
        validationErrors: validation.errors,
        flowHash: generateFlowHash(flow),
      };

      await setDoc(doc(db, "product_flows", id), clonedFlow);
    } catch (error) {
      console.error("Error cloning flow:", error);
      alert("Error cloning flow");
    }
  };

  // FIXED: Enhanced delete with safety checks
  const handleDeleteFlow = async (flowId: string) => {
    const flow = flows.find(f => f.id === flowId);
    if (!flow) return;

    // Prevent deletion of active flows
    if (flow.isActive) {
      alert("Cannot delete an active flow. Please deactivate it first.");
      return;
    }

    // Prevent deletion of flows with high usage
    if ((flow.usageCount || 0) > 100) {
      if (!confirm(`This flow has high usage (${flow.usageCount} uses). Are you sure you want to delete it?`)) {
        return;
      }
    }

    if (!confirm(`Delete flow "${flow.name}"? This action cannot be undone.`)) return;
    
    try {
      await deleteDoc(doc(db, "product_flows", flowId));
    } catch (error) {
      console.error("Error deleting flow:", error);
      alert("Error deleting flow");
    }
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

  // FIXED: Enhanced flow creation with better validation
  const handleCreateFlow = async () => {
    // Validation
    if (!newFlowName?.trim()) {
      alert("Flow name is required");
      return;
    }

    if (!newCategory) {
      alert("Category is required");
      return;
    }

    if (newScreens.length === 0) {
      alert("At least one screen must be added");
      return;
    }

    // Check for duplicate names
    if (flows.some(f => f.name.toLowerCase() === newFlowName.toLowerCase().trim())) {
      alert("A flow with this name already exists");
      return;
    }

    try {
      // Build condition object
      const condition: Record<string, string[]> = {
        category: [newCategory],
      };
      if (newSubcategory) condition.subcategory = [newSubcategory];
      if (newSubSubcategory) condition.subsubcategory = [newSubSubcategory];

      // FIXED: Generate deterministic, collision-resistant ID
      const timestamp = Date.now();
      const sanitizedName = newFlowName.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const id = `${sanitizedName}_${timestamp}`;

      // FIXED: Build robust step structure
      const steps: Record<string, FlowStep> = {};

      newScreens.forEach((screenId, index) => {
        const screen = flutterScreens.find((s) => s.id === screenId);
        if (!screen) {
          throw new Error(`Unknown screen: ${screenId}`);
        }

        const nextSteps = [];

        // Add condition only to the start step
        if (index === 0) {
          // First step should point to second step (or preview if only one step)
          const nextStepId = newScreens[1] || "preview";
          nextSteps.push({
            stepId: nextStepId,
            conditions: condition,
          });
        } else {
          // Non-first steps point to next step without conditions
          if (index < newScreens.length - 1) {
            nextSteps.push({
              stepId: newScreens[index + 1],
            });
          } else {
            // Last step points to preview
            nextSteps.push({
              stepId: "preview",
            });
          }
        }

        steps[screenId] = {
          id: screenId,
          stepType: screenId,
          title: screen.label,
          required: true,
          nextSteps,
        };
      });

      // Build the flow object
      const newFlowData = {
        name: newFlowName.trim(),
        description: newFlowDesc.trim() || `Auto-generated flow for ${newCategory}`,
        version: "1.0.0",
        isActive: false, // Start as inactive for safety
        isDefault: false,
        startStepId: newScreens[0],
        steps,
        createdBy: "admin",
        usageCount: 0,
        completionRate: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastValidated: serverTimestamp(),
        validationStatus: "valid" as const,
        validationErrors: [],
      };

      // Add flow hash for integrity checking
      const flowHash = generateFlowHash(newFlowData as unknown as Partial<ProductListingFlow>);
      (newFlowData as unknown as Record<string, unknown>).flowHash = flowHash;

      // Validate before saving
      const tempFlow = { 
        ...newFlowData, 
        id, 
        createdAt: new Date(), 
        updatedAt: new Date(),
        lastValidated: new Date(),
      } as ProductListingFlow;
      
      const validation = validateFlow(tempFlow);
      if (!validation.isValid) {
        alert(`Flow validation failed:\n${validation.errors.join('\n')}`);
        return;
      }

      // Write to Firestore with error handling
      await setDoc(doc(db, "product_flows", id), newFlowData);

      // Success feedback
      alert(`Flow "${newFlowName}" created successfully!`);
      resetCreateModal();

    } catch (error) {
      console.error("Error creating flow:", error);
      alert(`Error creating flow: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const activeFlowsCount = flows.filter((f) => f.isActive).length;
  const totalUsage = flows.reduce((s, f) => s + (f.usageCount || 0), 0);
  const avgCompletion = flows.length > 0
    ? Math.round(flows.reduce((s, f) => s + (f.completionRate || 0), 0) / flows.length)
    : 0;
  const invalidFlowsCount = flows.filter(f => f.validationStatus === 'error').length;

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
              onClick={validateAllFlows}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Shield className="w-4 h-4" /> Validate All
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Create Flow
            </button>
          </div>
        </div>

        {/* Validation Warnings */}
        {validationWarnings.length > 0 && (
          <div className="mb-6 p-4 bg-yellow-900/50 border border-yellow-600 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              <h3 className="text-yellow-400 font-semibold">Validation Warnings</h3>
            </div>
            <ul className="text-yellow-300 text-sm space-y-1">
              {validationWarnings.map((warning, i) => (
                <li key={i}>• {warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
          {[
            { label: "Total Flows", value: flows.length, icon: <BarChart3 /> },
            { label: "Active Flows", value: activeFlowsCount, icon: <CheckCircle /> },
            { label: "Invalid Flows", value: invalidFlowsCount, icon: <AlertTriangle />, alert: invalidFlowsCount > 0 },
            { label: "Total Usage", value: totalUsage, icon: <Users /> },
            { label: "Avg Completion", value: avgCompletion + "%", icon: <BarChart3 /> },
          ].map(({ label, value, icon, alert }, i) => (
            <div
              key={i}
              className={`backdrop-blur-xl border rounded-xl p-4 ${
                alert ? 'bg-red-900/20 border-red-600' : 'bg-white/10 border-white/20'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                  alert ? 'bg-red-500/20' : 'bg-blue-500/20'
                }`}>
                  <span className={alert ? 'text-red-400' : 'text-blue-400'}>{icon}</span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">{label}</h3>
                  <p className={`text-xl font-bold ${alert ? 'text-red-400' : 'text-blue-400'}`}>{value}</p>
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
                {["Flow", "Status", "Validation", "Steps", "Usage", "Completion", "Last Updated", "Actions"].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {flows.map((flow) => {
                const cx = getFlowComplexity(flow);
                const validation = validateFlow(flow);
                return (
                  <tr key={flow.id} className="hover:bg-white/5 transition-colors">
                    {/* Name & desc */}
                    <td className="px-6 py-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium">{flow.name}</span>
                          {flow.isDefault && (
                            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">Default</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">{flow.description || "No description"}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-500">v{flow.version}</span>
                          <span className={cx.color}>{cx.label}</span>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${flow.isActive ? "bg-green-400" : "bg-gray-400"}`} />
                        <span className={flow.isActive ? "text-green-400" : "text-gray-400"}>
                          {flow.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </td>

                    {/* Validation Status */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${
                          validation.isValid ? "bg-green-400" : "bg-red-400"
                        }`} />
                        <span className={validation.isValid ? "text-green-400" : "text-red-400"}>
                          {validation.isValid ? "Valid" : "Invalid"}
                        </span>
                        {validation.errors.length > 0 && (
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                        )}
                      </div>
                    </td>

                    {/* Steps */}
                    <td className="px-6 py-4">
                      <span className="text-white">{getStepCount(flow)} steps</span>
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
                            style={{ width: `${flow.completionRate || 0}%` }}
                          />
                        </div>
                        <span className="text-white">{Math.round(flow.completionRate || 0)}%</span>
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
                        {flow.isActive ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleDeleteFlow(flow.id)}
                        className="text-gray-400 hover:text-red-400 transition-colors"
                        disabled={flow.isActive}
                        title={flow.isActive ? "Cannot delete active flow" : "Delete flow"}
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
              <div className="p-6 border-b border-white/20 flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-semibold text-white">{selectedFlow.name}</h3>
                  <p className="text-gray-400">{selectedFlow.description || "No description"}</p>
                  {selectedFlow.validationStatus === 'error' && (
                    <div className="mt-2 p-2 bg-red-900/50 border border-red-600 rounded text-red-300 text-sm">
                      <strong>Validation Errors:</strong>
                      <ul className="mt-1 ml-4">
                        {selectedFlow.validationErrors?.map((error, i) => (
                          <li key={i}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedFlow(null)}
                  className="text-gray-400 hover:text-white text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {[
                    ["Version", selectedFlow.version],
                    ["Steps", getStepCount(selectedFlow).toString()],
                    ["Usage Count", (selectedFlow.usageCount ?? 0).toLocaleString()],
                    ["Completion Rate", Math.round(selectedFlow.completionRate ?? 0) + "%"],
                  ].map(([title, val], i) => (
                    <div key={i} className="bg-white/5 rounded-lg p-4 flex flex-col">
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
                      <div key={step.id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                        <div className="w-8 h-8 flex items-center justify-center bg-blue-500/20 rounded-full text-blue-400 font-medium">
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <h5 className="text-white">{step.title}</h5>
                          <p className="text-gray-400 text-sm">Type: {step.stepType}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {step.required && (
                            <span className="px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded">Required</span>
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

        {/* Create Flow Modal - Enhanced with Better Validation */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-slate-800 border border-white/20 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-white/20 flex justify-between items-center">
                <h3 className="text-xl font-semibold text-white">Create New Flow</h3>
                <button onClick={resetCreateModal} className="text-gray-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Left Column - Flow Configuration */}
                  <div className="space-y-6">
                    <h4 className="text-lg font-semibold text-white mb-4">Flow Configuration</h4>

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
                        placeholder="Enter unique flow name"
                        maxLength={50}
                      />
                      {flows.some(f => f.name.toLowerCase() === newFlowName.toLowerCase().trim()) && (
                        <p className="text-red-400 text-xs mt-1">A flow with this name already exists</p>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Description</label>
                      <textarea
                        rows={3}
                        value={newFlowDesc}
                        onChange={(e) => setNewFlowDesc(e.target.value)}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Describe this flow"
                        maxLength={200}
                      />
                    </div>

                    {/* Category Conditions */}
                    <div className="space-y-4">
                      <h5 className="text-md font-medium text-white">Trigger Conditions</h5>

                      {/* Category */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Category *</label>
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
                            <option key={c.key} value={c.key}>{c.key}</option>
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
                              <option key={sc} value={sc}>{sc}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Sub‑subcategory */}
                      {newCategory && newSubcategory && Array.isArray(subSubcategoriesMap[newCategory]?.[newSubcategory]) && (
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Sub‑subcategory (Optional)
                          </label>
                          <select
                            value={newSubSubcategory}
                            onChange={(e) => setNewSubSubcategory(e.target.value)}
                            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">— any sub‑subcategory —</option>
                            {subSubcategoriesMap[newCategory][newSubcategory].map((ssc) => (
                              <option key={ssc} value={ssc}>{ssc}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column - Flow Steps */}
                  <div className="space-y-6">
                    <h4 className="text-lg font-semibold text-white mb-4">Flow Steps</h4>

                    {/* Current Flow Order */}
                    <div className="bg-white/5 rounded-lg p-4">
                      <h5 className="text-sm font-medium text-gray-300 mb-3">Current Flow Order</h5>
                      {newScreens.length === 0 ? (
                        <p className="text-gray-400 text-sm">
                          No steps added yet. Select screens below to build your flow.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {newScreens.map((screenId, index) => {
                            const screen = flutterScreens.find((s) => s.id === screenId);
                            return (
                              <div key={screenId} className="flex items-center gap-3 p-2 bg-white/10 rounded">
                                <div className="w-6 h-6 flex items-center justify-center bg-blue-500/20 rounded-full text-blue-400 text-xs font-medium">
                                  {index + 1}
                                </div>
                                <span className="flex-1 text-white text-sm">{screen?.label}</span>
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
                      <h5 className="text-sm font-medium text-gray-300 mb-3">Available Screens</h5>
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
                                {newScreens.includes(screen.id) && <CheckCircle className="w-4 h-4" />}
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
                  onClick={handleCreateFlow}
                  disabled={
                    !newFlowName?.trim() || 
                    !newCategory || 
                    newScreens.length === 0 ||
                    flows.some(f => f.name.toLowerCase() === newFlowName.toLowerCase().trim())
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