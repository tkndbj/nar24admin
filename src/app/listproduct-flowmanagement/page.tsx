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

import { AllInOneCategoryData } from "@/constants/categoryData";
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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-800">
              Product Flow Management
            </h1>
            <p className="text-sm text-gray-500">
              Configure dynamic product listing flows
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={validateAllFlows}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
            >
              <Shield className="w-3.5 h-3.5" /> Validate
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Create
            </button>
          </div>
        </div>

        {/* Validation Warnings */}
        {validationWarnings.length > 0 && (
          <div className="mb-3 p-2 bg-yellow-50 border border-yellow-300 rounded text-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              <h3 className="text-yellow-700 font-medium">Validation Warnings</h3>
            </div>
            <ul className="text-yellow-600 text-xs space-y-0.5 ml-5">
              {validationWarnings.map((warning, i) => (
                <li key={i}>• {warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
          {[
            { label: "Total", value: flows.length, icon: <BarChart3 className="w-4 h-4" /> },
            { label: "Active", value: activeFlowsCount, icon: <CheckCircle className="w-4 h-4" /> },
            { label: "Invalid", value: invalidFlowsCount, icon: <AlertTriangle className="w-4 h-4" />, alert: invalidFlowsCount > 0 },
            { label: "Usage", value: totalUsage, icon: <Users className="w-4 h-4" /> },
            { label: "Completion", value: avgCompletion + "%", icon: <BarChart3 className="w-4 h-4" /> },
          ].map(({ label, value, icon, alert }, i) => (
            <div
              key={i}
              className={`border rounded px-3 py-2 ${
                alert ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={alert ? 'text-red-500' : 'text-gray-400'}>{icon}</span>
                <div>
                  <p className="text-xs text-gray-500">{label}</p>
                  <p className={`text-lg font-semibold ${alert ? 'text-red-600' : 'text-gray-800'}`}>{value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Flows Table */}
        <div className="bg-white border border-gray-200 rounded overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200 bg-gray-50">
            <h2 className="text-sm font-medium text-gray-700">Product Flows</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["Flow", "Status", "Valid", "Steps", "Usage", "Completion", "Updated", "Actions"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {flows.map((flow) => {
                const cx = getFlowComplexity(flow);
                const validation = validateFlow(flow);
                return (
                  <tr key={flow.id} className="hover:bg-gray-50 transition-colors">
                    {/* Name & desc */}
                    <td className="px-3 py-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-800 font-medium text-sm">{flow.name}</span>
                          {flow.isDefault && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-xs rounded">Default</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 truncate max-w-[200px]">{flow.description || "No description"}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-gray-400">v{flow.version}</span>
                          <span className={`text-xs ${cx.color.replace('text-green-400', 'text-green-600').replace('text-yellow-400', 'text-yellow-600').replace('text-red-400', 'text-red-600')}`}>{cx.label}</span>
                        </div>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${flow.isActive ? "bg-green-500" : "bg-gray-300"}`} />
                        <span className={`text-xs ${flow.isActive ? "text-green-600" : "text-gray-400"}`}>
                          {flow.isActive ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </td>

                    {/* Validation Status */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          validation.isValid ? "bg-green-500" : "bg-red-500"
                        }`} />
                        <span className={`text-xs ${validation.isValid ? "text-green-600" : "text-red-600"}`}>
                          {validation.isValid ? "Yes" : "No"}
                        </span>
                        {validation.errors.length > 0 && (
                          <AlertTriangle className="w-3 h-3 text-red-500" />
                        )}
                      </div>
                    </td>

                    {/* Steps */}
                    <td className="px-3 py-2">
                      <span className="text-gray-700 text-xs">{getStepCount(flow)}</span>
                    </td>

                    {/* Usage */}
                    <td className="px-3 py-2 text-gray-700 text-xs">
                      {flow.usageCount?.toLocaleString() || 0}
                    </td>

                    {/* Completion */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 bg-gray-200 rounded-full">
                          <div
                            className="h-full bg-green-500 rounded-full"
                            style={{ width: `${flow.completionRate || 0}%` }}
                          />
                        </div>
                        <span className="text-gray-600 text-xs">{Math.round(flow.completionRate || 0)}%</span>
                      </div>
                    </td>

                    {/* Last Updated */}
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {flow.updatedAt.toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setSelectedFlow(flow)}
                          className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1 text-gray-400 hover:text-yellow-500 transition-colors">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleCloneFlow(flow)}
                          className="p-1 text-gray-400 hover:text-green-500 transition-colors"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleFlow(flow.id, flow.isActive)}
                          disabled={loading}
                          className={`p-1 transition-colors disabled:opacity-50 ${
                            flow.isActive
                              ? "text-gray-400 hover:text-yellow-500"
                              : "text-gray-400 hover:text-green-500"
                          }`}
                          title={flow.isActive ? "Deactivate" : "Activate"}
                        >
                          {flow.isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDeleteFlow(flow.id)}
                          className="p-1 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-30"
                          disabled={flow.isActive}
                          title={flow.isActive ? "Cannot delete active flow" : "Delete flow"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Flow Details Modal */}
        {selectedFlow && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg max-w-xl w-full max-h-[80vh] overflow-y-auto">
              <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-start">
                <div>
                  <h3 className="text-base font-semibold text-gray-800">{selectedFlow.name}</h3>
                  <p className="text-xs text-gray-500">{selectedFlow.description || "No description"}</p>
                  {selectedFlow.validationStatus === 'error' && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs">
                      <strong className="text-red-700">Validation Errors:</strong>
                      <ul className="mt-1 ml-3 text-red-600">
                        {selectedFlow.validationErrors?.map((error, i) => (
                          <li key={i}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSelectedFlow(null)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[
                    ["Version", selectedFlow.version],
                    ["Steps", getStepCount(selectedFlow).toString()],
                    ["Usage", (selectedFlow.usageCount ?? 0).toLocaleString()],
                    ["Completion", Math.round(selectedFlow.completionRate ?? 0) + "%"],
                  ].map(([title, val], i) => (
                    <div key={i} className="bg-gray-50 rounded px-2 py-1.5 text-center">
                      <span className="text-xs text-gray-500 block">{title}</span>
                      <span className="text-sm font-medium text-gray-800">{val}</span>
                    </div>
                  ))}
                </div>

                {/* Steps List */}
                <div className="mb-4">
                  <h4 className="text-xs font-medium text-gray-500 mb-2">Flow Steps</h4>
                  <div className="space-y-1.5">
                    {Object.values(selectedFlow.steps).map((step, i) => (
                      <div key={step.id} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded">
                        <div className="w-5 h-5 flex items-center justify-center bg-blue-100 rounded-full text-blue-600 text-xs font-medium">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="text-sm text-gray-800 truncate">{step.title}</h5>
                          <p className="text-xs text-gray-400">{step.stepType}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {step.required && (
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded">Req</span>
                          )}
                          <span className="px-1.5 py-0.5 bg-gray-200 text-gray-500 text-xs rounded">
                            {step.nextSteps.length}→
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button className="flex-1 px-3 py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors">
                    Edit
                  </button>
                  <button className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors">
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleCloneFlow(selectedFlow)}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Flow Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-base font-semibold text-gray-800">Create New Flow</h3>
                <button onClick={resetCreateModal} className="text-gray-400 hover:text-gray-600 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Left Column - Flow Configuration */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">Configuration</h4>

                    {/* Flow Name */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Flow Name *
                      </label>
                      <input
                        type="text"
                        value={newFlowName}
                        onChange={(e) => setNewFlowName(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter unique flow name"
                        maxLength={50}
                      />
                      {flows.some(f => f.name.toLowerCase() === newFlowName.toLowerCase().trim()) && (
                        <p className="text-red-500 text-xs mt-0.5">Name already exists</p>
                      )}
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                      <textarea
                        rows={2}
                        value={newFlowDesc}
                        onChange={(e) => setNewFlowDesc(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Describe this flow"
                        maxLength={200}
                      />
                    </div>

                    {/* Category Conditions */}
                    <div className="space-y-2">
                      <h5 className="text-xs font-medium text-gray-500">Trigger Conditions</h5>

                      {/* Category */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Category *</label>
                        <select
                          value={newCategory}
                          onChange={(e) => {
                            setNewCategory(e.target.value);
                            setNewSubcategory("");
                            setNewSubSubcategory("");
                          }}
                          className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">— select category —</option>
                          {AllInOneCategoryData.kCategories.map((c) => (
                            <option key={c.key} value={c.key}>{c.key}</option>
                          ))}
                        </select>
                      </div>

                      {/* Subcategory */}
                      {newCategory && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Subcategory
                          </label>
                          <select
                            value={newSubcategory}
                            onChange={(e) => {
                              setNewSubcategory(e.target.value);
                              setNewSubSubcategory("");
                            }}
                            className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">— any —</option>
                            {AllInOneCategoryData.kSubcategories[newCategory]?.map((sc) => (
                              <option key={sc} value={sc}>{sc}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Sub‑subcategory */}
                      {newCategory && newSubcategory && Array.isArray(AllInOneCategoryData.kSubSubcategories[newCategory]?.[newSubcategory]) && (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Sub‑subcategory
                          </label>
                          <select
                            value={newSubSubcategory}
                            onChange={(e) => setNewSubSubcategory(e.target.value)}
                            className="w-full px-2.5 py-1.5 text-sm bg-white border border-gray-300 rounded text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">— any —</option>
                            {AllInOneCategoryData.kSubSubcategories[newCategory][newSubcategory].map((ssc) => (
                              <option key={ssc} value={ssc}>{ssc}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column - Flow Steps */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">Flow Steps</h4>

                    {/* Current Flow Order */}
                    <div className="bg-gray-50 rounded p-2.5">
                      <h5 className="text-xs font-medium text-gray-500 mb-2">Current Order</h5>
                      {newScreens.length === 0 ? (
                        <p className="text-gray-400 text-xs">
                          No steps added. Select screens below.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {newScreens.map((screenId, index) => {
                            const screen = flutterScreens.find((s) => s.id === screenId);
                            return (
                              <div key={screenId} className="flex items-center gap-2 px-2 py-1 bg-white border border-gray-200 rounded">
                                <div className="w-5 h-5 flex items-center justify-center bg-blue-100 rounded-full text-blue-600 text-xs font-medium">
                                  {index + 1}
                                </div>
                                <span className="flex-1 text-gray-700 text-xs truncate">{screen?.label}</span>
                                <div className="flex gap-0.5">
                                  <button
                                    onClick={() => moveScreen(index, "up")}
                                    disabled={index === 0}
                                    className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                  >
                                    <ArrowUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => moveScreen(index, "down")}
                                    disabled={index === newScreens.length - 1}
                                    className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                  >
                                    <ArrowDown className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => removeScreen(index)}
                                    className="p-0.5 text-gray-400 hover:text-red-500"
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
                      <h5 className="text-xs font-medium text-gray-500 mb-1.5">Available Screens</h5>
                      <div className="max-h-48 overflow-auto bg-gray-50 border border-gray-200 rounded p-2">
                        <div className="grid grid-cols-1 gap-1">
                          {flutterScreens.map((screen) => (
                            <button
                              key={screen.id}
                              onClick={() => addScreen(screen.id)}
                              disabled={newScreens.includes(screen.id)}
                              className={`text-left px-2 py-1 rounded text-xs transition-colors ${
                                newScreens.includes(screen.id)
                                  ? "bg-green-100 text-green-600 cursor-not-allowed"
                                  : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-100"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span>{screen.label}</span>
                                {newScreens.includes(screen.id) && <CheckCircle className="w-3 h-3" />}
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
              <div className="flex gap-2 px-4 py-3 border-t border-gray-200 bg-gray-50">
                <button
                  onClick={resetCreateModal}
                  className="flex-1 px-3 py-1.5 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded transition-colors"
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
                  className="flex-1 px-3 py-1.5 text-sm bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded transition-colors"
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